/**
 * Auth service — the single transport layer for authentication.
 *
 * Routing of work follows the audit (docs/MOBILE_HAMS_API_AUDIT.md):
 *   • sign-in / session / sign-out / reset → Supabase-direct (shared api.auth)
 *   • signup / send-otp / verify-otp        → backend REST (bearer apiFetch)
 *
 * Results carry a stable `messageKey` (an i18n key) rather than a raw English
 * string, so errors render correctly in both EN and AR. Tokens, OTP codes and
 * passwords are never logged.
 */
import { api } from "@medilink/shared/mobile";

import { isGoogleConfigured } from "@/config/env";
import type { MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { ApiError, apiFetch } from "@/services/api";

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
  const msg =
    typeof err === "object" && err && "message" in err
      ? String((err as { message: unknown }).message).toLowerCase()
      : "";
  if (msg.includes("network")) return "errors.network";
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
      return { ok: true };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  /**
   * Create the account (service-role, email auto-confirmed), then sign in to
   * obtain a session, then trigger the phone OTP. OTP send is best-effort: if
   * SMS isn't enabled in this environment, the user can resend on the OTP screen.
   */
  async signUp(input: SignUpInput): Promise<AuthResult> {
    const phone = e164(input.dialCode, input.phone);
    try {
      await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: input.email.trim(),
          password: input.password,
          full_name: input.fullName.trim(),
          phone,
          role: "patient",
        }),
      });
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }

    try {
      await api.auth.signInWithPassword(supabase, {
        email: input.email.trim(),
        password: input.password,
      });
    } catch {
      return { ok: false, messageKey: "errors.server" };
    }

    // Best-effort OTP dispatch (non-fatal).
    try {
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
    } catch {
      /* swallow: OTP screen offers Resend */
    }
    return { ok: true };
  },

  async sendOtp(phone?: string): Promise<AuthResult> {
    try {
      await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify(phone ? { phone } : {}),
      });
      return { ok: true, messageKey: "otp.sent" };
    } catch (err) {
      return { ok: false, messageKey: toMessageKey(err) };
    }
  },

  async verifyOtp(code: string, phone?: string): Promise<AuthResult> {
    try {
      await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(phone ? { code, phone } : { code }),
      });
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
