import { ApiError } from "@/services/api";

/**
 * Should a failed request be offered a "Retry" button?
 *
 * ── WHY THIS IS A RULE AND NOT AN `if` IN A SCREEN ──
 *
 * A retry affordance is a promise: press this and the thing you asked for may happen. For
 * some failures that promise is false no matter how many times it is pressed, and offering
 * it anyway teaches the patient that the button is decorative — which is worse than showing
 * no button, because it costs them attempts before they look for the real fix (signing in
 * again).
 *
 * The split is by HTTP status, not by message text:
 *
 *   • 401 / 403 — the session is expired or the caller is not permitted. Re-issuing the
 *     identical request with the identical (missing/rejected) credentials cannot succeed.
 *     The recovery is elsewhere: sign in again. NOT retryable.
 *
 *   • 400 / 404 / 409 / 422 — the request itself is the problem (bad input, gone, state
 *     conflict). Replaying it byte-for-byte reproduces the same failure. NOT retryable.
 *
 *   • Everything else — 5xx, 429, timeouts, DNS failures, a dropped mobile connection, or
 *     any non-`ApiError` throw — is transient or unknown. Retryable.
 *
 * The default for an unrecognised error is TRUE on purpose. A patient on a flaky Omani
 * mobile connection hits this path constantly, and the cost of a retry that fails again is
 * one tap; the cost of withholding retry from a recoverable failure is a dead end.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    // Auth failures: the credentials, not the connection, are the problem.
    if (err.status === 401 || err.status === 403) return false;
    // Client-side request faults: an identical replay is an identical failure.
    if (err.status >= 400 && err.status < 500) {
      // 408 Request Timeout and 429 Too Many Requests are the two 4xx codes that DO
      // describe a transient condition — both explicitly invite a later retry.
      return err.status === 408 || err.status === 429;
    }
    return true;
  }
  // Network error, timeout, or a throw we do not recognise — assume recoverable.
  return true;
}

/** Is this the specific "your session ended" case, which needs a sign-in, not a retry? */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
