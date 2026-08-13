/**
 * Twilio Verify transport — the only module in the repository that sends a Twilio request.
 *
 * NO TWILIO SDK. Two `fetch` calls against a documented REST API do not justify a
 * dependency, and the existing Thawani integration already calls its provider this way.
 * Fewer packages is also fewer places a credential can be logged by someone else's code.
 *
 * ── WHY THIS EXISTS AT ALL ──
 *
 * Phone LOGIN goes client-side through Supabase Auth, which has its own Twilio Verify
 * configuration in the Supabase dashboard. This module is only for LINKING a phone to an
 * existing account, which cannot be done safely from the client: `updateUser({ phone })`
 * stages the number in `auth.users.phone_change`, a column with NO uniqueness constraint,
 * and GoTrue resolves the user at verification by searching that column rather than by the
 * session — so an abandoned attempt can attach a number to the wrong account. See the long
 * note in `shared/src/api/auth.ts`.
 *
 * So the backend runs the verification itself and then writes `auth.users.phone` directly
 * with the Admin API, for an explicit user id, atomically.
 *
 * Every function returns a narrow result object. Twilio response bodies are never returned
 * to a caller and never logged unredacted.
 */
import {
  basicAuthHeader,
  isApproved,
  isVerifyConfigured,
  redact,
  verificationCheckUrl,
  verificationsUrl,
  type EnvLike,
  type VerificationStatus,
} from "./verifyConfig";

/** Outcome of a start/check call. `status` is Twilio's, never a code and never a body. */
export interface VerifyResult {
  ok: boolean;
  status?: VerificationStatus;
  /**
   * Coarse failure reason for mapping to an i18n key. Deliberately an enum, not Twilio's
   * message — provider text is not translated and can leak request detail.
   */
  reason?: "not_configured" | "rate_limited" | "max_attempts" | "invalid_phone" | "provider_error";
}

const TIMEOUT_MS = 15_000;

/**
 * POST a form-encoded body with Basic auth and a hard timeout.
 *
 * The timeout matters: without it a hung Twilio connection holds a serverless invocation
 * open until the platform kills it, and the patient sees a spinner rather than an error
 * they can act on.
 */
async function twilioPost(
  url: string,
  form: Record<string, string>,
  env: EnvLike
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        // The ONLY place the auth token is used. Never logged, never returned.
        Authorization: basicAuthHeader(env),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { httpStatus: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Map a Twilio error payload to a coarse reason. Twilio's own text never escapes. */
function reasonFor(httpStatus: number, body: Record<string, unknown>): VerifyResult["reason"] {
  const code = Number(body?.code ?? 0);
  // 60203 max send attempts · 60202 max check attempts · 20429 too many requests
  if (code === 60203 || httpStatus === 429) return "rate_limited";
  if (code === 60202) return "max_attempts";
  // 60200 invalid parameter · 21211 invalid 'To' number
  if (code === 60200 || code === 21211) return "invalid_phone";
  return "provider_error";
}

/**
 * Send (or RE-send) an SMS verification code.
 *
 * Re-sending is the same call: POSTing to /Verifications for a number with a pending
 * verification issues another code, and Twilio applies its own per-number throttle. That is
 * why there is no separate resend route — the OTP screen's existing resend button simply
 * calls this again.
 */
export async function startVerification(
  phoneE164: string,
  env: EnvLike = process.env
): Promise<VerifyResult> {
  if (!isVerifyConfigured(env)) return { ok: false, reason: "not_configured" };
  try {
    const { httpStatus, body } = await twilioPost(
      verificationsUrl(env),
      { To: phoneE164, Channel: "sms" },
      env
    );
    if (httpStatus >= 200 && httpStatus < 300) {
      return { ok: true, status: String(body.status ?? "pending") };
    }
    return { ok: false, reason: reasonFor(httpStatus, body) };
  } catch (err) {
    // Redacted, and only the message — a Twilio error can echo request context.
    console.error("[twilio/verify] start failed:", redact(String((err as Error)?.message ?? err), env));
    return { ok: false, reason: "provider_error" };
  }
}

/**
 * Check a code. **`approved` is the only success.**
 *
 * `pending` means the code was wrong (Twilio keeps the verification open for retries) and
 * must be reported as a failure — treating any non-error response as a pass is how a
 * verification step becomes decorative.
 */
export async function checkVerification(
  phoneE164: string,
  code: string,
  env: EnvLike = process.env
): Promise<VerifyResult> {
  if (!isVerifyConfigured(env)) return { ok: false, reason: "not_configured" };
  try {
    const { httpStatus, body } = await twilioPost(
      verificationCheckUrl(env),
      { To: phoneE164, Code: code },
      env
    );
    if (httpStatus >= 200 && httpStatus < 300) {
      const status = String(body.status ?? "pending") as VerificationStatus;
      return isApproved(status) ? { ok: true, status } : { ok: false, status, reason: "max_attempts" };
    }
    // A 404 here means "no pending verification" — expired, already used, or never sent.
    if (httpStatus === 404) return { ok: false, reason: "max_attempts" };
    return { ok: false, reason: reasonFor(httpStatus, body) };
  } catch (err) {
    console.error("[twilio/verify] check failed:", redact(String((err as Error)?.message ?? err), env));
    return { ok: false, reason: "provider_error" };
  }
}
