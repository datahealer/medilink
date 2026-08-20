// supabase/functions/notify-waitlist/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

serve(async (req) => {
  /**
   * SERVER-TO-SERVER ONLY.
   *
   * verify_jwt alone is NOT sufficient: it only proves the caller presented a VALID project
   * JWT, and the anon key is a valid project JWT that ships publicly in every browser bundle.
   * Demonstrated on this project -- poll-refund-status had verify_jwt = true and no guard, and
   * returned 200 to the public anon key.
   *
   * Callers: four HAMS routes (appointments/[id] x2, waitlist/[id]/claim x2). They were
   * invoking through the CALLER'S client, so they sent the end user's JWT; they have been
   * switched to the service client -- already constructed in both files -- in the same change.
   *
   * The DB trigger waitlist_entries.trg_notify_waitlist also targets this function, but its
   * body still contains the literal placeholders YOUR_PROJECT_REF.supabase.co and
   * 'Bearer YOUR_SERVICE_ROLE_KEY', so it has never reached this function and is unaffected.
   *
   * requireInternalCaller accepts only the raw injected service-role key or a
   * signature-verified `role: service_role` JWT; anon and authenticated are refused 401. It is
   * placed FIRST so an unauthorized caller learns nothing -- no method check, no body parse, no
   * database access happens before it.
   *
   * ⚠️ Operational invariant from _shared/internalAuth.ts: verify_jwt must stay TRUE for this
   * function, or an unsigned forged token could claim role: service_role.
   */
  const refusal = requireInternalCaller(req, "notify-waitlist");
  if (refusal) return refusal;

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
          type: "info",
          title: "A slot is available for you",
          body: `A slot has opened up for ${entry.preferred_date}. You have 15 minutes to claim it.`,
          title_ar: "يتوفر لك موعد الآن",
          body_ar: `تم توفر موعد بتاريخ ${entry.preferred_date}. أمامك 15 دقيقة للحجز.`,
          data: { waitlist_id, offered_slot: entry.offered_slot, kind: "appointment" },
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
