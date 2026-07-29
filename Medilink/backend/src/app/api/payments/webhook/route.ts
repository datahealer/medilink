import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { sendInvoiceEmail } from "@/lib/email/sendInvoice";
import { logAudit } from "@/lib/audit/logAudit";
import { notifyPaymentSuccess } from "@/lib/notifications/notifyPaymentSuccess";
import { ensureInvoice } from "@/lib/payments/ensureInvoice";

// Vercel: the webhook runs a sequential chain (gateway verify → invoice edge fn →
// email → notifications); give it headroom above the low default timeout.
export const maxDuration = 60;

/**
 * BP-6 — HMAC/signature verification (defense-in-depth, in addition to the Thawani
 * re-query + idempotent claim below).
 *
 * Verifies `HMAC-SHA256(rawBody, THAWANI_WEBHOOK_SECRET)` (hex) against the signature
 * header (`THAWANI_WEBHOOK_SIGNATURE_HEADER`, default `thawani-signature`), using a
 * timing-safe compare. Gated on the secret being set:
 *   • secret unset  → skip (the re-query below stays the authoritative anti-spoof
 *     guard, so no deployment breaks by omitting it).
 *   • secret set    → a missing/mismatched signature is rejected (401).
 * Even if the secret is misconfigured, payments still finalize via the client
 * `/payments/verify` path (which re-queries Thawani directly), so this never strands
 * a real payment.
 */
function verifyWebhookSignature(req: NextRequest, rawBody: string): { ok: boolean; reason?: string } {
  const secret = process.env.THAWANI_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: "hmac-not-configured" };

  const headerName = process.env.THAWANI_WEBHOOK_SIGNATURE_HEADER || "thawani-signature";
  const provided = req.headers.get(headerName);
  if (!provided) return { ok: false, reason: "missing-signature" };

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "signature-mismatch" };
  return { ok: crypto.timingSafeEqual(a, b), reason: "signature-mismatch" };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceSupabase();

    // Read the RAW body once (HMAC must be computed over the exact bytes), verify the
    // signature, then parse. See verifyWebhookSignature above.
    const rawBody = await req.text();
    const sig = verifyWebhookSignature(req, rawBody);
    if (!sig.ok) {
      console.warn("⚠️ Webhook signature rejected:", sig.reason);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ✅ SAFE BODY
    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    console.log("📩 Webhook body:", JSON.stringify(body));

    const client_reference_id =
      body?.data?.client_reference_id ||
      body?.client_reference_id;

    if (!client_reference_id) {
      return NextResponse.json(
        { error: "Missing client_reference_id" },
        { status: 400 }
      );
    }

    // ✅ KEEP YOUR WORKING QUERY
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("appointment_id", client_reference_id)
      .single();

    if (fetchError || !payment) {
      console.error("❌ Payment fetch error:", fetchError);
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    console.log("💳 Payment found:", payment.id);

    // NOTE (root-caused via live DB inspection, not the reference schema doc):
    // payments.checkout/route.ts writes `patient_id: user.id` (the auth user id),
    // NOT a patient_profiles.id, despite what docs/reference/full_schema.sql's FK
    // declaration implies. Verified against a real payments row: payment.patient_id
    // matches a profiles.id and has zero matching patient_profiles.id. Do not
    // reintroduce a patient_profiles lookup here without re-verifying live data first.
    const patientUserId = payment.patient_id;

    const alreadyPaid = payment.status === "paid";
    const hasInvoice = !!payment.invoice_url;
    let gatewayInvoiceRef: string | null = null;

    // 🔒 SECURITY: never finalize on the webhook body alone. Confirm the authoritative
    // payment status with Thawani first (same check as payments/verify). This closes a
    // payment-bypass where any POST carrying a known appointment id would mark the
    // payment paid and confirm the appointment without any real payment.
    if (!alreadyPaid) {
      if (!payment.gateway_session_id) {
        console.warn("⚠️ Webhook: payment has no gateway_session_id — cannot verify, not finalizing");
        return NextResponse.json({ received: true, finalized: false, reason: "no gateway session" });
      }

      const verifyRes = await fetch(
        `${process.env.THAWANI_BASE_URL}/checkout/session/${payment.gateway_session_id}`,
        { headers: { "thawani-api-key": process.env.THAWANI_SECRET_KEY! } }
      );
      const verifyJson = await verifyRes.json().catch(() => null);

      if (verifyJson?.data?.payment_status !== "paid") {
        console.warn("⚠️ Webhook: Thawani does not report this session as paid — not finalizing");
        return NextResponse.json({ received: true, finalized: false, reason: "not paid per gateway" });
      }

      console.log("✅ Webhook: Thawani confirms session paid");
      // Store the gateway's invoice reference alongside the payment (mirrors payments/verify).
      gatewayInvoiceRef = verifyJson?.data?.invoice ?? null;
    }

    // ✅ UPDATE PAYMENT (atomic claim → idempotent under duplicate/concurrent delivery)
    if (!alreadyPaid) {
      const { data: claimed } = await supabase
        .from("payments")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
          gateway_response: body,
          gateway_ref: gatewayInvoiceRef,
        })
        .eq("id", payment.id)
        .neq("status", "paid")
        .select("id");

      // If another delivery already flipped this to paid, ack and skip the one-time
      // side-effects (notifications / invoice / enqueue) so they never run twice.
      if (!claimed || claimed.length === 0) {
        console.log("ℹ️ Webhook: payment already finalized by another delivery — skipping side-effects");
        return NextResponse.json({ received: true, finalized: false, reason: "already finalized" });
      }

      console.log("✅ Payment marked as PAID");
    }

    // ✅ UPDATE APPOINTMENT
    await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", payment.appointment_id);

    console.log("📅 Appointment confirmed");

    // ✅ BOOKING CONFIRMED NOTIFICATIONS (doctor + facility admins)
    // Only send on first successful payment to avoid duplicate notifications
    let facilityAdmins: { user_id: string }[] = [];
    let attendeeName: string | null = null; // hoisted so payment notification block can reuse it

    if (!alreadyPaid) {
      try {
        const { data: apt } = await supabase
          .from("appointments")
          .select(`
            doctor_id, facility_id, slot_date, slot_start, is_emergency, patient_id,
            for_family_member_id,
            family_member:for_family_member_id ( full_name )
          `)
          .eq("id", payment.appointment_id)
          .single();

        attendeeName = (apt as any)?.family_member?.full_name ?? null;

        // Notify doctor
        if (apt?.doctor_id) {
          const { data: doctor } = await supabase
            .from("doctors")
            .select("user_id")
            .eq("id", apt.doctor_id)
            .single();

          if (doctor?.user_id) {
            const { error: drErr } = await supabase.from("in_app_notifications").insert({
              user_id: doctor.user_id,
              type: "info" as const,
              title: "New Appointment Booked",
              body: attendeeName
                ? `A new appointment for ${attendeeName} has been confirmed for ${apt.slot_date} at ${apt.slot_start?.substring(0, 5)}.`
                : `A new appointment has been confirmed for ${apt.slot_date} at ${apt.slot_start?.substring(0, 5)}.`,
              title_ar: "تم حجز موعد جديد",
              body_ar: attendeeName
                ? `تم تأكيد موعد جديد لـ ${attendeeName} بتاريخ ${apt.slot_date} الساعة ${apt.slot_start?.substring(0, 5)}.`
                : `تم تأكيد موعد جديد بتاريخ ${apt.slot_date} الساعة ${apt.slot_start?.substring(0, 5)}.`,
              data: { appointment_id: payment.appointment_id },
            });
            if (drErr) console.error("❌ Doctor booking notif failed:", drErr.message);
            else console.log("✅ Doctor notified: New Appointment Booked");
          }
        }

        // Fetch facility admins
        const facilityId = apt?.facility_id ?? payment.facility_id ?? null;
        if (facilityId) {
          const { data: admins } = await supabase
            .from("facility_admins")
            .select("user_id")
            .eq("facility_id", facilityId)
            .is("revoked_at", null);

          facilityAdmins = admins ?? [];

          if (facilityAdmins.length > 0) {
            const { error: faErr } = await supabase.from("in_app_notifications").insert(
              facilityAdmins.map((a) => ({
                user_id: a.user_id,
                type: "info" as const,
                title: "New Appointment Booked",
                body: attendeeName
                  ? `A new appointment for ${attendeeName} has been confirmed at your facility for ${apt?.slot_date}.`
                  : `A new appointment has been confirmed at your facility for ${apt?.slot_date}.`,
                title_ar: "تم حجز موعد جديد",
                body_ar: attendeeName
                  ? `تم تأكيد موعد جديد لـ ${attendeeName} في منشأتك بتاريخ ${apt?.slot_date}.`
                  : `تم تأكيد موعد جديد في منشأتك بتاريخ ${apt?.slot_date}.`,
                data: { appointment_id: payment.appointment_id },
              }))
            );
            if (faErr) console.error("❌ Facility booking notif failed:", faErr.message);
            else console.log(`✅ ${facilityAdmins.length} facility admin(s) notified: New Appointment Booked`);
          }
        }
      } catch (notifErr: any) {
        console.error("❌ Booking notification block failed (non-fatal):", notifErr.message);
      }
    }

    // ✅ EMERGENCY: enqueue after payment (bypasses check-in — urgent cases go straight to queue)
    if (!alreadyPaid) {
      try {
        const { data: emergencyApt } = await supabase
          .from("appointments")
          .select(`
            is_emergency, doctor_id, facility_id, patient_id, for_family_member_id,
            patient_profiles:patient_id ( user_id, profiles:user_id ( full_name, phone ) ),
            family_member:for_family_member_id ( full_name )
          `)
          .eq("id", payment.appointment_id)
          .maybeSingle();

        if (emergencyApt?.is_emergency) {
          const emergencyFm      = (emergencyApt as any).family_member;
          const emergencyProfile = (emergencyApt as any).patient_profiles?.profiles;
          const emergencyPatientName  = emergencyFm?.full_name ?? emergencyProfile?.full_name ?? "Emergency Patient";
          const emergencyPatientPhone: string | null = emergencyProfile?.phone ?? null;

          // Args cast (consistent with the `as any` usage above): the generated RPC
          // signature types these as non-null strings, but this verbatim-migrated path
          // intentionally forwards nullable values / null — runtime payload unchanged.
          await supabase.rpc("enqueue_appointment", {
            p_appointment_id:      payment.appointment_id,
            p_facility_id:         emergencyApt.facility_id,
            p_doctor_id:           emergencyApt.doctor_id,
            p_patient_name:        emergencyPatientName,
            p_patient_phone:       emergencyPatientPhone,
            p_is_walkin:           false,
            p_is_online:           false,
            p_created_by_staff_id: null,
          } as never);

          await supabase
            .from("appointments")
            .update({ needs_queue_sync: false })
            .eq("id", payment.appointment_id);

          await logAudit({
            action: "emergency_enqueued",
            actor_user_id: payment.patient_id,
            actor_role: "system",
            resource_type: "appointment",
            resource_id: payment.appointment_id,
            after: { status: "confirmed", queued: true, payment_id: payment.id },
          });

          console.log("✅ Emergency appointment enqueued after payment");
        }
      } catch (enqueueErr: any) {
        console.error("❌ Emergency enqueue failed (non-fatal):", enqueueErr.message);
      }
    }

    // ✅ GENERATE INVOICE — idempotent worker; NON-FATAL by design.
    // Never return an error to Thawani on invoice failure: the atomic paid-claim above
    // short-circuits every webhook re-delivery, so a 500 here would strand the invoice
    // permanently. Failures are recorded (invoice_status='failed') and the recovery
    // sweeper (retry-invoices) regenerates them automatically.
    let invoiceUrl = payment.invoice_url;
    let invoiceNumber = payment.invoice_number || payment.id;
    if (!hasInvoice) {
      const inv = await ensureInvoice(payment.id, "webhook");
      if (inv.url) {
        invoiceUrl = inv.url;
        invoiceNumber = inv.invoiceNumber || payment.id;
        console.log("✅ Invoice generated:", invoiceNumber);
      } else {
        console.warn("⚠️ Invoice not ready; recovery sweeper will retry:", inv.outcome);
      }
    }

    // Fetch patient email from auth.users (profiles table may not store email)
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(patientUserId);
    const email = authUser?.email || null;

    if (email && invoiceUrl) {
      console.log("📧 Sending email to:", email);
      try {
        await sendInvoiceEmail(email, invoiceUrl, invoiceNumber);
        console.log("✅ Email sent");
      } catch (emailErr: any) {
        console.error("❌ Email send failed (non-fatal):", emailErr.message);
      }
    } else {
      console.log("⚠️ Skipping email — email:", email, "invoiceUrl:", invoiceUrl);
    }

    // ✅ PAYMENT NOTIFICATIONS (patient + facility admins)
    if (!alreadyPaid) {
      try {
        // Notify patient: payment successful (emergency gets queue-specific message)
        const isEmergencyPayment = !!(await supabase
          .from("appointments")
          .select("is_emergency")
          .eq("id", payment.appointment_id)
          .maybeSingle()
          .then(r => r.data?.is_emergency));

        const notifResult = await notifyPaymentSuccess(supabase, {
          userId: patientUserId,
          appointmentId: payment.appointment_id,
          title: isEmergencyPayment ? "Payment Received — You Are In Queue" : "Payment Successful",
          body: isEmergencyPayment
            ? (attendeeName
                ? `Payment received for ${attendeeName}. They have been added to the queue. Invoice #${invoiceNumber} is ready.`
                : `Payment received. You have been added to the queue. Invoice #${invoiceNumber} is ready.`)
            : (attendeeName
                ? `Payment for ${attendeeName}'s appointment is confirmed. Invoice #${invoiceNumber} is ready.`
                : `Your payment has been received and your appointment is confirmed. Invoice #${invoiceNumber} is ready.`),
          titleAr: isEmergencyPayment ? "تم استلام الدفع — أنت الآن في قائمة الانتظار" : "تمت عملية الدفع بنجاح",
          bodyAr: isEmergencyPayment
            ? (attendeeName
                ? `تم استلام الدفع لـ ${attendeeName}. تمت إضافته إلى قائمة الانتظار. الفاتورة رقم ${invoiceNumber} جاهزة.`
                : `تم استلام الدفع. تمت إضافتك إلى قائمة الانتظار. الفاتورة رقم ${invoiceNumber} جاهزة.`)
            : (attendeeName
                ? `تم تأكيد الدفع لموعد ${attendeeName}. الفاتورة رقم ${invoiceNumber} جاهزة.`
                : `تم استلام دفعتك وتأكيد موعدك. الفاتورة رقم ${invoiceNumber} جاهزة.`),
        });
        if (notifResult.success) console.log("✅ Patient notified: Payment Successful");
        else console.error("❌ Patient payment notif failed:", notifResult.error);

        // Notify facility admins: payment received
        if (facilityAdmins.length > 0) {
          const { error: faPayErr } = await supabase.from("in_app_notifications").insert(
            facilityAdmins.map((a) => ({
              user_id: a.user_id,
              type: "info" as const,
              title: "Payment Received",
              body: `Payment for Invoice #${invoiceNumber} has been received for an appointment at your facility.`,
              title_ar: "تم استلام الدفع",
              body_ar: `تم استلام دفعة الفاتورة رقم ${invoiceNumber} لموعد في منشأتك.`,
              data: { appointment_id: payment.appointment_id },
            }))
          );
          if (faPayErr) console.error("❌ Facility payment notif failed:", faPayErr.message);
          else console.log(`✅ ${facilityAdmins.length} facility admin(s) notified: Payment Received`);
        }
      } catch (payNotifErr: any) {
        console.error("❌ Payment notification block failed (non-fatal):", payNotifErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      payment_id: payment.id,
    });

  } catch (err: any) {
    console.error("❌ Webhook error:", err);

    return NextResponse.json(
      {
        error: "Webhook failed",
        details: err.message,
      },
      { status: 500 }
    );
  }
}