import { z } from "zod";
import { normalizeEmail, normalizeHumanText } from "@medilink/shared/mobile";

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

/* ─────────────────────────── PERSON NAMES (QA MED-001) ───────────────────────────
 *
 * ONE rule, used by every screen that captures a human name: sign-up, first-time setup,
 * edit profile, and add/edit family member. Previously each screen invented its own check
 * (`!!trim()`, `trim().length < 2`, or a Zod `min(2)`), so "Satyam123", "@@@@" and a
 * 5,000-character paste were accepted in some places and not others.
 *
 * ── WHY AN ALLOW-LIST BY UNICODE PROPERTY, NOT AN ASCII RANGE ──
 *
 * `[A-Za-z ]` would reject every Arabic name in the product's primary market, and
 * `[A-Za-z؀-ۿ]` would still reject Persian, Urdu and extended-Arabic letters
 * that legitimately appear in Omani records. `\p{L}` is every letter in every script, so
 * Arabic, Latin, and a mixed-script name like "محمد Ali" all pass without enumerating
 * anything. `\p{M}` covers combining marks, which is what Arabic harakat (مُحَمَّد) are —
 * omitting it would reject correctly-vowelised names.
 *
 * Punctuation is limited to the four marks that occur inside real names:
 *   -  Al-Harthy        '  O'Brien        ’  O’Brien (curly, what iOS types)        .  Jr.
 *
 * Digits and emoji are absent from the class, so they are rejected. Whitespace is allowed
 * INSIDE the name only — `normalizeHumanText` has already stripped the ends and collapsed
 * internal runs, so the value tested here is the value that will be stored.
 *
 * Must START with a letter, which rejects "-Ali", "'''" and ".".
 *
 * NOTE: `\p{...}` needs the `u` flag. Hermes compiles regex literals at bundle time, so a
 * successful `expo export` proves the engine accepts this pattern.
 */
export const NAME_MIN = 2;
/** Comfortably fits Arabic tri-partite names and long Iberian/South-Asian names. */
export const NAME_MAX = 100;

const NAME_ALLOWED = /^\p{L}[\p{L}\p{M}\s'’.-]*$/u;

/** Which rule a name breaks, or `null` when it is acceptable. */
export type NameProblem = "required" | "min" | "max" | "invalid";

/**
 * Validate a person name against the shared rule.
 *
 * `grandfathered` exists to prevent a lockout, and is NOT cosmetic. Screens that EDIT an
 * existing record seed the field from the database, and that stored value may predate this
 * rule (HAMS rows, or a Google display name containing an emoji). If the charset and
 * length rules were enforced against an untouched seeded value, the user could never save
 * the screen at all — not even to change their date of birth. So while the field still
 * holds exactly what was loaded, only the rules that always applied are enforced
 * (present, at least NAME_MIN). The moment the user edits the field, the full rule applies
 * to what they typed.
 */
export function nameProblem(
  value: string,
  opts?: { grandfathered?: boolean }
): NameProblem | null {
  const v = normalizeHumanText(value);
  if (v === "") return "required";
  if (v.length < NAME_MIN) return "min";
  if (opts?.grandfathered) return null;
  if (v.length > NAME_MAX) return "max";
  if (!NAME_ALLOWED.test(v)) return "invalid";
  return null;
}

/** i18n key for the broken rule, or `null` when the name is acceptable. */
export function nameErrorKey(
  value: string,
  opts?: { grandfathered?: boolean }
): MessageKey | null {
  const problem = nameProblem(value, opts);
  if (problem === null) return null;
  return (
    {
      required: "validation.nameMin",
      min: "validation.nameMin",
      max: "validation.nameMax",
      invalid: "validation.nameInvalid",
    } as const
  )[problem];
}

/**
 * Full name acceptable? Thin boolean wrapper over `nameProblem` for call sites that only
 * gate a submit button. Prefer `nameErrorKey` where a message is shown, so the user is
 * told WHICH rule failed rather than always seeing "enter your full name".
 */
export const isValidName = (value: string, opts?: { grandfathered?: boolean }): boolean =>
  nameProblem(value, opts) === null;

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

/**
 * Email: normalized (trimmed + lowercased) BEFORE the format check, so "  A@b.com "
 * validates and — because Zod transforms — the form's parsed output is the normalized
 * address the API will receive.
 */
const email = (t: T) =>
  z
    .string()
    .transform(normalizeEmail)
    .pipe(z.string().min(1, t("validation.required")).email(t("validation.email")));

/** Password policy mirrors the backend (`validatePassword`): 8+, upper, lower, number, special. */
const password = (t: T) =>
  z
    .string()
    .min(8, t("validation.passwordMin"))
    .regex(/[A-Z]/, t("validation.passwordUpper"))
    .regex(/[a-z]/, t("validation.passwordLower"))
    .regex(/[0-9]/, t("validation.passwordNumber"))
    .regex(/[^A-Za-z0-9]/, t("validation.passwordSpecial"));

/**
 * Shared person-name field for Zod forms. Normalizes first, so the value the form hands to
 * the service is the value that will be stored, and the length is measured on that.
 */
const personName = (t: T) =>
  z
    .string()
    .transform(normalizeHumanText)
    .pipe(
      z
        .string()
        .min(NAME_MIN, t("validation.nameMin"))
        .max(NAME_MAX, t("validation.nameMax"))
        .regex(NAME_ALLOWED, t("validation.nameInvalid"))
    );

export const signInSchema = (t: T) =>
  z.object({
    email: email(t),
    // WHITESPACE-ONLY IS REJECTED; THE PASSWORD IS NEVER MODIFIED (QA MED-005).
    //
    // `min(1)` alone accepted "   " and fired a real auth request. The refine below blocks
    // that, but note what it deliberately does NOT do: there is no `.trim()` and no
    // transform anywhere on this field.
    //
    // Trimming here would be a silent lockout. A space is a legal password character; if
    // someone registered with " hunter2 ", that is what is hashed in Supabase, and sending
    // "hunter2" would be a DIFFERENT credential that can never match — they could never sign
    // in again, and the failure would look like a wrong password. See the note on `password`
    // in shared/src/utils/normalize.ts, which makes the same decision at the API boundary.
    //
    // Rejecting whitespace-ONLY is safe because it can never be a real credential: the
    // signup policy below requires an uppercase letter, a lowercase letter, a digit and a
    // symbol, so no account can exist whose password is nothing but spaces.
    password: z
      .string()
      .min(1, t("validation.required"))
      .refine((v) => v.trim().length > 0, t("validation.required")),
    remember: z.boolean(),
  });
export type SignInForm = z.infer<ReturnType<typeof signInSchema>>;

// Sign Up matches PDF p12: full name, email, phone, a single password, terms.
// (No confirm-password field — that lives only on the Reset Password screen.)
export const signUpSchema = (t: T) =>
  z.object({
    // Shared rule (QA MED-001): normalized, 2–100 chars, letters/marks + - ' ’ . only, so
    // "Satyam123", "@@@@", an emoji and a 5,000-char paste are all rejected here rather
    // than reaching the database. Arabic and mixed-script names pass — see personName.
    fullName: personName(t),
    email: email(t),
    phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(OMAN_PHONE, t("validation.phone"))),
    password: password(t),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: t("validation.terms") }),
    }),
  });
export type SignUpForm = z.infer<ReturnType<typeof signUpSchema>>;

export const forgotSchema = (t: T) =>
  z.object({
    // Normalized so "  me@x.com " reaches resetPasswordForEmail as "me@x.com" and a
    // whitespace-only entry is rejected as required rather than sent as a blank identifier.
    identifier: z
      .string()
      .transform(normalizeEmail)
      .pipe(z.string().min(1, t("validation.required"))),
  });
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
