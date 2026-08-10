import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { notifyPaymentSuccess } from "@/lib/notifications/notifyPaymentSuccess";
import { ensureInvoice } from "@/lib/payments/ensureInvoice";
import { sendAppointmentEmailForUser } from "@/lib/email/appointmentEmailForUser";
import { sendInvoiceEmail } from "@/lib/email/sendInvoice";

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
      .select("id, status, gateway_session_id, patient_id")
      .eq("appointment_id", appointment_id)
      .maybeSingle();

    if (!payment) return NextResponse.json({ status: "none", payment: null });

    let paidNow = payment.status === "paid";
    /**
     * True only when THIS request performed the pending → paid transition.
     *
     * Distinct from `paidNow`, which is also true on every subsequent call — and the
     * mobile confirmation screen polls this endpoint several times per payment. Anything
     * that must happen exactly once (emails) keys off this flag, not `paidNow`.
     */
    let finalizedNow = false;

    // Gated on payment.status !== "paid" — if the webhook already finalized this
    // payment, this whole block (including the notification below) is skipped, so
    // a patient never gets notified twice regardless of which path runs first.
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

        // Same patient notification as the webhook (via the shared helper) — this
        // is the path that actually runs when the webhook can't reach the backend
        // (e.g. local/LAN development), so it must notify the patient too.
        //
        // NOTE (root-caused via live DB inspection, not the reference schema doc):
        // payment.patient_id is already the auth user id here — checkout/route.ts
        // writes `patient_id: user.id`, NOT a patient_profiles.id. Do not add a
        // patient_profiles lookup here without re-verifying against live data first.
        const notifResult = await notifyPaymentSuccess(service, {
          userId: payment.patient_id,
          appointmentId: appointment_id,
          title: "Payment Successful",
          body: "Your payment has been received and your appointment is confirmed.",
          titleAr: "تمت عملية الدفع بنجاح",
          bodyAr: "تم استلام دفعتك وتأكيد موعدك.",
        });
        if (!notifResult.success) {
          console.error("❌ Patient payment notification failed:", notifResult.error);
        }
        paidNow = true;
        finalizedNow = true;
      }
    }

    // Ensure the invoice exists once the payment is paid, so the app can auto-file it
    // into the Document Vault on return (idempotent; safe if the webhook already made it).
    const invoice = paidNow ? await ensureInvoice(payment.id, "verify") : null;

    // Transactional email, on the SAME condition as the notification above: only when
    // this request is the one that finalized the payment.
    //
    // The webhook sends these too, but it is not reachable from a local/LAN backend —
    // which is exactly the demo and development setup. Without this block a payment made
    // against a local server produces no receipt and no confirmation at all. The
    // `finalizedNow` gate means only one of the two paths ever runs for a given payment.
    if (finalizedNow) {
      const { data: authUser } = await service.auth.admin.getUserById(payment.patient_id);
      const to = authUser.user?.email ?? null;

      if (to) {
        if (invoice?.url) {
          await sendInvoiceEmail(to, invoice.url, invoice.invoiceNumber || payment.id);
        } else {
          // Distinguishable from "email failed": there was nothing to attach yet, so no
          // receipt was even attempted. The invoice sweeper will regenerate it.
          console.warn("[email] receipt not attempted — invoice URL not ready for payment", payment.id);
        }
        await sendAppointmentEmailForUser(service, {
          appointmentId: appointment_id,
          userId: payment.patient_id,
          kind: "booked",
          to,
        });
      } else {
        console.warn("[email] no email on account", payment.patient_id, "— receipt/confirmation not sent");
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
