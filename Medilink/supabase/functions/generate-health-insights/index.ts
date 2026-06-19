import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SUMMARY_PROMPT =
  "Summarise these medical notes in simple language for a patient. " +
  "Include: what was found, what was prescribed, when to seek urgent care. " +
  "Max 150 words. Do not use medical jargon. Write in plain English.";

serve(async (req) => {
  try {
    const { appointment_note_id, appointment_id } = await req.json();

    if (!appointment_note_id || !appointment_id) {
      return new Response(
        JSON.stringify({ error: "appointment_note_id and appointment_id are required" }),
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
      .select("content")
      .eq("id", appointment_note_id)
      .single();

    if (noteError || !note) {
      return new Response(
        JSON.stringify({ error: "Note not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
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
          data: { appointment_id },
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
