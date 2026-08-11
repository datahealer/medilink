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

    // Revoke every refresh token for this user, on every device (MED-016 / NEW-001).
    //
    // Previously this route changed `status` and nothing else: the auth user was left
    // completely intact, so a phone that was already signed in kept working for the whole
    // 30-day grace period and could read PHI straight from PostgREST.
    //
    // BE PRECISE ABOUT WHAT THIS DOES AND DOES NOT DO. Supabase access tokens are stateless
    // JWTs validated by signature and expiry alone — revoking refresh tokens cannot recall
    // one that has already been issued, so an access token minted seconds ago stays
    // syntactically valid until it expires (1h by default). This call only guarantees that
    // no NEW access token can be minted after it runs.
    //
    // The actual security boundary is therefore the RESTRICTIVE RLS policy added in
    // 20260811020000, which denies PHI to a deletion_pending user even with a perfectly
    // valid, unexpired token. This revocation is defence in depth on top of that: it shortens
    // the window in which a stale token can do anything at all, and it forces every other
    // device back to the restore-only screen. It must never be relied on alone.
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
        await serviceClient.auth.admin.signOut(jwt, "global");
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
