/**
 * Auth service — the single transport layer for authentication.
 *
 * All auth runs through official Supabase Auth (shared `api.auth`), Supabase-direct:
 *   • sign-in / session / sign-out            → password grant
 *   • sign-up                                  → auth.signUp (email confirmation OTP)
 *   • verify / resend OTP                      → auth.verifyOtp / auth.resend (email)
 *   • password reset                           → resetPasswordForEmail → recovery OTP
 *
 * The previous custom `otp_records` backend flow (send/verify/resend-otp, service-role
 * signup) is retired; delivery was never wired. Results carry a stable `messageKey`
 * (an i18n key) so errors render in EN + AR. Tokens, OTP codes and passwords are
 * never logged.
 */
import { api } from "@medilink/shared/mobile";

import { isGoogleConfigured } from "@/config/env";
import type { MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { setRememberSession } from "@/lib/authPersistence";
import { ApiError } from "@/services/api";

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
  /** i18n key for a user-facing message (error or info). */
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

  async googleSignIn(): Promise<AuthResult> {
    if (!isGoogleConfigured) {
      return { ok: false, messageKey: "errors.googleNotConfigured" };
    }
    // Real native Google OAuth requires expo-auth-session + redirect config.
    // Client IDs exist but the native flow is intentionally not wired here;
    // surface the same honest "not configured" state until it is.
    return { ok: false, messageKey: "errors.googleNotConfigured" };
  },

  async signOut(): Promise<void> {
    await api.auth.signOut(supabase);
  },
};
