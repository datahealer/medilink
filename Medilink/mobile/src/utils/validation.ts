import { z } from "zod";

import type { MessageKey } from "@/i18n";

/** Localised translate fn passed in from a screen (keeps Zod messages in i18n). */
type T = (key: MessageKey) => string;

// Oman mobile numbers are 8 digits (the +968 country code is shown separately).
const OMAN_PHONE = /^[0-9]{8}$/;

// Oman civil number (national ID) — 8 digits. Optional field: empty is allowed;
// a non-empty value must match. Length is centralised here (plan F2 assumes 8).
export const CIVIL_NUMBER_LENGTH = 8;
export const CIVIL_NUMBER_RE = /^[0-9]{8}$/;
/** True when the value is empty (optional) OR a valid 8-digit civil number. */
export const isValidCivilNumber = (value: string): boolean => {
  const v = value.trim();
  return v === "" || CIVIL_NUMBER_RE.test(v);
};

/** Full name: required, at least 2 characters (mirrors signUpSchema). */
export const isValidName = (value: string): boolean => value.trim().length >= 2;

/** Empty allowed (optional) OR a valid Oman 8-digit local number. */
export const isValidOmanPhone = (value: string): boolean => {
  const v = value.trim();
  return v === "" || OMAN_PHONE.test(v);
};

/**
 * Best-effort extraction of an 8-digit Oman local number from a possibly-legacy
 * emergency-contact string like "Name · +968 9111 1111" (QA #3 backward-compat).
 * Strips non-digits, drops a leading 968 country code, and keeps the last 8 digits.
 * Returns "" when no plausible number is present (so the field shows empty, not junk).
 */
export const extractOmanLocalPhone = (value: string): string => {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("968") && digits.length > 8) digits = digits.slice(3);
  return digits.length >= 8 ? digits.slice(-8) : "";
};

/** Date of birth: empty allowed OR a real calendar date in YYYY-MM-DD, not in the future. */
export const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isValidDob = (value: string): boolean => {
  const v = value.trim();
  if (v === "") return true;
  if (!DOB_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.toISOString().slice(0, 10) !== v) return false; // rejects 2026-02-31 etc.
  return d.getTime() <= Date.now();
};

const email = (t: T) =>
  z.string().min(1, t("validation.required")).email(t("validation.email"));

/** Password policy mirrors the backend (`validatePassword`): 8+, upper, lower, number, special. */
const password = (t: T) =>
  z
    .string()
    .min(8, t("validation.passwordMin"))
    .regex(/[A-Z]/, t("validation.passwordUpper"))
    .regex(/[a-z]/, t("validation.passwordLower"))
    .regex(/[0-9]/, t("validation.passwordNumber"))
    .regex(/[^A-Za-z0-9]/, t("validation.passwordSpecial"));

export const signInSchema = (t: T) =>
  z.object({
    email: email(t),
    password: z.string().min(1, t("validation.required")),
    remember: z.boolean(),
  });
export type SignInForm = z.infer<ReturnType<typeof signInSchema>>;

// Sign Up matches PDF p12: full name, email, phone, a single password, terms.
// (No confirm-password field — that lives only on the Reset Password screen.)
export const signUpSchema = (t: T) =>
  z.object({
    fullName: z.string().trim().min(2, t("validation.nameMin")),
    email: email(t),
    phone: z.string().regex(OMAN_PHONE, t("validation.phone")),
    password: password(t),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: t("validation.terms") }),
    }),
  });
export type SignUpForm = z.infer<ReturnType<typeof signUpSchema>>;

export const forgotSchema = (t: T) =>
  z.object({ identifier: z.string().min(1, t("validation.required")) });
export type ForgotForm = z.infer<ReturnType<typeof forgotSchema>>;

export const resetSchema = (t: T) =>
  z
    .object({
      password: password(t),
      confirmPassword: z.string().min(1, t("validation.required")),
    })
    .refine((d) => d.password === d.confirmPassword, {
      path: ["confirmPassword"],
      message: t("validation.passwordsMismatch"),
    });
export type ResetForm = z.infer<ReturnType<typeof resetSchema>>;

/** 0–4 strength score + an i18n key for the label. Used by the reset screen meter. */
export function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3 | 4;
  labelKey: MessageKey;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labelKey = (["reset.weak", "reset.weak", "reset.fair", "reset.good", "reset.strong"] as const)[
    clamped
  ];
  return { score: clamped, labelKey };
}
