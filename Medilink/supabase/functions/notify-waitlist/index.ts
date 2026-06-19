// supabase/functions/notify-waitlist/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();

    const { waitlist_id } = body;

    if (!waitlist_id) {
      return new Response(
        JSON.stringify({ error: "waitlist_id is required" }),
        { status: 400 }
      );
    }

    /* ── Service-role client (bypasses RLS) ── */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ── Fetch waitlist entry ── */
    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .select("*")
      .eq("id", waitlist_id)
      .single();

    if (error || !entry) {
      return new Response(
        JSON.stringify({ error: "Waitlist entry not found" }),
        { status: 404 }
      );
    }

    /* ── Resolve auth user_id from patient_profiles.id ──
       entry.patient_id is patient_profiles.id (NOT the auth UUID).
       in_app_notifications.user_id references profiles(id) = auth UUID. */
    const { data: patientProfile } = await supabase
      .from("patient_profiles")
      .select("user_id, phone")
      .eq("id", entry.patient_id)
      .single();

    if (patientProfile?.user_id) {
      /* ── Insert in-app notification ── */
      const { error: notifError } = await supabase
        .from("in_app_notifications")
        .insert({
          user_id: patientProfile.user_id,
          type: "waitlist_offer",
          title: "A slot is available for you",
          body: `A slot has opened up for ${entry.preferred_date}. You have 15 minutes to claim it.`,
          data: { waitlist_id, offered_slot: entry.offered_slot },
          is_read: false,
        });

      if (notifError) {
        console.error("in_app_notifications insert failed:", notifError);
      }
    }

    // 👉 Later: integrate Twilio SMS using patientProfile?.phone

    return new Response(
      JSON.stringify({ success: true, message: "Notification triggered" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});
