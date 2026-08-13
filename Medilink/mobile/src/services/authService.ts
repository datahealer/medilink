/**
 * Auth service — the single transport layer for authentication.
 *
 * All auth runs through official Supabase Auth (shared `api.auth`), Supabase-direct:
 *   • sign-in / session / sign-out            → password grant
 *   • sign-up                                  → auth.signUp (email confirmation OTP)
 *   • verify / resend OTP                      → auth.verifyOtp / auth.resend (email)
 *   • password reset                           → resetPasswordForEmail → recovery OTP
 *   • Google sign-in                           → native SDK ID token → signInWithIdToken
 *
 * Google runs through the NATIVE flow (see services/googleAuth.ts) — no browser, no
 * deep link, no expo-auth-session. Web keeps Supabase's browser OAuth. The two
 * architectures are per-platform and never mixed.
 *
 * The previous custom `otp_records` backend flow (send/verify/resend-otp, service-role
 * signup) is retired; delivery was never wired. Results carry a stable `messageKey`
 * (an i18n key) so errors render in EN + AR. Tokens, OTP codes and passwords are
 * never logged.
 */
import {
  api,
  DEFAULT_PHONE_COUNTRY,
  phoneCountryForDialCode,
  phoneE164,
} from "@medilink/shared/mobile";

import type { MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { setRememberSession, setRememberedEmail } from "@/lib/authPersistence";
import { ApiError, apiFetch } from "@/services/api";
import { signInWithGoogle, signOutGoogle } from "@/services/googleAuth";
import { clearPushToken } from "@/services/push";

/** Account lifecycle status, mirroring the `account_status` DB enum. */
export type AccountStatus = "active" | "suspended" | "deletion_pending" | "deleted";

export interface SignInInput {
  email: string;
  password: string;
  remember?: boolean;
}
export interface SignUpInput {
  fullName: string;
  email: string;
  phone: string; // local 8-digit
  dialCode: string; // e.g. "+968"
  password: string;
}

export interface AuthResult {
  ok: boolean;
  /**
   * i18n key for a user-facing message (error or info).
   *
   * ABSENT on a failure means "fail silently" — currently only the Google/Apple
   * user-cancelled path. Callers must treat `{ ok: false }` with no key as a no-op
   * rather than falling back to a generic error, or dismissing the account sheet
   * would show a bogus "Unexpected error".
   */
  messageKey?: MessageKey;
  /** signUp only: true when a live session was returned (email confirmation is
   *  disabled), so the OTP step can be skipped. */
  verified?: boolean;
}

/** Map a thrown error (ApiError / Supabase AuthError / network) to an i18n key. */
function toMessageKey(err: unknown): MessageKey {
  // Network / fetch failure (no response).
  if (err instanceof TypeError) return "errors.network";

  if (err instanceof ApiError) {
    const text = (err.message || "").toLowerCase();
    if (err.status === 429 || text.includes("too many")) return "errors.otpTooMany";
    if (text.includes("expired")) return "errors.otpExpired";
    if (text.includes("invalid otp") || text.includes("valid 6-digit"))
      return "errors.otpInvalid";
    if (text.includes("already registered")) return "errors.emailInUse";
    // TRANSPORT FAILURE, NOT A SERVER FAULT. `apiFetch` wraps a fetch rejection or its 20s
    // timeout as ApiError(0) — there is no HTTP response at all. Because status 0 matched no
    // branch, every offline/unreachable/timed-out request fell through to "errors.server" and
    // told the user the problem was on our side. It also made the `err instanceof TypeError`
    // check above dead code for every backend call, since apiFetch never lets a raw TypeError
    // escape.
    if (err.status === 0) return "errors.network";
    // AUTHENTICATION, NOT A SERVER FAULT. A 401 means this device's session was not accepted.
    // This is the mapping that made MED-016's restore bug so hard to read: cancel-deletion
    // returned 401 (its session had just been revoked by the delete request) and the screen
    // said "Something went wrong on our side. Please try again." — which is why it looked
    // transient and why retrying the same broken session never helped. The user needs to know
    // to sign in again; 403 gets the same message, since a patient cannot act on either.
    // `common.sessionExpired`, NOT a new errors.* key — this string already existed and is
    // already used for exactly this case by ai/recommendations.tsx and ai/schedule.tsx.
    if (err.status === 401 || err.status === 403) return "common.sessionExpired";
    if (err.status >= 500) return "errors.server";
    return "errors.server";
  }

  // Supabase AuthError shape: { message, status }.
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : 0;
  const msg =
    typeof err === "object" && err && "message" in err
      ? String((err as { message: unknown }).message).toLowerCase()
      : "";
  if (msg.includes("network") || msg.includes("failed to fetch")) return "errors.network";
  if (status === 429 || msg.includes("too many") || msg.includes("rate limit")) return "errors.otpTooMany";
  if (msg.includes("already registered") || msg.includes("already been registered")) return "errors.emailInUse";
  // Supabase GoTrue returns 422 "New password should be different from the old password."
  // when a reset re-uses the current password (QA #5) — surface a clear message, not the
  // generic "unknown" fallthrough below.
  if (msg.includes("should be different") || msg.includes("same password") || msg.includes("same as the old"))
    return "errors.samePassword";
  // Supabase returns "Token has expired or is invalid" for a bad/expired email OTP.
  if (msg.includes("expired")) return "errors.otpExpired";
  if (msg.includes("token") || msg.includes("otp")) return "errors.otpInvalid";
  if (msg.includes("invalid login")) return "errors.invalidCredentials";
  if (msg.includes("email not confirmed")) return "errors.invalidCredentials";
  if (msg.includes("auth session missing")) return "errors.recoverySession";
  return "errors.unknown";
}

/**
 * Phone-link failures carry a `reason` enum from the backend, which is more precise than
 * pattern-matching the message. `toMessageKey` stays the fallback for transport failures.
 *
 * The reasons deliberately do NOT include Twilio's own text: provider messages are
 * untranslated and can echo request detail.
 */
function phoneLinkMessageKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    const reason = (err.body as { reason?: string } | undefined)?.reason;
    if (reason === "already_linked") return "phone.errorAlreadyLinked";
    if (reason === "unsupported_country") return "phone.errorUnsupportedCountry";
    if (reason === "rate_limited") return "errors.otpTooMany";
    if (reason === "max_attempts") return "errors.otpInvalid";
    if (reason === "not_configured") return "errors.server";
    if (reason === "invalid" || reason === "invalid_phone") return "validation.phone";
    if (reason === "invalid_code") return "errors.otpInvalid";
  }
  return toMessageKey(err);
}

/**
 * Local digits + dial code → canonical E.164, or `null` when the length is wrong for that
 * country.
 *
 * REPLACES a naive `` `${dialCode}${local}` `` concatenation. That version could not fail:
 * it happily produced `+91+919845367812` from an already-prefixed value, and a 7-digit Oman
 * number became a plausible-looking `+9891234567`. Both reach the provider as a real request
 * for a real (wrong) handset. This routes through the shared country registry instead, which
 * knows +968 is 8 digits and +91 is 10 and returns null otherwise — the same registry that
 * fixed the G2 corruption bug on Edit Profile.
 */
const e164 = (dialCode: string, local: string): string | null =>
  phoneE164(local, phoneCountryForDialCode(dialCode) ?? DEFAULT_PHONE_COUNTRY);

export const authService = {
  async signIn(input: SignInInput): Promise<AuthResult> {
    try {
      await api.auth.signInWithPassword(supabase, {
        email: input.email.trim(),
        password: input.password,
      });
      // Record whether this session should survive a cold app launch. Enforced on
      // next launch by AuthProvider (see src/lib/authPersistence.ts).
      await setRememberSession(input.remember ?? false);
      // QA MED-018 — remember the ADDRESS so Sign In can prefill it next time, or forget
      // it when the user opted out. The PASSWORD is never persisted; see authPersistence.
      await setRememberedEmail(input.remember ? input.email : null);
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * Create the account via Supabase Auth. With email confirmations enabled (this
   * project), Supabase emails a 6-digit verification OTP and returns no session —
   * the OTP screen then confirms it with `verifyOtp(type:"signup")`. `full_name`/
   * `phone` ride along as user metadata for the profile-provisioning DB trigger.
   * If a session IS returned (confirmations disabled), `verified` is true and the
   * caller can skip the OTP step.
   */
  async signUp(input: SignUpInput): Promise<AuthResult> {
    try {
      const { user, session } = await api.auth.signUp(supabase, {
        email: input.email.trim(),
        password: input.password,
        data: {
          full_name: input.fullName.trim(),
          phone: e164(input.dialCode, input.phone) || null,
          role: "patient",
        },
      });
      // Enumeration protection: an already-registered email returns a user with an
      // empty `identities` array (no error) — surface it instead of a dead OTP screen.
      if (user && Array.isArray(user.identities) && user.identities.length === 0) {
        return { ok: false, messageKey: "errors.emailInUse" };
      }
      return { ok: true, verified: !!session };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * F5 Login Simplification — send a passwordless EMAIL login code to an existing
   * account. Enumeration-safe: an unknown-account error is swallowed (we still
   * proceed to the OTP screen with neutral copy); only rate-limit / network errors
   * hard-stop. Phone OTP is intentionally not implemented (blocked on SMS provider).
   */
  async sendLoginOtp(email: string): Promise<AuthResult> {
    try {
      await api.auth.signInWithEmailOtp(supabase, email.trim());
      return { ok: true, messageKey: "otp.sent" };
    } catch (err) {
      const key = toMessageKey(err);
      // Don't reveal whether the account exists — only surface hard failures.
      if (key === "errors.otpTooMany" || key === "errors.network") {
        return { ok: false, messageKey: key };
      }
      return { ok: true }; // proceed neutrally
    }
  },

  /** F5 — verify the email login code; Supabase establishes the session on success. */
  async verifyLoginOtp(code: string, email?: string): Promise<AuthResult> {
    if (!email) return { ok: false, messageKey: "errors.unknown" };
    try {
      await api.auth.verifyEmailOtp(supabase, { email: email.trim(), token: code, type: "email" });
      // An explicit OTP login persists the session across cold launches.
      await setRememberSession(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  // ── PHONE OTP ──────────────────────────────────────────────────────────────
  //
  // Supabase Auth is still the only identity/session provider. Twilio Verify is
  // configured as Supabase's SMS provider in the SUPABASE DASHBOARD, so no Twilio
  // credential, SDK or backend route exists in this app. `authService` talks to GoTrue
  // exactly as it does for email.
  //
  // Every method takes an ALREADY-CANONICAL E.164 string. Normalising at the screen
  // boundary (via `phoneE164`) rather than in here keeps one rule in one place and lets
  // the UI show a validation error before any SMS is billed.

  /**
   * PHONE LOGIN — send the SMS code. Existing accounts only.
   *
   * Enumeration-safe, and deliberately identical in shape to `sendLoginOtp` (email): an
   * unknown-account error is swallowed and we proceed to the OTP screen with neutral
   * copy. Only rate-limit and network failures hard-stop, because those are the two the
   * user can actually act on ("wait" / "check your connection").
   */
  async sendPhoneLoginOtp(phone: string): Promise<AuthResult> {
    try {
      await api.auth.signInWithPhoneOtp(supabase, phone);
      return { ok: true, messageKey: "otp.sent" };
    } catch (err) {
      const key = toMessageKey(err);
      if (key === "errors.otpTooMany" || key === "errors.network") {
        return { ok: false, messageKey: key };
      }
      return { ok: true }; // proceed neutrally — never reveal whether the number is registered
    }
  },

  /** PHONE LOGIN — verify the code. Supabase establishes a full session on success. */
  async verifyPhoneLoginOtp(code: string, phone?: string): Promise<AuthResult> {
    if (!phone) return { ok: false, messageKey: "errors.unknown" };
    try {
      await api.auth.verifyPhoneOtp(supabase, { phone, token: code });
      // An explicit OTP login persists the session across cold launches, matching
      // verifyLoginOtp. There is no "remember me" checkbox on this path to read.
      await setRememberSession(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * LINK the signed-in user's phone — step 1. Goes to the BACKEND, not to Supabase.
   *
   * ── WHY NOT `updateUser({ phone })` ──
   *
   * That client-side call stages the number in `auth.users.phone_change`, a column with NO
   * uniqueness constraint, and GoTrue resolves the user at verification by SEARCHING that
   * column rather than by the session. An attempt abandoned by one account can therefore
   * cause the number to be confirmed onto it when its real owner verifies — Supabase
   * documents this as "Phone linked to incorrect user ID" and states there is no
   * client-side workaround.
   *
   * So `/api/auth/phone/start` runs Twilio Verify server-side, and `/check` writes
   * `auth.users.phone` with the Admin API for an explicit user id. The backend derives that
   * id from THIS request's bearer token — no user id is ever sent from the device.
   *
   * NOT enumeration-sensitive: the caller is already authenticated, so a real error
   * (number already linked elsewhere, rate limited) is information they need and can act on.
   */
  async startPhoneLink(phone: string): Promise<AuthResult> {
    try {
      await apiFetch("/api/auth/phone/start", { method: "POST", body: JSON.stringify({ phone }) });
      return { ok: true, messageKey: "otp.sent" };
    } catch (err) {
      return { ok: false, messageKey: phoneLinkMessageKey(err) };
    }
  },

  /**
   * LINK the phone — step 2. The backend checks the code with Twilio, writes
   * `auth.users.phone` (+ `phone_confirmed_at`) atomically, and mirrors `profiles.phone` /
   * `phone_verified` under the service role.
   *
   * No client-side mirror write is needed or wanted: doing it here would race the server's
   * own write and could leave the mirror set for a link the server rejected.
   */
  async verifyPhoneLink(code: string, phone?: string): Promise<AuthResult> {
    if (!phone) return { ok: false, messageKey: "errors.unknown" };
    try {
      await apiFetch("/api/auth/phone/check", { method: "POST", body: JSON.stringify({ phone, code }) });
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: phoneLinkMessageKey(err) };
    }
  },

  /**
   * The REAL confirmation state, read from `auth.users.phone_confirmed_at` server-side.
   *
   * Deliberately NOT `profiles.phone_verified`: the retired `verify-otp` route set that
   * mirror to true after checking a code from `otp_records` that was never actually
   * delivered — no SMS provider was wired — so legacy rows can claim a verification that
   * never happened.
   */
  async getPhoneConfirmation(): Promise<{ phone: string | null; confirmed: boolean }> {
    try {
      return await apiFetch<{ phone: string | null; confirmed: boolean }>("/api/auth/phone");
    } catch {
      return { phone: null, confirmed: false };
    }
  },

  /** Re-send the signup confirmation OTP email. */
  async sendOtp(email?: string): Promise<AuthResult> {
    if (!email) return { ok: false, messageKey: "errors.unknown" };
    try {
      await api.auth.resendSignupOtp(supabase, email.trim());
      return { ok: true, messageKey: "otp.sent" };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * Verify an email OTP. `type` is "signup" (confirm a new account) or "recovery"
   * (password reset). On success Supabase establishes the session, so the caller is
   * authenticated (signup) or holds a recovery session (reset → updatePassword).
   */
  async verifyOtp(code: string, email?: string, type: "signup" | "recovery" = "signup"): Promise<AuthResult> {
    if (!email) return { ok: false, messageKey: "errors.unknown" };
    try {
      await api.auth.verifyEmailOtp(supabase, { email: email.trim(), token: code, type });
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /** Send a Supabase password-reset email. Completing it needs a deep link. */
  async requestPasswordReset(identifier: string): Promise<AuthResult> {
    try {
      await api.auth.resetPasswordForEmail(supabase, identifier.trim());
      return { ok: true, messageKey: "forgot.emailSent" };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /** Update password — only succeeds inside a recovery session (deep link). */
  async resetPassword(password: string): Promise<AuthResult> {
    try {
      await api.auth.updatePassword(supabase, password);
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * Native Google sign-in (Play Services / Google SDK → Supabase `signInWithIdToken`).
   *
   * `cancelled` is NOT an error: the user dismissing the account sheet must leave the
   * screen exactly as it was, with no toast and no error box. It is reported as
   * `{ ok: false }` with NO messageKey, and the caller keys off that absence.
   */
  async googleSignIn(): Promise<AuthResult> {
    const outcome = await signInWithGoogle();
    if (outcome.status === "success") {
      // Social sign-in is an explicit, deliberate login — persist it across cold
      // launches, matching verifyLoginOtp. There is no "remember me" checkbox on the
      // Google path, and silently forgetting the session would look like a bug.
      await setRememberSession(true);
      return { ok: true };
    }
    if (outcome.status === "cancelled") return { ok: false };
    return { ok: false, messageKey: outcome.messageKey };
  },

  async signOut(): Promise<void> {
    // Remove this device's push token first (while the session is still valid for the
    // RLS-scoped delete), then clear Google's cached account so the next sign-in offers
    // the chooser, then end the Supabase session.
    await clearPushToken();
    await signOutGoogle();
    await api.auth.signOut(supabase);
  },

  /**
   * Request account deletion (F57 GDPR). Privileged/service-role op → backend REST.
   * The backend soft-deletes: sets profiles.status = "deletion_pending" (30-day grace),
   * cancels active appointments, and a nightly job anonymizes PII while RETAINING the
   * medical/legal records (appointments/prescriptions/payments are RESTRICT-protected).
   * Requires the literal { confirmation: "DELETE" } body. Patients are exempt from the
   * backend's AAL2 check, so an ordinary mobile session is sufficient.
   */
  async deleteAccount(): Promise<AuthResult> {
    try {
      await apiFetch("/api/users/me/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      return { ok: true };
    } catch (err) {
      // Already requested → treat as success (idempotent from the user's view).
      if (err instanceof ApiError && err.status === 409) return { ok: true };
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * Read the account lifecycle status (MED-016 / NEW-001).
   *
   * Reads `profiles` ONLY. That table is deliberately excluded from the restrictive
   * account-active RLS policy (20260811020000) precisely so a deletion_pending user can
   * still discover their own status and reach the restore screen — every PHI table is
   * blocked for them, so this must not join to one.
   *
   * Returns null when there is no session or the row cannot be read. Callers treat null as
   * "not pending" and let the account through: failing open here only risks showing the
   * normal app, and RLS is still denying the PHI underneath it. Failing closed would strand
   * a healthy user on a restore screen over a transient network blip.
   */
  async getAccountStatus(): Promise<AccountStatus | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (error || !data) return null;
      return (data.status as AccountStatus) ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Cancel a pending deletion and reactivate the account (MED-016 / NEW-001).
   *
   * Privileged: only the service role may write `profiles.status`, so this goes through the
   * existing backend route rather than Supabase-direct. No new endpoint was added.
   */
  async cancelDeletion(): Promise<AuthResult> {
    try {
      await apiFetch("/api/users/me/account/cancel-deletion", { method: "POST" });
      // The JWT does not carry account status — RLS reads profiles.status live — so the
      // token needs no re-mint for access to come back. Refresh anyway so the session is
      // demonstrably healthy before the caller routes into the app, and so any client that
      // caches user metadata sees the new state.
      await supabase.auth.refreshSession().catch(() => {});
      return { ok: true };
    } catch (err) {
      // 400 "No pending deletion request found" means someone else already restored it —
      // the user's goal is met, so report success rather than a confusing error.
      if (err instanceof ApiError && err.status === 400) return { ok: true };
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },
};
