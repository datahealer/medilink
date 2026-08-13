import { z } from "zod";
import {
  DEFAULT_PHONE_COUNTRY,
  normalizeEmail,
  normalizeHumanText,
  detectPhoneCountry,
  normalizeDigits,
  phoneLocal,
  omanPhoneLocal,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from "@medilink/shared/mobile";

import type { MessageKey } from "@/i18n";

/** Localised translate fn passed in from a screen (keeps Zod messages in i18n). */
type T = (key: MessageKey) => string;

/**
 * Coarse bounds for the signup form's phone field, spanning every supported country's
 * subscriber length (Oman/Qatar/Kuwait/Bahrain 8 … China 11). Derived from the registry so
 * adding a country cannot leave this stale.
 *
 * These are NOT the real rule — `phoneProblem(value, country)` is, and the screen applies it
 * against the country the user actually picked. These bounds only stop an empty or absurd
 * value reaching that check.
 */
const LOCAL_PHONE_LENGTHS = Object.values(PHONE_COUNTRIES).map((c) => c.localLength);
export const MIN_LOCAL_PHONE_DIGITS = Math.min(...LOCAL_PHONE_LENGTHS);
export const MAX_LOCAL_PHONE_DIGITS = Math.max(...LOCAL_PHONE_LENGTHS);

/* ──────────────────── TRIVIAL / DUMMY NUMERIC IDENTIFIERS (QA MED-012, MED-013) ───────
 *
 * `00000000` satisfied both the civil-number and phone rules because each only checked
 * "exactly 8 digits". QA filed it twice; it is one missing rule.
 *
 * Deliberately narrow. Only two shapes are rejected, both of which are unambiguously
 * placeholder input rather than a real identifier:
 *
 *   • ALL IDENTICAL digits — 00000000, 11111111 … 99999999
 *   • A STRICT RUN of consecutive digits, ascending or descending — 12345678, 87654321
 *
 * Nothing else. In particular this does NOT implement a checksum: Oman's civil number has
 * no published check-digit algorithm that this repository or its docs establish, and
 * inventing one would reject real patients. See `isValidOmanPhone` for the same reasoning
 * applied to operator prefixes.
 */
function isAllSameDigit(digits: string): boolean {
  return digits.length > 1 && /^(\d)\1+$/.test(digits);
}

/**
 * A strict consecutive run, ascending or descending — 12345678, 87654321.
 *
 * Steps are compared MODULO 10 so the 9→0 wrap does not break the pattern. Without that,
 * `1234567890` (a 10-digit field's most obvious placeholder) escaped: every step is +1 until
 * 9→0, which is -9. Wrapping also catches `7890123456` and `0987654321`. A real subscriber
 * number that happens to be ten consecutive digits mod 10 is vanishingly unlikely — and
 * would read as fake to a human anyway.
 */
function isSequentialRun(digits: string): boolean {
  if (digits.length < 2) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1) - 48;
    const curr = digits.charCodeAt(i) - 48;
    if ((prev + 1) % 10 !== curr) ascending = false;
    if ((prev + 9) % 10 !== curr) descending = false;
  }
  return ascending || descending;
}

/* ── EXTENSION: the 00000007 class ───────────────────────────────────────────────────
 *
 * The two rules above only catch a value that is trivial along its WHOLE length, so
 * `00000007` slipped through: six zeros then a 7 is neither all-identical nor a strict run.
 * QA found it; the same hole passed `00000001`, `10000000` and `12121212`.
 *
 * Two more shapes, both still structurally obvious placeholders and neither country-specific:
 *
 *   • a RUN of >= 6 identical digits anywhere  → 00000007, 00000001, 10000000, 90000000
 *   • period-2 alternation (ABABAB…, A != B)   → 12121212, 45454545
 *
 * The run threshold is ABSOLUTE (6), not proportional. In an 8-digit field it means at least
 * three quarters of the value is one repeated digit; in a 10-digit Indian number it still
 * catches 9000000000 while leaving 9876500000 (a 5-zero run) alone. A proportional threshold
 * would have to be justified per length, and there is no source for that.
 *
 * STILL NO CHECKSUM AND STILL NO OPERATOR-PREFIX RULE. Both remain unsourced, and the
 * prefix rule is now measured as actively harmful: of the 8-digit local numbers in
 * production, leading digits include 0, 2, 5 and 8 as well as 9 — a `/^[79]/` rule would
 * break 5 of 12 existing rows.
 */
const MIN_REPEATED_RUN = 6;

function hasLongRepeatedRun(digits: string, minRun = MIN_REPEATED_RUN): boolean {
  let run = 1;
  for (let i = 1; i < digits.length; i++) {
    run = digits[i] === digits[i - 1] ? run + 1 : 1;
    if (run >= minRun) return true;
  }
  return false;
}

function isPeriod2Alternating(digits: string): boolean {
  // Needs at least two full periods to be a "pattern" rather than a coincidence.
  if (digits.length < 4) return false;
  if (digits[0] === digits[1]) return false; // that is all-identical territory
  for (let i = 2; i < digits.length; i++) {
    if (digits[i] !== digits[i % 2]) return false;
  }
  return true;
}

/**
 * True for placeholder input: 00000000, 11111111, 12345678, 87654321, and (added after QA
 * reported 00000007) long single-digit runs and period-2 alternations.
 *
 * Applies to identifiers a HUMAN types — civil number and phone. It must NOT be applied to a
 * server-generated OTP, where 000000 and 123456 are legitimate codes.
 */
export function isTrivialDigitSequence(digits: string): boolean {
  return (
    isAllSameDigit(digits) ||
    isSequentialRun(digits) ||
    hasLongRepeatedRun(digits) ||
    isPeriod2Alternating(digits)
  );
}

// Oman civil number (national ID) — 8 digits. Optional field: empty is allowed;
// a non-empty value must match. Length is centralised here (plan F2 assumes 8).
export const CIVIL_NUMBER_LENGTH = 8;
export const CIVIL_NUMBER_RE = /^[0-9]{8}$/;

/** Which rule a civil number breaks, or `null` when it is acceptable. */
export type CivilNumberProblem = "format" | "trivial";

/**
 * Validate a civil number. Empty stays valid — the field is optional (existing product
 * behaviour, preserved).
 *
 * Split from the boolean so the UI can say WHICH rule failed: "enter 8 digits" and "that
 * is not a real civil number" are different corrections for the user (QA MED-012).
 */
export function civilNumberProblem(
  value: string,
  opts?: { grandfathered?: boolean }
): CivilNumberProblem | null {
  const v = value.trim();
  if (v === "") return null;
  if (!CIVIL_NUMBER_RE.test(v)) return "format";
  // Same lockout reasoning as `nameProblem`: a stored value may predate the dummy rules, and
  // enforcing them against a field the user has not touched would make the whole screen
  // unsaveable — they could not even change their date of birth. The format rule always
  // applied, so it stays; the dummy rules engage the moment they edit the field.
  if (opts?.grandfathered) return null;
  if (isTrivialDigitSequence(v)) return "trivial";
  return null;
}

/** True when the value is empty (optional) OR a plausible 8-digit civil number. */
export const isValidCivilNumber = (value: string): boolean => civilNumberProblem(value) === null;

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

/* ───────────────── MEDICAL TAGS: allergies, conditions, medications, surgeries ─────────
 *                                                                        (QA MED-011)
 *
 * These four lists share one editor, and it previously did nothing but `trim()` plus a
 * case-SENSITIVE duplicate check: no length cap and no charset rule, so a 5,000-character
 * paste or a row of emoji became a permanent chip that overflowed its container.
 *
 * ── THIS IS CLINICAL SAFETY DATA, SO THE RULE IS PERMISSIVE BY DESIGN ──
 *
 * A wrongly-REJECTED allergy is more dangerous than an ugly one: the patient shrugs and
 * leaves it out, and the clinician never sees it. So the charset is an explicit allow-list
 * of everything real terminology uses, not a conservative alphabet:
 *
 *   letters, ANY script   Penicillin · حساسية · combining marks for Arabic harakat
 *   digits                Vitamin B12 · Amoxicillin 500mg
 *   space                 Sulfa drugs · Dust mites
 *   - ' ’                 Cow's milk · Iodine-based contrast
 *   . , ( ) / + & %       Peanut (raw) · Bee/wasp venom · NSAIDs, aspirin · 0.9% saline
 *
 * What that leaves out is exactly what breaks a chip or means nothing clinically: emoji,
 * control characters, and box-drawing/symbol blocks. A value must also contain at least
 * one letter or digit, so "..." and "---" are rejected.
 *
 * 60 characters comfortably fits the longest real terms ("Iodinated contrast media",
 * "Non-steroidal anti-inflammatory drugs") while making an accidental paste impossible.
 * Truncating instead of rejecting was considered and dropped: silently storing half an
 * allergy name is worse than asking the user to shorten it.
 */
export const MEDICAL_TAG_MAX = 60;

const MEDICAL_TAG_ALLOWED = /^[\p{L}\p{M}\p{N} '’\-.,()/+&%]+$/u;
const MEDICAL_TAG_HAS_CONTENT = /[\p{L}\p{N}]/u;

/** Which rule a medical tag breaks, or `null` when it is acceptable. */
export type MedicalTagProblem = "required" | "max" | "invalid" | "duplicate";

/**
 * Canonical form of a tag: ends trimmed, internal whitespace runs collapsed. This is the
 * value that gets stored, so validation and storage can never disagree.
 */
export const normalizeMedicalTag = (value: string): string => normalizeHumanText(value);

/**
 * Validate one tag against the existing list.
 *
 * Duplicates are matched case-INSENSITIVELY: "Penicillin" and "penicillin" are the same
 * allergy, and storing both makes a medication list look like two distinct entries.
 */
export function medicalTagProblem(value: string, existing: readonly string[] = []): MedicalTagProblem | null {
  const v = normalizeMedicalTag(value);
  if (v === "") return "required";
  if (v.length > MEDICAL_TAG_MAX) return "max";
  if (!MEDICAL_TAG_ALLOWED.test(v) || !MEDICAL_TAG_HAS_CONTENT.test(v)) return "invalid";
  const folded = v.toLocaleLowerCase();
  if (existing.some((e) => normalizeMedicalTag(e).toLocaleLowerCase() === folded)) return "duplicate";
  return null;
}

/** i18n key for the broken rule, or `null` when the tag is acceptable. */
export function medicalTagErrorKey(value: string, existing: readonly string[] = []): MessageKey | null {
  const problem = medicalTagProblem(value, existing);
  if (problem === null) return null;
  return (
    {
      // A blank submit is not an error worth shouting about — the editor just ignores it.
      required: "validation.required",
      max: "validation.tagMax",
      invalid: "validation.tagInvalid",
      duplicate: "validation.tagDuplicate",
    } as const
  )[problem];
}

/** Which rule a phone number breaks, or `null` when it is acceptable. */
export type OmanPhoneProblem = "format" | "trivial";

/**
 * Validate an Oman local mobile number. Empty stays valid — the field is optional.
 *
 * ── WHY THERE IS NO OPERATOR-PREFIX RULE (QA MED-013) ──
 *
 * The obvious tightening is `/^[79][0-9]{7}$/`, since Omani MOBILE numbers are commonly
 * documented as starting 7 or 9. It is deliberately NOT applied, on evidence:
 *
 *   • Nothing in this repository, its docs, or `shared/src/utils/normalize.ts` establishes
 *     an accepted prefix set. The rule would be invented, not sourced.
 *   • Live production data contradicts it. Of the 8-digit local numbers currently stored
 *     in `profiles.phone`, the leading digits observed were 9 (majority) but also 2, 5 and
 *     8 — roughly a third of existing rows. `2` is an Omani LANDLINE prefix, and this
 *     column is a general contact number, not a mobile-only field; it also backs the
 *     emergency-contact field, where a landline is entirely legitimate.
 *   • Enforcing the prefix would therefore reproduce the MED-007 SAVE BLOCKER exactly:
 *     a patient who never touched the field could not save Edit Profile at all.
 *
 * So this rejects only what is unambiguously placeholder input. Narrowing to real mobile
 * prefixes is a BUSINESS DECISION that needs (a) a confirmed prefix set and (b) a
 * migration plan for existing rows — most likely the same `grandfathered` treatment the
 * person-name rule uses. Documented rather than guessed.
 */
/**
 * Validate a LOCAL phone number against a specific country's rule (QA G2).
 *
 * The country is a parameter rather than an assumption. Oman's rule is unchanged — exactly 8
 * digits — and India's is its own exactly-10 rule, so supporting an Indian test number cannot
 * loosen anything for an Omani patient. A 10-digit Indian number entered while the field is
 * on Oman fails "format"; it is never truncated into a valid-looking Oman number.
 *
 * `grandfathered` skips only the dummy rules, never the length rule, for a value the user has
 * not edited — see `civilNumberProblem` for why.
 */
export function phoneProblem(
  value: string,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY,
  opts?: { grandfathered?: boolean }
): OmanPhoneProblem | null {
  const v = value.trim();
  if (v === "") return null;
  if (!new RegExp(`^[0-9]{${country.localLength}}$`).test(v)) return "format";
  if (opts?.grandfathered) return null;
  // 00000000, 11111111, 12345678, 87654321, 00000007, 12121212 … (QA MED-013 + G2)
  if (isTrivialDigitSequence(v)) return "trivial";
  return null;
}

/** Oman-bound wrapper. Kept because most call sites are Oman-only and read better this way. */
export function omanPhoneProblem(
  value: string,
  opts?: { grandfathered?: boolean }
): OmanPhoneProblem | null {
  return phoneProblem(value, PHONE_COUNTRIES.OM, opts);
}

/** Empty allowed (optional) OR a plausible Oman 8-digit local number. */
export const isValidOmanPhone = (value: string): boolean => omanPhoneProblem(value) === null;

/**
 * Any stored representation → the 8 editable local digits, or "".
 *
 * Now a thin alias for the shared `omanPhoneLocal` so there is exactly ONE conversion in
 * the codebase (QA MED-007). It previously reimplemented the same logic with an ASCII-only
 * `\D` strip, which silently discarded Arabic-Indic digits. Kept as a named export because
 * both profile screens use it, and the name says what the call site means.
 *
 * Handles the legacy shapes that really exist in this column: `91234567`,
 * `+96891234567`, `96891234567`, `"+968 9123 4567"`, and the emergency-contact strings
 * like `"Name · +968 9111 1111"` (QA #3 back-compat).
 */
export const extractOmanLocalPhone = omanPhoneLocal;

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
    // `normalizeDigits`, NOT `phoneInput` (QA MED-007). Both fold Arabic-Indic digits (an
    // ASCII-only `\D` strip silently emptied the field for anyone typing ٩١٢…), but only
    // `phoneInput` TRUNCATES to the country length — and a validator must never truncate,
    // or a 9-digit typo becomes a valid-looking wrong number. Here 9 digits stay 9 and are
    // rejected by the per-country rule. The length cap belongs to PhoneField, where the
    // user can see the field refuse the keystroke.
    //
    // COARSE gate only. The exact per-country length is checked in the SCREEN via
    // `phoneProblem(value, country)`, because the country is runtime state that the user
    // changes with the picker and a zod schema built once at mount cannot see it.
    //
    // That is not a second validation system — it is the SAME `phoneProblem` function
    // edit-profile has always used, and it is the precise gate. This rule exists so an
    // empty or obviously-malformed field still fails at the form level.
    //
    // `phoneDigits`, NOT `phoneInput` (QA MED-007): both fold Arabic-Indic digits and drop
    // a pasted dial code, but only `phoneInput` truncates — and a VALIDATOR must never
    // truncate, or an 11-digit typo becomes a valid-looking wrong number.
    phone: z
      .string()
      // Country-agnostic dial-code stripper, preserving MED-007's paste behaviour for EVERY
      // supported country rather than only Oman. `detectPhoneCountry` requires an exact
      // calling-code + length match, so "+96891111111" yields "91111111" while a bare
      // 9-digit typo stays 9 digits and is rejected by `phoneProblem` in the screen — it is
      // never truncated into a valid-looking wrong number.
      .transform((v) => {
        const digits = normalizeDigits(v);
        const detected = detectPhoneCountry(digits);
        return detected ? phoneLocal(digits, detected) : digits;
      })
      .pipe(
        z
          .string()
          .min(MIN_LOCAL_PHONE_DIGITS, t("validation.phone"))
          .max(MAX_LOCAL_PHONE_DIGITS, t("validation.phone"))
      ),
    password: password(t),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: t("validation.terms") }),
    }),
  });
export type SignUpForm = z.infer<ReturnType<typeof signUpSchema>>;

export const forgotSchema = (t: T) =>
  z.object({
    // QA MED-020 — this used to be `min(1)` with NO `.email()` check, so "abc" passed
    // validation, fired a real `resetPasswordForEmail("abc")` request, and surfaced
    // whatever generic error came back ("Unexpected error") instead of telling the user
    // their email was malformed. That is the "incorrect/unclear message for an invalid
    // email" report, and it also meant an obviously invalid value hit the network.
    //
    // It now uses the SAME `email(t)` rule as sign-in and sign-up, so all three screens
    // give one message for one problem. The field keeps the name `identifier` (renaming
    // it would touch the screen for no behavioural gain), but it is email-only: the
    // screen's own copy says "Enter the email for your account" and the service calls
    // `resetPasswordForEmail`. Normalisation is unchanged — `email()` also trims and
    // lowercases, so "  Me@X.com " still reaches Supabase as "me@x.com".
    identifier: email(t),
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
