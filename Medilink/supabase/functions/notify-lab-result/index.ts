// supabase/functions/notify-lab-result/index.ts
// Invoked by DB trigger after INSERT on lab_results.
// Sends in-app notifications to:
//   1. The patient whose result was uploaded
//   2. The treating doctor (if appointment_id is set on the result)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();
    const { lab_result_id } = body;

    if (!lab_result_id) {
      return new Response(
        JSON.stringify({ error: "lab_result_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Fetch the lab result row ─────────────────────────────────────────
    const { data: result, error: resultError } = await supabase
      .from("lab_results")
      .select("id, test_name, patient_id, appointment_id, facility_id")
      .eq("id", lab_result_id)
      .single();

    if (resultError || !result) {
      console.error("Lab result not found:", resultError?.message);
      return new Response(
        JSON.stringify({ error: "Lab result not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 2. Fetch patient user_id ────────────────────────────────────────────
    const { data: patientProfile } = await supabase
      .from("patient_profiles")
      .select("id, user_id, profiles!patient_profiles_user_id_fkey(full_name)")
      .eq("id", result.patient_id)
      .single();

    const patientUserId = patientProfile?.user_id ?? null;
    const patientName =
      (patientProfile?.profiles as { full_name?: string } | null)?.full_name ??
      "Patient";

    // ── 3. Notify patient ───────────────────────────────────────────────────
    if (patientUserId) {
      const { error: pNotifErr } = await supabase
        .from("in_app_notifications")
        .insert({
          user_id: patientUserId,
          type: "info",
          title: "Lab Result Ready",
          body: `Your ${result.test_name} result has been uploaded and is ready to view.`,
          data: { lab_result_id: result.id },
        });

      if (pNotifErr) {
        console.error("Failed to notify patient:", pNotifErr.message);
      } else {
        console.log("Patient notified:", patientUserId);
      }
    }

    // ── 4. Notify treating doctor (if appointment_id is set) ────────────────
    if (result.appointment_id) {
      const { data: appointment } = await supabase
        .from("appointments")
        .select("doctor_id")
        .eq("id", result.appointment_id)
        .single();

      if (appointment?.doctor_id) {
        const { data: doctor } = await supabase
          .from("doctors")
          .select("user_id")
          .eq("id", appointment.doctor_id)
          .single();

        if (doctor?.user_id) {
          const { error: dNotifErr } = await supabase
            .from("in_app_notifications")
            .insert({
              user_id: doctor.user_id,
              type: "info",
              title: "Patient Lab Result Ready",
              body: `Lab result (${result.test_name}) for ${patientName} is now available.`,
              data: {
                lab_result_id: result.id,
                patient_id: result.patient_id,
              },
            });

          if (dNotifErr) {
            console.error("Failed to notify doctor:", dNotifErr.message);
          } else {
            console.log("Doctor notified:", doctor.user_id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-lab-result error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
