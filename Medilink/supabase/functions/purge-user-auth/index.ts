import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Masks auth.users email and randomises password for users whose
// profiles.status = 'deleted' (set by purge_deleted_accounts() SQL function).
// Fix 4: Only processes rows where auth_masked = false to prevent re-processing.
// Run this daily after pg_cron fires purge_deleted_accounts().
serve(async (req) => {
  /**
   * SERVER-TO-SERVER ONLY.
   *
   * verify_jwt alone is NOT sufficient: it only proves the caller presented a VALID project
   * JWT, and the anon key is a valid project JWT that ships publicly in every browser bundle.
   * Demonstrated on this project -- poll-refund-status had verify_jwt = true and no guard, and
   * returned 200 to the public anon key.
   *
   * Has NO caller anywhere: not in either repository, not from any cron, and not from
   * purge_deleted_accounts, which mentions it only in a SQL comment. Guarding it is pure
   * hardening, and it matters because this function masks auth.users emails and randomises
   * passwords for accounts pending deletion -- a destructive admin operation that was
   * reachable by any valid project JWT, including the public anon key.
   *
   * requireInternalCaller accepts only the raw injected service-role key or a
   * signature-verified `role: service_role` JWT; anon and authenticated are refused 401. It is
   * placed FIRST so an unauthorized caller learns nothing -- no method check, no body parse, no
   * database access happens before it.
   *
   * ⚠️ Operational invariant from _shared/internalAuth.ts: verify_jwt must stay TRUE for this
   * function, or an unsigned forged token could claim role: service_role.
   */
  const refusal = requireInternalCaller(req, "purge-user-auth");
  if (refusal) return refusal;

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // `auth_masked = false` is the ONLY progress marker, by design.
  //
  // This previously also filtered `.is("email", null)`, waiting for purge_deleted_accounts()
  // to null profiles.email. It never could: profiles.email is NOT NULL, so that UPDATE raised
  // 23502 and aborted the whole sweep. Even once the SQL was fixed, it now writes the masked
  // sentinel `deleted_<uuid>@deleted.invalid` rather than NULL — because profiles.email is a
  // mirror of auth.users.email (HAMS 20260802000001) and must stay non-null. So the email
  // filter would still match zero rows forever.
  //
  // auth_masked is exactly the right marker: it is set true below only after the auth user is
  // masked and banned, so it already prevents re-processing without depending on the email.
  const { data: deletedProfiles, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "deleted")
    .eq("auth_masked", false);

  if (error) {
    console.error("[purge-user-auth] Query failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const { id } of (deletedProfiles ?? [])) {
    try {
      // Mask email and randomise password so the account cannot be used to log in
      const { error: updateErr } = await supabase.auth.admin.updateUserById(id, {
        email: `deleted_${id}@deleted.invalid`,
        password: crypto.randomUUID(),
        ban_duration: "876600h", // ~100 years = effectively permanent ban
      });

      if (updateErr) {
        console.error(`[purge-user-auth] Failed to mask ${id}:`, updateErr.message);
        results.push({ id, success: false, error: updateErr.message });
        continue;
      }

      // Fix 4: Mark auth_masked = true so this user is never re-processed
      const { error: flagErr } = await supabase
        .from("profiles")
        .update({ auth_masked: true })
        .eq("id", id);

      if (flagErr) {
        // Non-fatal — auth is already masked; just log
        console.error(`[purge-user-auth] Failed to set auth_masked for ${id}:`, flagErr.message);
      }

      results.push({ id, success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[purge-user-auth] Unexpected error for ${id}:`, message);
      results.push({ id, success: false, error: message });
    }
  }

  const processed = results.filter((r) => r.success).length;
  console.log(`[purge-user-auth] Processed ${processed}/${results.length} users.`);

  return new Response(
    JSON.stringify({ processed, total: results.length, results }),
    { headers: { "Content-Type": "application/json" } }
  );
});
