import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { sendInvoiceEmail } from "@/lib/email/sendInvoice";
import { logAudit } from "@/lib/audit/logAudit";

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceSupabase();

    // ✅ SAFE BODY
    let body: any = {};
    try {
      body = await req.json();
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

    const alreadyPaid = payment.status === "paid";
    const hasInvoice = !!payment.invoice_url;

    // ✅ UPDATE PAYMENT
    if (!alreadyPaid) {
      await supabase
        .from("payments")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
          gateway_response: body,
        })
        .eq("id", payment.id);

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

    let invoiceUrl = payment.invoice_url;
    let invoiceNumber = payment.invoice_number || payment.id;

    // ✅ GENERATE INVOICE
    if (!hasInvoice) {
      console.log("🧾 Generating invoice...");

      let invoiceData: any = null;
      try {
        const invoiceRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-invoice`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              payment_id: payment.id,
            }),
          }
        );

        invoiceData = await invoiceRes.json().catch(() => null);
        console.log("🔥 Invoice Response:", invoiceData);

        if (!invoiceRes.ok) {
          console.error("❌ Invoice generation failed:", invoiceData);
          return NextResponse.json(
            { error: "Invoice generation failed", details: invoiceData },
            { status: 500 }
          );
        }
      } catch (fetchErr: any) {
        console.error("❌ Edge function fetch failed:", fetchErr.message);
        return NextResponse.json(
          { error: "Invoice generation failed", details: fetchErr.message },
          { status: 500 }
        );
      }

      invoiceUrl = invoiceData?.url;
      invoiceNumber = invoiceData?.invoice_number || payment.id;
      console.log("✅ Invoice generated:", invoiceNumber);
    }

    // Fetch patient email from auth.users (profiles table may not store email)
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(payment.patient_id);
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

        const { error: ptErr } = await supabase.from("in_app_notifications").insert({
          user_id: payment.patient_id,
          type: "info" as const,
          title: isEmergencyPayment ? "Payment Received — You Are In Queue" : "Payment Successful",
          body: isEmergencyPayment
            ? (attendeeName
                ? `Payment received for ${attendeeName}. They have been added to the queue. Invoice #${invoiceNumber} is ready.`
                : `Payment received. You have been added to the queue. Invoice #${invoiceNumber} is ready.`)
            : (attendeeName
                ? `Payment for ${attendeeName}'s appointment is confirmed. Invoice #${invoiceNumber} is ready.`
                : `Your payment has been received and your appointment is confirmed. Invoice #${invoiceNumber} is ready.`),
          data: { appointment_id: payment.appointment_id },
        });
        if (ptErr) console.error("❌ Patient payment notif failed:", ptErr.message);
        else console.log("✅ Patient notified: Payment Successful");

        // Notify facility admins: payment received
        if (facilityAdmins.length > 0) {
          const { error: faPayErr } = await supabase.from("in_app_notifications").insert(
            facilityAdmins.map((a) => ({
              user_id: a.user_id,
              type: "info" as const,
              title: "Payment Received",
              body: `Payment for Invoice #${invoiceNumber} has been received for an appointment at your facility.`,
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