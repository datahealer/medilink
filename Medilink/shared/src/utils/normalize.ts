/**
 * Input normalization — one policy, applied at the write boundary.
 *
 * WHY THIS EXISTS
 * `"    Satyam    "` used to reach the database verbatim. Every MediLink screen
 * happened to call `.trim()` before submitting, but `shared/src/api/*` — the layer BOTH
 * web and mobile write through, and the layer a direct call would use with the caller's
 * own session — normalized nothing. So the protection lived entirely in the UI, which is
 * exactly where protection does not belong.
 *
 * These helpers are applied inside `shared/src/api/*` (see profile.ts, family.ts,
 * records.ts, reviews.ts, appointments.ts, auth.ts) so a caller that forgets to trim
 * cannot persist padded text. UI-level trimming is kept where it already existed, because
 * it is what lets a screen show "name is required" before a round-trip — but it is no
 * longer the thing standing between a user and a badly-stored value.
 *
 * RESIDUAL GAP (deliberate, documented): a request made directly against PostgREST with a
 * valid user JWT bypasses this module entirely, because it never runs our TypeScript. Only
 * a database CHECK constraint or trigger could close that, which is a schema change on a
 * database shared with HAMS — see the audit report rather than adding one here.
 *
 * ── WHITESPACE POLICY ──
 *
 * `trim()` alone is not enough and `replace(/\s+/g, "")` is far too much. The rule is:
 *   • strip leading and trailing whitespace
 *   • collapse *runs* of whitespace to a single space
 *   • preserve single spaces between words
 *
 * So `"  Satyam   Kumar  "` → `"Satyam Kumar"`, while `"Satyam Kumar"` and
 * `"Al Noor Medical Center"` pass through byte-identical.
 *
 * ── ARABIC SAFETY ──
 *
 * JS `\s` matches Unicode whitespace (including U+00A0 NBSP, which copy-paste introduces)
 * but does NOT match the format characters Arabic shaping depends on: ZWJ (U+200D), ZWNJ
 * (U+200C) and tatweel (U+0640) all survive. Diacritics/harakat are combining marks, not
 * whitespace, so they survive too. Nothing here transliterates, reorders or rewrites
 * script — an Arabic value in is the same Arabic value out, minus padding.
 *
 * NFC normalization matches what HAMS already does for Arabic names
 * (`hams-platform/src/lib/arabicName.ts`), so the same name typed on two keyboards
 * compares equal on both sides of the shared database.
 */

/** Unicode-whitespace run, used for the collapse step. */
const WHITESPACE_RUN = /\s+/g;
/** Horizontal whitespace only — excludes newlines, so free text keeps its line breaks. */
const HORIZONTAL_RUN = /[^\S\r\n]+/g;

/**
 * A required human-readable value: name, clinic name, document title, specialty.
 *
 * Trims, collapses internal runs to a single space, and NFC-normalizes. Returns `""` for
 * a whitespace-only input, so `isBlank()` (or a `.min(1)`) rejects it rather than a padded
 * empty string being stored.
 */
export function normalizeHumanText(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return input.normalize("NFC").replace(WHITESPACE_RUN, " ").trim();
}

/**
 * The same rule for a NULLABLE column: an empty result becomes `null` rather than `""`.
 *
 * Storing `""` and `null` for "not provided" in the same column is how a UI ends up
 * rendering an empty line where it meant to render nothing.
 */
export function normalizeOptionalText(input: string | null | undefined): string | null {
  const value = normalizeHumanText(input);
  return value === "" ? null : value;
}

/**
 * Multi-line free text: notes, reason for visit, review comments.
 *
 * Trims the whole value and collapses runs of spaces/tabs, but PRESERVES newlines — a
 * patient who typed a list across three lines meant three lines. Trailing spaces are
 * stripped per line so an invisible ` \n` does not survive. Empty → `null`.
 */
export function normalizeFreeText(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input
    .normalize("NFC")
    .replace(HORIZONTAL_RUN, " ")
    .replace(/ +$/gm, "")
    .replace(/^ +/gm, "")
    .trim();
  return value === "" ? null : value;
}

/**
 * A search box. Trimmed, runs collapsed, and a whitespace-only query returns `""`.
 *
 * `""` is the signal for "no query" — callers MUST branch on it rather than passing it to
 * a `LIKE`. `ilike("full_name", "%  Ahmed  %")` requires literal padding inside the stored
 * name and therefore matches nothing, which is precisely how search silently failed for
 * anyone whose keyboard added a trailing space.
 */
export function normalizeSearchQuery(input: string | null | undefined): string {
  return normalizeHumanText(input);
}

/**
 * Email: trim and lowercase the whole address.
 *
 * Lowercasing the local part is technically lossy per RFC 5321, but every provider this
 * product touches treats it case-insensitively, and Supabase Auth already stores and
 * compares lowercased. Not doing it here would let `"  Foo@x.com "` and `"foo@x.com"`
 * become two accounts.
 */
export function normalizeEmail(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase();
}

/**
 * Fold Eastern-Arabic-Indic (٠-٩, U+0660-0669) and Extended/Persian (۰-۹, U+06F0-06F9)
 * digits onto ASCII 0-9.
 *
 * WHY THIS IS NEEDED: JS `\d` matches ASCII only, so `"٩١٢٣٤٥٦٧".replace(/\D/g, "")`
 * returns `""` — an Arabic-keyboard user typing their own phone number watched the field
 * silently stay empty. Folding first turns that into `"91234567"`.
 *
 * This is a fold, NOT a display choice. The product renders Western numerals in every
 * locale (see mobile/src/utils/format.ts — `localizeDigits` deliberately returns its input
 * unchanged), so ASCII is already the canonical digit alphabet; this only lets input in.
 */
function foldDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Strip everything that is not a digit — phone numbers and civil numbers.
 *
 * These are identifiers, not prose: internal spaces in `"9111 1111"` are formatting, so
 * unlike a name they are removed rather than collapsed. Arabic-Indic digits are folded to
 * ASCII first (see `foldDigits`) rather than being thrown away. Callers still apply their
 * own length/format rule (`OMAN_PHONE`, `CIVIL_NUMBER_RE`) afterwards.
 */
export function normalizeDigits(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return foldDigits(input).replace(/\D/g, "");
}

/* ─────────────────────────── OMAN PHONE NUMBERS (QA MED-007) ───────────────────────────
 *
 * ONE contract, because there were three. `authService.signUp` wrote E.164
 * (`+96891234567`), the mobile profile screens wrote whatever was typed, and the web
 * profile form wrote a spaced free-text value (`+968 9123 4567`). Edit Profile then
 * validated the stored value against `/^[0-9]{8}$/`, so a normally-registered patient
 * failed validation on a field they had never touched and could not save the screen.
 *
 * CANONICAL STORAGE IS E.164: `+968` followed by exactly 8 digits.
 *
 * That is not a preference — it is what the rest of the system already documents:
 *   • `authService.signUp` already writes it, so it is what most rows hold.
 *   • `backend/src/lib/openapi/schemas.ts` documents `profiles.phone` as `+96890000000`.
 *   • `backend/src/app/api/auth/send-otp` REQUIRES E.164, so any future phone auth needs it.
 *   • `checkin_my_appointment(p_patient_phone text)` accepts free text, so HAMS is neutral.
 *   • `profiles.phone` is a plain nullable TEXT column with no CHECK — no migration needed.
 *
 * Conversion is deterministic and idempotent in both directions:
 *   stored `+96891234567`  --omanPhoneLocal-->  editable `91234567`
 *   editable `91234567`    --omanPhoneE164-->   stored `+96891234567`
 * Re-running either is a no-op, which is what stops `+968+96891234567`.
 */

/** Oman's E.164 country calling code. */
export const OMAN_DIAL_CODE = "+968";
const OMAN_CC = "968";
const OMAN_LOCAL_LENGTH = 8;

/**
 * Any historical representation → the 8 editable local digits, or `""`.
 *
 * Tolerant on purpose: rows exist as `91234567`, `+96891234567`, `96891234567`,
 * `"+968 9123 4567"` and (from a retired backend route) bare digits. All of them must load
 * into the edit field as the same 8 digits, or the user sees a mangled number.
 *
 * Returns `""` when nothing plausible is present, so the field shows empty rather than junk.
 */
export function omanPhoneLocal(input: string | null | undefined): string {
  let digits = normalizeDigits(input);
  // Drop the country code only when doing so still leaves a full local number — otherwise
  // a legitimate local number that happens to begin "968…" would be truncated.
  if (digits.length > OMAN_LOCAL_LENGTH && digits.startsWith(OMAN_CC)) {
    digits = digits.slice(OMAN_CC.length);
  }
  return digits.length >= OMAN_LOCAL_LENGTH ? digits.slice(-OMAN_LOCAL_LENGTH) : "";
}

/**
 * Digits only, Arabic-Indic folded, country code removed — but NOT length-capped.
 *
 * This is the honest input for a VALIDATOR: it makes a pasted `+96891234567` comparable to
 * a typed `91234567` without hiding a mistake. Nine digits stay nine digits, so a validator
 * can reject them instead of a truncation silently storing a different number than the one
 * the user entered.
 */
export function omanPhoneDigits(input: string | null | undefined): string {
  const digits = normalizeDigits(input);
  // Only when what remains is still a full local number — otherwise a local number that
  // legitimately begins "968…" would lose its first three digits.
  if (digits.length > OMAN_LOCAL_LENGTH && digits.startsWith(OMAN_CC)) {
    return digits.slice(OMAN_CC.length);
  }
  return digits;
}

/**
 * Progressive INPUT sanitiser for the editable field — safe to run on every keystroke.
 *
 * Differs from `omanPhoneLocal` in that a partial number must survive: typing "9" returns
 * "9", not "". Differs from `omanPhoneDigits` in that it caps at 8, which is what stops a
 * 9th keystroke from registering.
 *
 * The cap is only appropriate at the INPUT boundary, where the user sees the field refuse
 * the extra character. A validator must not use this — see `omanPhoneDigits`.
 */
export function omanPhoneInput(input: string | null | undefined): string {
  return omanPhoneDigits(input).slice(0, OMAN_LOCAL_LENGTH);
}

/**
 * Any representation → canonical E.164, or `null` when it is not a valid Oman number.
 *
 * `null` means "no phone" and is what a nullable column wants. Callers must validate
 * before relying on a non-null result; this deliberately does not throw, so a bad value
 * cannot break a profile save that also carried valid changes to other fields.
 */
export function omanPhoneE164(input: string | null | undefined): string | null {
  const local = omanPhoneLocal(input);
  return local.length === OMAN_LOCAL_LENGTH ? `${OMAN_DIAL_CODE}${local}` : null;
}

/** True when a required text value is missing or only whitespace. */
export function isBlank(input: string | null | undefined): boolean {
  return normalizeHumanText(input) === "";
}
