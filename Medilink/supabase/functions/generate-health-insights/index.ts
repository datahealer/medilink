import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SUMMARY_PROMPT =
  "Summarise these medical notes in simple language for a patient. " +
  "Include: what was found, what was prescribed, when to seek urgent care. " +
  "Max 150 words. Do not use medical jargon. Write in plain English.";

serve(async (req) => {
  try {
    const body = await req.json();
    const appointment_note_id = body?.appointment_note_id;
    /**
     * `appointment_id` from the request is accepted ONLY to be CHECKED against the note row.
     * It is never used to decide what to write. See the comment on `appointment_id` below.
     */
    const claimed_appointment_id = body?.appointment_id;

    const isUuid = (v: unknown): v is string =>
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

    if (!isUuid(appointment_note_id)) {
      return new Response(
        JSON.stringify({ error: "appointment_note_id must be a UUID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (claimed_appointment_id !== undefined && claimed_appointment_id !== null && !isUuid(claimed_appointment_id)) {
      return new Response(
        JSON.stringify({ error: "appointment_id must be a UUID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Fetch note content
    const { data: note, error: noteError } = await supabase
      .from("appointment_notes")
      .select("content, appointment_id")
      .eq("id", appointment_note_id)
      .single();

    if (noteError || !note) {
      return new Response(
        JSON.stringify({ error: "Note not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    /**
     * ── THE APPOINTMENT COMES FROM THE NOTE, NEVER FROM THE REQUEST (audit finding H-7) ──
     *
     * This function previously took `appointment_note_id` AND `appointment_id` as two
     * INDEPENDENT parameters, ran with the service role (bypassing RLS), and had no caller
     * authentication whatsoever — `verify_jwt = false`, set because the calling database
     * trigger sends no Authorization header. Confirmed live: an unauthenticated POST reached
     * the privileged query and returned "Note not found" for a bogus id.
     *
     * Because the two ids were unrelated, anyone who knew ONE note id could write THAT note's
     * AI summary onto ANY OTHER appointment: `appointments.patient_summary` was overwritten,
     * `ai_generated` set true, the target appointment's doctor was sent an in-app notification
     * containing up to 197 characters of the summary, and the target patient received an in-app
     * notification and an Expo push. So one patient's clinical summary could be planted in a
     * different patient's record and delivered to them. Note ids are obtainable: patients can
     * read notes for their own appointments, and `appt_notes_staff_all` lets any doctor-role
     * user read every note row.
     *
     * The second parameter was never needed — a note already knows its appointment. Deriving it
     * from the note row makes the cross-appointment write structurally impossible rather than
     * merely checked. A supplied `appointment_id` is still honoured as an assertion: if it
     * disagrees with the note, the request is refused rather than silently retargeted.
     */
    const appointment_id: string | null = note.appointment_id ?? null;

    if (!appointment_id) {
      return new Response(
        JSON.stringify({ error: "Note is not linked to an appointment" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    if (claimed_appointment_id && claimed_appointment_id !== appointment_id) {
      // A caller asking to write this note onto a different appointment is the attack.
      console.warn(
        "[generate-health-insights] refused: appointment_id does not match the note's own appointment"
      );
      return new Response(
        JSON.stringify({ error: "appointment_id does not match the note" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Call Groq via fetch (no npm — works in Deno)
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          { role: "user", content: note.content },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("Groq error:", err);
      return new Response(
        JSON.stringify({ error: "Groq API error" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const groqData = await groqRes.json();
    const summary: string = groqData.choices?.[0]?.message?.content ?? "";

    // Step 3: Update appointment with summary
    await supabase
      .from("appointments")
      .update({ patient_summary: summary, ai_generated: true })
      .eq("id", appointment_id);

    // Step 4: Fetch appointment to get doctor_id and patient_id
    const { data: apt, error: aptError } = await supabase
      .from("appointments")
      .select("doctor_id, patient_id")
      .eq("id", appointment_id)
      .single();

    if (aptError || !apt) {
      console.error("Failed to fetch appointment:", aptError?.message);
      return new Response(JSON.stringify({ success: true, warning: "summary saved but notifications skipped" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Notify doctor
    if (apt.doctor_id) {
      const { data: doctor, error: drErr } = await supabase
        .from("doctors")
        .select("user_id")
        .eq("id", apt.doctor_id)
        .single();

      if (drErr) {
        console.error("Failed to fetch doctor:", drErr.message);
      } else if (doctor?.user_id) {
        const { error: drNotifErr } = await supabase.from("in_app_notifications").insert({
          user_id: doctor.user_id,
          type: "info",
          title: "AI Summary Generated",
          body: summary.length > 200 ? summary.slice(0, 197) + "…" : summary,
          data: { appointment_id },
        });
        if (drNotifErr) {
          console.error("Failed to notify doctor:", drNotifErr.message);
        } else {
          console.log("Doctor notified:", doctor.user_id);
        }
      }
    }

    // Step 6: Fetch patient profile and notify patient
    if (apt.patient_id) {
      const { data: patientProfile, error: ppErr } = await supabase
        .from("patient_profiles")
        .select("user_id")
        .eq("id", apt.patient_id)
        .single();

      if (ppErr) {
        console.error("Failed to fetch patient profile:", ppErr.message);
      } else if (patientProfile?.user_id) {
        // In-app notification for patient
        const { error: ptNotifErr } = await supabase.from("in_app_notifications").insert({
          user_id: patientProfile.user_id,
          type: "info",
          title: "Visit Summary Ready",
          body: "Your visit summary from your recent appointment is now available.",
          data: { appointment_id, kind: "insight" },
        });
        if (ptNotifErr) {
          console.error("Failed to notify patient:", ptNotifErr.message);
        } else {
          console.log("Patient notified:", patientProfile.user_id);
        }

        // Step 7: Send Expo push notification to patient
        const { data: profile } = await supabase
          .from("profiles")
          .select("push_tokens")
          .eq("id", patientProfile.user_id)
          .single();

        const tokens: string[] = profile?.push_tokens ?? [];
        if (tokens.length > 0) {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              tokens.map((token) => ({
                to: token,
                title: "Visit Summary Ready",
                body: "Your visit summary is now available.",
                data: { appointment_id },
              }))
            ),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-health-insights error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
