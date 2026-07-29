// Feature F3 · BP-3 / R7 — Scheduled sweeper for expired unpaid booking holds.
// Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → R7 (Scheduled Edge Function,
// NOT pg_cron) + Payment Policy §4.
//
// Runs on a schedule (~1 min, configured at deploy time via the Supabase dashboard
// cron / `supabase functions schedule`). Finds `pending` appointments whose
// `hold_expires_at` has passed and calls `release_unpaid_hold` for each — which
// voids the reservation + detaches any unpaid payment, freeing the slot.
//
// Stateless + idempotent: it only ever acts on still-pending, expired, UNPAID rows
// (the RPC re-checks), so retries and overlapping runs are safe, and one bad row
// never fails the batch. A missed run is non-critical because the availability RPCs
// already exclude expired holds in real time (BP-3) — this function is cleanup.
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const BATCH_SIZE = 200;

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const nowIso = new Date().toISOString();

  const { data: expired, error: selErr } = await supabase
    .from("appointments")
    .select("id")
    .eq("status", "pending")
    .not("hold_expires_at", "is", null)
    .lt("hold_expires_at", nowIso)
    .limit(BATCH_SIZE);

  if (selErr) {
    console.error("[release-expired-holds] select failed:", selErr.message);
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let released = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of expired ?? []) {
    try {
      // Service-role caller (auth.uid() IS NULL) → the RPC releases only EXPIRED,
      // unpaid, still-pending holds; anything else returns success:false (skipped).
      const { data, error } = await supabase.rpc("release_unpaid_hold", {
        p_appointment_id: row.id,
      });
      if (error) throw error;
      if (data?.success) released++;
      else skipped++;
    } catch (e) {
      errored++;
      console.error(`[release-expired-holds] row ${row.id} failed:`, (e as Error).message);
    }
  }

  const scanned = expired?.length ?? 0;
  console.log(
    `[release-expired-holds] scanned=${scanned} released=${released} skipped=${skipped} errored=${errored}`
  );

  return new Response(
    JSON.stringify({ scanned, released, skipped, errored }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
