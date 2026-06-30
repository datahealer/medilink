import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

type Service = ReturnType<typeof createServiceSupabase>;

/** Consultation fee for the appointment's type from the doctor's fees JSONB. */
function feeForType(fees: unknown, type: string | null): number | null {
  if (fees && typeof fees === "object") {
    const f = fees as Record<string, unknown>;
    const v = (type === "online" ? f.online : f.in_person) ?? f.in_person ?? f.online;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(fees);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the confirmation recap with the service role, so it does not depend on the
 * patient's RLS access to `payments`. Shapes match the mobile `Payment` domain type.
 */
async function buildRecap(service: Service, appointmentId: string) {
  const { data: p } = await service
    .from("payments")
    .select("id, amount, currency, status, payment_method, gateway, gateway_ref, invoice_url, created_at")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (!p) return null;

  const { data: a } = await service
    .from("appointments")
    .select("id, reference_number, slot_date, slot_start, type, doctor:doctor_id ( full_name, specialty, fees ), facility:facility_id ( name )")
    .eq("id", appointmentId)
    .maybeSingle();

  const doctor = (a as { doctor?: { full_name?: string; specialty?: string; fees?: unknown } } | null)?.doctor ?? null;
  const facility = (a as { facility?: { name?: string } } | null)?.facility ?? null;

  return {
    id: p.id,
    amount: p.amount ?? null,
    currency: p.currency ?? null,
    status: p.status ?? null,
    reference: p.gateway_ref ?? p.id ?? null,
    method: p.payment_method ?? p.gateway ?? null,
    invoiceUrl: p.invoice_url ?? null,
    createdAt: p.created_at ?? null,
    appointment: a
      ? {
          id: a.id,
          reference_number: a.reference_number ?? null,
          slot_date: a.slot_date ?? null,
          slot_start: a.slot_start ?? null,
          doctor: doctor ? { full_name: doctor.full_name ?? null, specialty: doctor.specialty ?? null } : null,
          facility: facility ? { name: facility.name ?? null } : null,
          fee_omr: doctor ? feeForType(doctor.fees, a.type ?? null) : null,
        }
      : null,
  };
}

/**
 * Verify a payment on return from Thawani's hosted checkout.
 *
 * The webhook is the production source of truth, but it cannot reach a local/LAN
 * backend during development, and the hosted-checkout redirect can land before the
 * webhook arrives. When the mobile app returns from Thawani it calls this endpoint,
 * which asks Thawani for the session's authoritative payment status and, if paid,
 * finalizes the same way the webhook does (idempotent). It returns the recap with the
 * service role, so the confirmation screen does not depend on the patient's RLS read
 * of `payments`. It never trusts the client — status comes from Thawani.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createApiSupabaseClient(req);
    await getAal2UserOrThrow(supabaseAuth);

    const { appointment_id } = await req.json();
    if (!appointment_id) {
      return NextResponse.json({ error: "Missing appointment_id" }, { status: 400 });
    }

    // Ownership: the RLS-scoped client only returns the appointment if it's the caller's.
    const { data: appt } = await supabaseAuth
      .from("appointments")
      .select("id")
      .eq("id", appointment_id)
      .maybeSingle();
    if (!appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const service = createServiceSupabase();
    const { data: payment } = await service
      .from("payments")
      .select("id, status, gateway_session_id")
      .eq("appointment_id", appointment_id)
      .maybeSingle();

    if (!payment) return NextResponse.json({ status: "none", payment: null });

    if (payment.status !== "paid" && payment.gateway_session_id) {
      // Authoritative check against Thawani.
      const tRes = await fetch(
        `${process.env.THAWANI_BASE_URL}/checkout/session/${payment.gateway_session_id}`,
        { headers: { "thawani-api-key": process.env.THAWANI_SECRET_KEY! } }
      );
      const tJson = await tRes.json();
      if (tJson?.data?.payment_status === "paid") {
        await service
          .from("payments")
          .update({
            status: "paid",
            gateway_ref: tJson?.data?.invoice ?? null,
            gateway_response: tJson?.data ?? tJson,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
        await service.from("appointments").update({ status: "confirmed" }).eq("id", appointment_id);
      }
    }

    const recap = await buildRecap(service, appointment_id);
    return NextResponse.json({ status: recap?.status ?? payment.status ?? "pending", payment: recap });
  } catch (err: unknown) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    const message = err instanceof Error ? err.message : "verify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
