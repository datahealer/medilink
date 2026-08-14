import { NextRequest, NextResponse } from "next/server";
import { consultationTotal, feeForType } from "@medilink/shared";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { serverErrorResponse } from "@/lib/http/serverError";
import {
  ThawaniCheckoutConfigError,
  assertCheckoutConfigured,
  buildCheckoutUrl,
} from "@/lib/thawani/checkoutConfig";

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabaseAuth);

    const supabase = createServiceSupabase();

    // Refuse a misconfigured deploy BEFORE creating a Thawani session, so we never leave an
    // orphan session behind for a URL we cannot build. See lib/thawani/checkoutConfig.ts.
    assertCheckoutConfigured(process.env);

    const body = await req.json();
    // BP-4 (C1 fix): the client-sent `amount` is IGNORED — the charged amount is
    // derived server-side from the doctor's fee + VAT below. Only the id is required.
    const { appointment_id } = body;

    if (!appointment_id) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // 🔎 Appointment (+ doctor fees & type → server-derived amount)
    const { data: appointment } = await supabaseAuth
      .from("appointments")
      .select("id, patient_id, facility_id, is_emergency, status, type, doctors ( fees )")
      .eq("id", appointment_id)
      .single();

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // 💰 Server-derived amount: doctor fee for the appointment type + 5% VAT.
    const fee = feeForType(
      (appointment.doctors as { fees?: unknown } | null)?.fees,
      appointment.type as string | null
    );
    const { total: amount } = consultationTotal(fee);

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Consultation fee unavailable" }, { status: 400 });
    }

    // 🛡️ Guard: block payment for emergency appointments not yet approved by staff
    if (appointment.is_emergency && (appointment.status as string) !== "approved") {
      return NextResponse.json(
        { error: "Emergency appointment must be approved by staff before payment" },
        { status: 400 }
      );
    }

    // 🛡️ Guard: block if already paid
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("status")
      .eq("appointment_id", appointment_id)
      .maybeSingle();

    if (existingPayment?.status === "paid") {
      return NextResponse.json(
        { error: "Payment already completed for this appointment" },
        { status: 400 }
      );
    }

    // 🔥 Create Thawani Session
    const thawaniRes = await fetch(
      `${process.env.THAWANI_BASE_URL}/checkout/session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "thawani-api-key": process.env.THAWANI_SECRET_KEY!,
        },
        body: JSON.stringify({
          client_reference_id: appointment_id,
          mode: "payment",
          products: [
            {
              name: "Doctor Consultation",
              quantity: 1,
              unit_amount: amount * 1000,
            },
          ],
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-success?appointment_id=${appointment_id}`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-cancel?appointment_id=${appointment_id}`,
        }),
      }
    );

    const thawaniData = await thawaniRes.json();

    if (!thawaniRes.ok) {
      console.error("Thawani error:", thawaniData);
      return NextResponse.json({ error: "Thawani failed" }, { status: 500 });
    }

    const sessionId = thawaniData?.data?.session_id;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID missing" }, { status: 500 });
    }

    // Hosted-checkout redirect URL. Validated, never interpolated blind — see
    // lib/thawani/checkoutConfig.ts for why `?key=undefined` and a silent UAT fallback
    // both reached production as an unexplained "404 Oops!" on Thawani's payment page.
    // Throws ThawaniCheckoutConfigError, handled below as a 503.
    const checkoutUrl = buildCheckoutUrl(process.env, sessionId);

    // 💾 UPSERT PAYMENT
    const { error: insertError } = await supabase
      .from("payments")
      .upsert(
        {
          appointment_id,
          // payments.patient_id FK → profiles(id) (the auth uid). Keep user.id; the
          // patient read is enabled by the corrected RLS policy (patient_id = auth.uid()),
          // see migration 20260630_fix_payments_patient_read_rls.sql.
          patient_id: user.id,
          facility_id: appointment.facility_id ?? "",
          amount,
          currency: "OMR",
          status: "pending",
          gateway: "thawani",
          gateway_session_id: sessionId,
        },
        { onConflict: "appointment_id" }
      );

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl });

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;

    // Misconfiguration, not a patient error. The problem list names only variables and
    // hosts (never a credential) and goes to the SERVER log, where an operator can act on
    // it; the client gets a generic message because there is nothing it can do but retry
    // later. 503 rather than 500: the service is unavailable until someone fixes config.
    if (err instanceof ThawaniCheckoutConfigError) {
      console.error("[payments/checkout] misconfigured:", err.problems.join("; "));
      return NextResponse.json(
        { error: "Payments are temporarily unavailable.", reason: "payment_unconfigured" },
        { status: 503 }
      );
    }

    console.error("Checkout error:", err);
    return serverErrorResponse(err, "payments/checkout");
  }
}