import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Masks auth.users email and randomises password for users whose
// profiles.status = 'deleted' (set by purge_deleted_accounts() SQL function).
// Fix 4: Only processes rows where auth_masked = false to prevent re-processing.
// Run this daily after pg_cron fires purge_deleted_accounts().
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Fix 4: Filter by auth_masked = false so already-processed users are skipped
  const { data: deletedProfiles, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "deleted")
    .is("email", null)       // profiles.email already nulled by purge_deleted_accounts()
    .eq("auth_masked", false); // Fix 4: skip already-masked accounts

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
