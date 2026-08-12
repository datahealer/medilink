import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit/logAudit";

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const body = await req.json();
    if (body?.confirmation !== "DELETE") {
      return NextResponse.json(
        { error: 'Type "DELETE" to confirm account deletion.' },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .single();

    if (["doctor", "facility_admin", "super_admin"].includes(profile?.role ?? "")) {
      return NextResponse.json(
        { error: "Account deletion must be requested through your administrator." },
        { status: 403 }
      );
    }

    if (profile?.status === "deletion_pending") {
      return NextResponse.json(
        { error: "Account deletion is already pending." },
        { status: 409 }
      );
    }

    const deletesAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const serviceClient = createServiceSupabase();

    // Soft-delete: mark profile as deletion_pending
    const { error: updateErr } = await serviceClient
      .from("profiles")
      .update({
        status: "deletion_pending",
        deletion_requested_at: new Date().toISOString(),
      } as any)
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Cancel active appointments — need patient_profile.id first
    const { data: pp } = await serviceClient
      .from("patient_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (pp?.id) {
      await serviceClient
        .from("appointments")
        .update({
          status: "cancelled",
          cancellation_reason: "account_deletion",
          cancelled_by: user.id,
        } as any)
        .eq("patient_id", pp.id)
        .in("status", ["pending", "confirmed"]);
    }

    await logAudit({
      action: "account_deletion_requested",
      actor_user_id: user.id,
      actor_role: profile?.role ?? null,
      resource_type: "profile",
      resource_id: user.id,
    });

    // Revoke this user's sessions on every OTHER device (MED-016 / NEW-001).
    //
    // Previously this route changed `status` and nothing else: the auth user was left
    // completely intact, so a phone that was already signed in kept working for the whole
    // 30-day grace period and could read PHI straight from PostgREST.
    //
    // ── WHY "others" AND NOT "global" ──
    //
    // This was "global", and that broke the restore flow it is supposed to protect. The
    // comment here previously asserted that revoking sessions "cannot recall an access token
    // that has already been issued". THAT IS WRONG FOR GOTRUE: a Supabase access token
    // carries a `session_id` claim, and GoTrue's /user endpoint validates that the session
    // still exists. "global" deletes EVERY session including the caller's own, so the very
    // next request from THIS device — the one that just asked to delete — was rejected.
    //
    // Measured in production (2026-08-12): DELETE returned 200 at 08:45:50, and
    // POST /cancel-deletion from the same device returned 401 seventeen seconds later, with
    // an access token nowhere near its 1h expiry. Restoring only became possible after the
    // patient signed out and back in, which minted a new session. The restore screen itself
    // rendered fine throughout — it holds no PHI and fetches nothing — so the only broken
    // thing was its single action.
    //
    // "others" revokes every other device, which is the actual intent: stop a second phone
    // that is still signed in. The current device keeps its session so it can reach the
    // restore screen and authenticate the restore.
    //
    // THIS DOES NOT WIDEN PHI ACCESS. The security boundary is the RESTRICTIVE RLS policy
    // from 20260811020000, which denies every PHI table to a deletion_pending user regardless
    // of how valid their token is — verified live: 0 rows from all 5 PHI tables with a
    // perfectly good session. The surviving session can do exactly two things: render the
    // restore screen and call cancel-deletion. Revocation was always defence in depth here,
    // never the guarantee, so narrowing its scope removes no protection.
    //
    // Deliberately NOT `ban_duration` — a banned user cannot authenticate at all, and the
    // restore flow requires the patient to sign in and reach the restore screen. Banning is
    // the purge job's job, once the 30 days have actually elapsed.
    //
    // A failure here is logged and swallowed: the deletion request itself has already been
    // recorded and RLS is already denying PHI, so failing the whole request would be worse
    // than proceeding without the extra layer.
    try {
      const bearer = (req.headers.get("authorization") || req.headers.get("Authorization") || "")
        .replace(/^Bearer /i, "");
      const jwt = bearer || (await supabase.auth.getSession()).data.session?.access_token;
      if (jwt) {
        await serviceClient.auth.admin.signOut(jwt, "others");
      } else {
        console.error("[account:DELETE] no JWT available to revoke sessions for", user.id);
      }
    } catch (signOutErr) {
      console.error("[account:DELETE] session revocation failed for", user.id, signOutErr);
    }

    return NextResponse.json({ status: "deletion_pending", deletes_at: deletesAt });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
