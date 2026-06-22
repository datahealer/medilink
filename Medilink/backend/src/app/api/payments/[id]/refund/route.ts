import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const serviceSupabase = createServiceSupabase();
    const user = await getAal2UserOrThrow(supabase);

    const { id } = await params;
    const paymentId = id;

    // 🔎 Fetch payment
    const { data: payment } = await supabase
      .from("payments")
      .select(`
        *,
        appointments(slot_date, slot_start, cancelled_by)
      `)
      .eq("id", paymentId)
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "paid") {
      return NextResponse.json({ error: "Payment not eligible for refund" }, { status: 400 });
    }

    // ❌ Prevent duplicate
    const { data: existing } = await supabase
      .from("refunds")
      .select("id")
      .eq("payment_id", payment.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Refund already exists" }, { status: 400 });
    }

    const appointment = payment.appointments;

    const appointmentTime = new Date(
      `${appointment.slot_date}T${appointment.slot_start}`
    );

    const diffHours =
      (appointmentTime.getTime() - Date.now()) / (1000 * 60 * 60);

    const { data: settings } = await supabase
      .from("facility_settings")
      .select("refund_percent")
      .eq("facility_id", payment.facility_id)
      .single();

    const percent = settings?.refund_percent ?? 50;

    let refundAmount = 0;

    if (appointment.cancelled_by === "facility") {
      refundAmount = payment.amount;
    } else {
      refundAmount =
        diffHours > 24
          ? payment.amount
          : (payment.amount * percent) / 100;
    }

    // 💳 REAL THAWANI REFUND
    const thawaniRes = await fetch(
      `${process.env.THAWANI_BASE_URL}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "thawani-api-key": process.env.THAWANI_SECRET_KEY!,
        },
        body: JSON.stringify({
          session_id: payment.gateway_session_id,
          amount: refundAmount * 1000,
        }),
      }
    );

    const thawaniData = await thawaniRes.json();

    if (!thawaniRes.ok) {
      console.error("Refund failed:", thawaniData);
      return NextResponse.json({ error: "Refund failed" }, { status: 500 });
    }

    const refundRef = thawaniData?.data?.refund_id;

    const { data: refund } = await serviceSupabase
      .from("refunds")
      .insert({
        payment_id: payment.id,
        facility_id: payment.facility_id,
        amount: refundAmount,
        reason: "Appointment cancellation",
        status: "pending",
        gateway_refund_ref: refundRef,
      })
      .select()
      .single();

    return NextResponse.json({ success: true, refund });

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}