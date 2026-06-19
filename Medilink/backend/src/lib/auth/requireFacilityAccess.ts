import { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/logAudit";

export type FacilityAccessResult =
  | { ok: true; applyPublicFilter: boolean }
  | { ok: false; response: NextResponse };

export async function requireFacilityAccess(
  supabase: SupabaseClient,
  userId: string | null,
  facilityId: string
): Promise<FacilityAccessResult> {
  if (!userId) {
    return { ok: true, applyPublicFilter: true };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Internal error" }, { status: 500 }),
    };
  }

  const role = profile?.role ?? null;

  if (role === "super_admin") {
    return { ok: true, applyPublicFilter: false };
  }

  if (role === "facility_admin") {
    const { data: fa, error: faError } = await supabase
      .from("facility_admins")
      .select("id")
      .eq("facility_id", facilityId)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();

    if (faError) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: "Internal error" }, { status: 500 }),
      };
    }

    if (!fa) {
      await logAudit({
        actor_user_id: userId,
        actor_role: role,
        action: "unauthorized_access_attempt",
        resource_type: "facility",
        resource_id: facilityId,
      });
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, applyPublicFilter: false };
  }

  if (role === "doctor") {
    const { data: doc, error: docError } = await supabase
      .from("doctors")
      .select("id")
      .eq("facility_id", facilityId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (docError) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: "Internal error" }, { status: 500 }),
      };
    }

    if (!doc) {
      await logAudit({
        actor_user_id: userId,
        actor_role: role,
        action: "unauthorized_access_attempt",
        resource_type: "facility",
        resource_id: facilityId,
      });
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, applyPublicFilter: false };
  }

  if (role === "patient") {
    return { ok: true, applyPublicFilter: true };
  }

  // Unknown / unrecognized role — deny explicitly, no fallback
  await logAudit({
    actor_user_id: userId,
    actor_role: role,
    action: "unauthorized_access_attempt",
    resource_type: "facility",
    resource_id: facilityId,
  });
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
}
