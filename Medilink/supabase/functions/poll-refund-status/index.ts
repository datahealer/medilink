import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

serve(async (req: Request) => {
  /**
   * SERVER-TO-SERVER ONLY. Invoked by the `refund-status-check` cron via pg_net, which reads a
   * service-role credential from Vault at execution time (see migration 20260820000010).
   *
   * Why this guard is needed even though config.toml sets `verify_jwt = true`: verify_jwt only
   * proves the caller presented a VALID project JWT. The anon key is a valid project JWT, and it
   * is public by design -- it ships in every browser bundle. So before this, anyone could invoke
   * this function, and the handler took no `req` argument at all, so it could not have
   * distinguished callers even in principle.
   *
   * What that bought an attacker was abuse rather than disclosure: the response body is the
   * fixed string "Done", and the refund rows it touches are never returned. But each call makes
   * one Thawani API request per pending/approved refund using the project's THAWANI_SECRET_KEY,
   * and can flip refund rows between 'processed' and 'failed' based on what the provider says --
   * so it is an unauthenticated trigger for outbound spend and for writes to payment state.
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: refunds } = await supabase
    .from("refunds")
    .select("*")
    .in("status", ["pending", "approved"]);

  for (const refund of refunds || []) {
    try {
      const res = await fetch(
        `${Deno.env.get("THAWANI_BASE_URL")}/refund/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "thawani-api-key": Deno.env.get("THAWANI_SECRET_KEY")!,
          },
          body: JSON.stringify({
            refund_id: refund.gateway_refund_ref,
          }),
        }
      );

      const data = await res.json();

      const status = data?.data?.status === "success"
        ? "processed"
        : "failed";

      await supabase
        .from("refunds")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refund.id);

    } catch (err) {
      console.error("Refund check failed:", err);
    }
  }

  return new Response("Done");
});