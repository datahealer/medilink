import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

/**
 * Refund statuses worth polling.
 *
 * MUST be valid `public.refund_status` enum labels. The enum is
 * (pending, processing, processed, failed, rejected) — verified against the live database.
 *
 * This previously read ["pending", "approved"]. "approved" is NOT a member of the enum, so
 * PostgREST rendered `status=in.(pending,approved)`, Postgres refused the cast with
 * `22P02 invalid input value for enum refund_status: "approved"`, and the query returned an
 * ERROR rather than rows. The old code destructured only `data` and dropped `error` on the
 * floor, so `refunds` was null, `refunds || []` made the loop a no-op, and the function
 * answered 200 "Done" having done nothing at all. It never reached Thawani.
 *
 * "processing" is the status that actually needs polling: src/app/api/refunds/[id]/action
 * sets it when a facility_admin approves a refund.
 */
const POLLABLE_STATUSES = ["pending", "processing"] as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  /**
   * SERVER-TO-SERVER ONLY. Invoked by the `refund-status-check` cron via pg_net, which reads a
   * service-role credential from Vault at execution time (see migration 20260820000010).
   *
   * Why this guard is needed even though config.toml sets `verify_jwt = true`: verify_jwt only
   * proves the caller presented a VALID project JWT. The anon key is a valid project JWT, and it
   * is public by design -- it ships in every browser bundle. Demonstrated against production:
   * before this guard, the public anon key received 200 "Done".
   *
   * requireInternalCaller accepts only the raw injected service-role key or a signature-verified
   * `role: service_role` JWT. `role: anon` and `role: authenticated` are both refused 401.
   *
   * ⚠️ Inherits the operational invariant documented in _shared/internalAuth.ts: `verify_jwt`
   * must stay TRUE for this function. Deploying it with --no-verify-jwt would let an unsigned
   * forged token claim `role: service_role` and defeat this check.
   */
  const refusal = requireInternalCaller(req, "poll-refund-status");
  if (refusal) return refusal;

  /**
   * Fail LOUDLY on missing configuration, before touching the database.
   *
   * These two are read from Edge Function secrets, and both were absent. With
   * THAWANI_BASE_URL undefined the fetch URL became the literal string
   * "undefined/refund/status" — a relative URL with no scheme, so fetch threw `Invalid URL`,
   * the per-refund catch swallowed it, and the function still answered 200 "Done". A cron that
   * reports success while reconciling nothing is worse than one that reports failure, because
   * the 200 is taken as proof the pipeline works.
   *
   * The values themselves are never logged — only whether each is present.
   */
  const thawaniBase = Deno.env.get("THAWANI_BASE_URL");
  const thawaniKey = Deno.env.get("THAWANI_SECRET_KEY");
  const missing = [
    !thawaniBase ? "THAWANI_BASE_URL" : null,
    !thawaniKey ? "THAWANI_SECRET_KEY" : null,
  ].filter((v): v is string => v !== null);

  if (missing.length > 0) {
    console.error(
      `[poll-refund-status] missing Edge Function secret(s): ${missing.join(", ")} — ` +
        `refund reconciliation cannot run. Add them with: supabase secrets set <NAME>=<value>`
    );
    return json({ error: "misconfigured", missing }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // `error` is inspected, not discarded — dropping it is what hid the enum failure above.
  const { data: refunds, error: selectError } = await supabase
    .from("refunds")
    .select("id, gateway_refund_ref, status")
    .in("status", POLLABLE_STATUSES);

  if (selectError) {
    console.error(`[poll-refund-status] refunds query failed: ${selectError.message}`);
    return json({ error: "query_failed", detail: selectError.message }, 500);
  }

  const summary = {
    considered: refunds?.length ?? 0,
    processed: 0,
    failed: 0,
    skipped_no_gateway_ref: 0,
    errors: 0,
  };

  for (const refund of refunds ?? []) {
    /**
     * A refund approved through HAMS (src/app/api/refunds/[id]/action) is set to 'processing'
     * WITHOUT calling Thawani, so it has no gateway_refund_ref yet. Sending refund_id: null
     * would make Thawani reject the request, and the old code would then have recorded the
     * refund as 'failed' — turning a not-yet-submitted refund into a terminal failure.
     * Skipping is correct and is counted so the gap is visible rather than silent.
     */
    if (!refund.gateway_refund_ref) {
      summary.skipped_no_gateway_ref++;
      console.warn(
        `[poll-refund-status] refund ${refund.id} is '${refund.status}' with no ` +
          `gateway_refund_ref — not submitted to Thawani yet, skipping`,
      );
      continue;
    }

    try {
      const res = await fetch(`${thawaniBase}/refund/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "thawani-api-key": thawaniKey!,
        },
        body: JSON.stringify({ refund_id: refund.gateway_refund_ref }),
      });

      const data = await res.json().catch(() => null);

      /**
       * Only decide from a response we actually understood. The old code treated ANY
       * non-"success" body as a definitive failure, so a 500 from Thawani, a rate-limit, or an
       * unparseable body all wrote status='failed' — a terminal state — for a refund that was
       * very likely still in flight. A transport or server-side fault must leave the row alone
       * so the next tick can retry.
       */
      if (!res.ok) {
        summary.errors++;
        console.error(
          `[poll-refund-status] Thawani returned HTTP ${res.status} for refund ${refund.id}; ` +
            `leaving status '${refund.status}' unchanged for retry`,
        );
        continue;
      }

      const providerStatus = (data as { data?: { status?: string } })?.data?.status;
      if (providerStatus !== "success" && providerStatus !== "failed") {
        summary.errors++;
        console.warn(
          `[poll-refund-status] refund ${refund.id}: unrecognised Thawani status ` +
            `${JSON.stringify(providerStatus)} — leaving unchanged for retry`,
        );
        continue;
      }

      const nextStatus = providerStatus === "success" ? "processed" : "failed";

      const { error: updateError } = await supabase
        .from("refunds")
        .update({ status: nextStatus, gateway_response: data })
        .eq("id", refund.id);

      if (updateError) {
        summary.errors++;
        console.error(
          `[poll-refund-status] refund ${refund.id}: update to '${nextStatus}' failed: ${updateError.message}`,
        );
        continue;
      }

      if (nextStatus === "processed") summary.processed++;
      else summary.failed++;
    } catch (err) {
      /**
       * Kept per-refund so one bad row cannot stop the rest, but it now records and reports the
       * failure instead of only console.error-ing into a log nobody reads.
       */
      summary.errors++;
      console.error(
        `[poll-refund-status] refund ${refund.id} check threw: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Returns a SUMMARY, not the opaque string "Done".
   *
   * pg_net records the response body in net._http_response.content, so this is the only place a
   * scheduled job's outcome becomes observable. "Done" is what let a completely inert function
   * look healthy for its entire lifetime.
   */
  console.info(`[poll-refund-status] ${JSON.stringify(summary)}`);
  return json({ ok: true, ...summary }, 200);
});
