import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * Per-user hourly quota for the paid AI routes.
 *
 * This is the SAME mechanism `symptom-check` and `suggest-doctor` already use — a rolling
 * count of rows in `ai_request_logs` — just factored out so a new route doesn't have to
 * re-implement the query. Deliberately NOT a second mechanism, and deliberately not the
 * in-memory `Map` used by the 2FA limiters: those are per-instance, so on serverless a
 * caller simply hits a different lambda to get a fresh budget. A table is shared by every
 * instance, and the window is derived from `created_at` so counters expire on their own
 * with nothing to evict.
 *
 * Everything this needs already exists in the schema (no migration):
 *   • `ai_request_logs (user_id, feature, prompt_hash, created_at)` — `feature` is plain
 *     TEXT with no CHECK/enum, so new feature keys are free.
 *   • `ix_ai_logs_user_feature (user_id, feature, created_at DESC)` — exactly the shape of
 *     the count below, so the lookup stays index-only as the table grows.
 *   • RLS `ai_logs_service` grants INSERT to `service_role`; patients can only SELECT their
 *     own rows, so a user can neither forge nor delete their own quota records.
 */

/** Values written to `ai_request_logs.feature`. One per paid AI surface. */
export type AiFeature =
  | "symptom_check"
  | "doctor_suggestion"
  | "prescription_scan"
  | "schedule_assist";

const WINDOW_MS = 60 * 60 * 1000;

/**
 * True when `userId` has already used its hourly allowance for `feature`.
 *
 * Fails OPEN — a DB error yields `count: null`, which reads as 0 and allows the call. That
 * matches the existing routes, and the window it opens is not actually reachable: every
 * caller is authenticated via `supabase.auth.getUser()` first, so if Supabase is unreachable
 * the request has already been rejected with a 401 long before it gets here. The alternative
 * (fail closed) would take the AI features offline on any transient read error.
 */
export async function isAiRateLimited(
  userId: string,
  feature: AiFeature,
  limitPerHour: number
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await createServiceSupabase()
    .from("ai_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", since);

  return (count ?? 0) >= limitPerHour;
}

/**
 * Record one billable attempt against the caller's quota.
 *
 * Call this immediately BEFORE the paid provider call, not after it succeeds: a request
 * that reaches the provider and then fails (timeout, unparseable JSON, upstream 5xx) has
 * still consumed cost and capacity, so it must count. Logging only successes would let a
 * caller burn the AI budget indefinitely by sending input that always fails late.
 *
 * Never throws. Quota bookkeeping must not be the reason a working AI call 500s, so an
 * insert failure is logged and swallowed — the caller gets their answer and the worst case
 * is one uncounted request.
 */
export async function recordAiRequest(
  userId: string,
  feature: AiFeature,
  promptHash?: string
): Promise<void> {
  const { error } = await createServiceSupabase()
    .from("ai_request_logs")
    .insert({ user_id: userId, feature, prompt_hash: promptHash ?? null });

  if (error) {
    console.error(`ai_request_logs insert failed [${feature}]:`, error.message);
  }
}

/** Uniform 429 body. `error` is what clients surface, so keep it user-readable. */
export function aiRateLimitMessage(limitPerHour: number): string {
  return `You've reached the limit of ${limitPerHour} requests per hour for this feature. Please try again later.`;
}
