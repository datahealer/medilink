/**
 * Pure configuration logic for Twilio Verify: is it configured, which credential applies,
 * what URLs to call, and what the startup/diagnostic line says.
 *
 * Separated from `verify.ts` for the same reason `email/transportConfig.ts` is separated
 * from `transporter.ts`: everything here is a pure function of `env`, which makes the
 * decisions that actually matter — "are we configured?", "does any log line leak the auth
 * token?" — directly assertable with no network and no Twilio account.
 *
 * NOTHING in this file imports another project module, so the Node test runner can load it
 * without dragging in Next.js or Supabase.
 *
 * ── THE SECRET BOUNDARY ──
 *
 * `TWILIO_AUTH_TOKEN` is a full-account credential. It exists ONLY as a server-side
 * environment variable. It must never appear in:
 *   • mobile or shared client code   (mobile/src/config/env.ts reads EXPO_PUBLIC_* only,
 *                                     so it structurally cannot see this)
 *   • git history                    (.env.example documents NAMES only)
 *   • a log line or thrown error     (see `redact` + `describeConfig` below)
 *   • an API response                (routes return { ok, status } and nothing else)
 *
 * The functions below never RETURN the token. `describeConfig` reports presence and the
 * non-secret identifiers, which is everything a diagnostic needs.
 */

export type EnvLike = Record<string, string | undefined>;

export const TWILIO_API_BASE = "https://verify.twilio.com/v2";

/** Non-secret identifiers plus a presence flag. Deliberately excludes the token itself. */
export interface VerifyConfigSummary {
  configured: boolean;
  accountSid?: string;
  serviceSid?: string;
  /** Names of the variables that are absent, so an operator knows what to set. */
  missing: string[];
}

const REQUIRED = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const;

function value(env: EnvLike, name: string): string | undefined {
  const v = env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Which required variables are missing. Used for both the guard and the diagnostic line. */
export function missingVerifyEnv(env: EnvLike): string[] {
  return REQUIRED.filter((name) => !value(env, name));
}

/** Is Twilio Verify usable? Absence disables phone LINKING only — nothing else. */
export function isVerifyConfigured(env: EnvLike): boolean {
  return missingVerifyEnv(env).length === 0;
}

/**
 * Presence + non-secret identifiers, safe to log.
 *
 * Returns the Account SID and Service SID (both are resource identifiers that appear in
 * every Twilio request URL and carry no authority on their own) and NEVER the auth token.
 */
export function describeConfig(env: EnvLike): VerifyConfigSummary {
  const missing = missingVerifyEnv(env);
  return {
    configured: missing.length === 0,
    accountSid: value(env, "TWILIO_ACCOUNT_SID"),
    serviceSid: value(env, "TWILIO_VERIFY_SERVICE_SID"),
    missing,
  };
}

/**
 * One human-readable status line for boot/diagnostics.
 *
 * Asserted by the test suite to contain no secret. It names only the variables that are
 * MISSING — a missing variable's name is not a secret, and printing it is the whole point.
 */
export function verifyStatusLine(env: EnvLike): string {
  const summary = describeConfig(env);
  if (!summary.configured) {
    return `Twilio Verify: NOT CONFIGURED (missing ${summary.missing.join(", ")}) — phone linking disabled`;
  }
  return `Twilio Verify: ready (service ${summary.serviceSid})`;
}

/**
 * Basic-auth header for the Twilio REST API.
 *
 * Twilio authenticates with HTTP Basic `AccountSid:AuthToken`. Built here so exactly one
 * place in the codebase touches the token, and so the test suite can assert that the header
 * is the ONLY output that ever contains it.
 *
 * @throws when unconfigured — callers must gate on `isVerifyConfigured` first.
 */
export function basicAuthHeader(env: EnvLike): string {
  const sid = value(env, "TWILIO_ACCOUNT_SID");
  const token = value(env, "TWILIO_AUTH_TOKEN");
  if (!sid || !token) {
    throw new Error(`Twilio Verify is not configured: missing ${missingVerifyEnv(env).join(", ")}`);
  }
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/** Verification start/list endpoint for the configured service. */
export function verificationsUrl(env: EnvLike): string {
  const service = value(env, "TWILIO_VERIFY_SERVICE_SID");
  if (!service) throw new Error("Twilio Verify is not configured: missing TWILIO_VERIFY_SERVICE_SID");
  return `${TWILIO_API_BASE}/Services/${service}/Verifications`;
}

/** Verification check endpoint for the configured service. */
export function verificationCheckUrl(env: EnvLike): string {
  const service = value(env, "TWILIO_VERIFY_SERVICE_SID");
  if (!service) throw new Error("Twilio Verify is not configured: missing TWILIO_VERIFY_SERVICE_SID");
  return `${TWILIO_API_BASE}/Services/${service}/VerificationCheck`;
}

/**
 * Strip anything credential-shaped out of a string before it reaches a log.
 *
 * Defence in depth: nothing is supposed to pass a token in here, but a Twilio error body or
 * a stack trace could conceivably echo a request header, and an auth token in a Vercel log
 * survives long after the request does.
 */
export function redact(text: string, env: EnvLike): string {
  const token = value(env, "TWILIO_AUTH_TOKEN");
  let out = text;
  if (token) out = out.split(token).join("[REDACTED]");
  // Also mask any Basic credential blob, in case the token was already base64-encoded.
  out = out.replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic [REDACTED]");
  return out;
}

/**
 * Last four digits only, for audit rows and log lines.
 *
 * A phone number is personal data and, in this app, also a login credential. The audit
 * trail needs to record THAT a link happened, not the number it was for — the number is
 * already on the profile row for anyone authorised to see it.
 */
export function phoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••";
}

/**
 * Twilio Verify statuses we act on.
 *
 * `approved` is the ONLY value that may be treated as success. Twilio also returns
 * `pending` and `canceled`, and a `max_attempts_reached` error — treating anything other
 * than `approved` as a pass would make the whole verification decorative.
 */
export type VerificationStatus = "pending" | "approved" | "canceled" | (string & {});

export function isApproved(status: VerificationStatus | null | undefined): boolean {
  return status === "approved";
}
