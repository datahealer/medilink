import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Invoice recovery sweeper. Scheduled (Supabase Cron / pg_cron / Vercel Cron) to run
// every ~5 min. Finds paid payments still missing an invoice — failed/pending past
// their exponential backoff, or stuck 'generating' beyond the stale window (crashed
// worker) — and re-invokes the idempotent generate-invoice worker for each. Because
// generate-invoice claims per-payment, running this alongside webhook/verify is safe.
//
// AUTH: internal-only. Must be called with the service-role key as the bearer token
// (that is how Supabase Cron / pg_net invoke it); any other caller is rejected.
serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: rows, error } = await admin.rpc("payments_needing_invoice", {
      p_limit: 50,
      p_max_attempts: 8,
      p_stale_minutes: 5,
    });
    if (error) return json({ error: "worklist failed", details: error.message }, 500);

    const work: Array<{ payment_id: string }> = Array.isArray(rows) ? rows : [];
    let succeeded = 0;
    let failed = 0;

    // Bounded sequential processing keeps memory/edge-CPU predictable; the per-payment
    // advisory lock in the claim RPC makes concurrent runs safe regardless.
    for (const r of work) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-invoice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: r.payment_id, source: "cron" }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && (body?.success || body?.skipped)) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return json({ processed: work.length, succeeded, failed }, 200);
  } catch (err) {
    return json({ error: "sweeper failed", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
