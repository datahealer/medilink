import { SupabaseClient } from "@supabase/supabase-js";

export type EmailCheckResult =
  | { available: true }
  | { available: false; existingRole: string | null };

/**
 * profiles.email is the single source of truth after the migration:
 * - NOT NULL enforced
 * - UNIQUE (LOWER(email)) index enforced
 * - normalized to lowercase on all writes
 * - sync_profile_email_trigger auto-populates on auth.users INSERT/UPDATE
 *   so profiles.email is never missing or stale
 *
 * Always pass serviceSupabase (service role) — profiles may be RLS-protected.
 * Always normalize email before calling: email.trim().toLowerCase()
 */
export async function checkEmailAvailable(
  email: string,
  serviceSupabase: SupabaseClient
): Promise<EmailCheckResult> {
  const normalized = email.trim().toLowerCase();

  const { data: profile } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("email", normalized)
    .maybeSingle();

  if (profile) {
    return { available: false, existingRole: profile.role };
  }

  return { available: true };
}
