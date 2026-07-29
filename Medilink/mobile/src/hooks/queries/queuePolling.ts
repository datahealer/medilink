/**
 * Queue polling policy — extracted from `useQueue.ts` so it can be unit-tested
 * without React Query, the repository layer or a Supabase client.
 *
 * Polling is the correctness FLOOR for the Live Queue screen: realtime is an
 * optimisation that can silently die (socket drop, backgrounding, proxy), so the
 * screen must stay fresh without it. These intervals are the safety net, which is
 * why they are worth a test.
 */
import type { QueueStatus, QueueUnavailableReason } from "@/data/types";

/**
 * Adaptive refetch interval in ms, or `false` to stop polling entirely.
 *
 * Tightens as the patient nears the front (a stale "you're next" is the most
 * costly staleness), and stops once `done` — a terminal state never changes again,
 * so continuing to poll would waste battery and quota forever.
 */
export function pollInterval(status: QueueStatus | undefined): number | false {
  if (!status) return 30_000;
  if (status.phase === "done") return false;
  if (status.phase === "called") return 10_000;
  if (status.peopleAhead <= 2) return 10_000;
  if (status.peopleAhead <= 5) return 30_000;
  return 60_000;
}

/**
 * Reasons that are a legitimate terminal answer rather than a transient failure.
 * Retrying these burns requests and can never succeed: the patient genuinely isn't
 * queued, or genuinely isn't allowed.
 */
export const NON_RETRYABLE_REASONS: QueueUnavailableReason[] = [
  "not_in_queue",
  "not_checked_in",
  "forbidden",
  "unauthorized",
];

/** Whether a queue read should be retried, given the reason and attempt count. */
export function shouldRetryQueue(
  attemptCount: number,
  reason: QueueUnavailableReason | undefined
): boolean {
  if (reason && NON_RETRYABLE_REASONS.includes(reason)) return false;
  return attemptCount < 2;
}
