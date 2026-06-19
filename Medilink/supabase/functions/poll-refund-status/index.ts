import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
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