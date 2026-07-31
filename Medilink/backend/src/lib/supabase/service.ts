import { createClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";

import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — only call it from a route that has already authorised
 * the caller.
 *
 * Reads through `@/lib/env` rather than `process.env.X!`. Those non-null assertions were a
 * type-level lie: with the variable unset they passed `undefined` straight into
 * `createClient`, which then fails later with an error that says nothing about
 * configuration. The getters throw naming the missing variable instead. Behaviour is
 * unchanged whenever the variables are present — and they are validated at boot by
 * `instrumentation.ts`, so in a correctly configured deployment this path never throws.
 */
export function createServiceSupabase() {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
