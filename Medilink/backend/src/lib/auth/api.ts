import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";
import { isStaff } from "@medilink/shared";

/** Throws 401 if the request has no valid session. */
export async function getUserOrThrow(supabase: SupabaseClient<Database>): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

/**
 * Like getUserOrThrow, but also enforces AAL2 for staff who have 2FA enabled.
 * Patients are never subject to AAL2 enforcement and always pass through.
 *
 * Throws "Unauthorized" (401) if no session.
 * Throws "2FA verification required" if a staff user has a verified TOTP factor
 * but the current session is still AAL1.
 */
export async function getAal2UserOrThrow(supabase: SupabaseClient<Database>): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "patient";

  // Patients never require AAL2 — skip the check entirely
  if (!isStaff(role)) return user;

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // nextLevel > currentLevel means user has a TOTP factor enrolled but hasn't verified it
  if (aalData?.nextLevel === "aal2" && aalData?.currentLevel === "aal1") {
    throw new Error("2FA verification required");
  }

  return user;
}
