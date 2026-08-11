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
import { api } from "@medilink/shared/mobile";

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

const e164 = (dialCode: string, local: string) => `${dialCode}${local}`;

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
