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

/* ───────────────────── COUNTRY-AWARE PHONE NUMBERS (QA G2) ─────────────────────
 *
 * THE BUG THIS EXISTS TO FIX. Every helper below used to assume Oman. `omanPhoneLocal`
 * ended with `digits.slice(-8)`, so a real Indian number came back as its LAST 8 DIGITS:
 *
 *     +919876543210  --load-->  76543210  --save-->  +96876543210
 *
 * Those 8 digits then passed validation (8 digits, not a dummy), so no error was shown and
 * a patient who edited their NAME had their phone silently rewritten to a different, wrong
 * number. Measured against production: 12 ACTIVE patient profiles hold +91 numbers, so this
 * was corrupting real contact details, not just failing a QA case.
 *
 * WHY A REGISTRY AND NOT A SECOND SET OF `indiaPhone*` HELPERS. A parallel family would put
 * the country choice at every call site, which is exactly how the Oman assumption spread in
 * the first place. One table, and the country becomes a parameter.
 *
 * DETECTION IS BY (calling code + TOTAL length), not by prefix alone. `+968` + 8 = 11 digits
 * and `+91` + 10 = 12 digits, so the two cannot collide. A bare 8-digit Oman number that
 * happens to start "91…" is length 8, matches neither, and is therefore treated as a local
 * number in the caller's country rather than mis-detected as India.
 *
 * UNRECOGNISED VALUES RETURN null / "" AND ARE NEVER RESHAPED. The 4 malformed +91 rows in
 * production (91 + 9, + 11, + 12 digits) are not guessable, so nothing here tries: callers
 * leave the field empty and omit it from the write, which preserves the stored value
 * verbatim. Repairing that data is a separate, explicitly-approved operation.
 */

export type PhoneCountryIso =
  | "OM"
  | "IN"
  | "US"
  | "CA"
  | "GB"
  | "AU"
  | "CN"
  | "AE"
  | "SA"
  | "QA"
  | "KW"
  | "BH"
  | "PK"
  | "BD";

export interface PhoneCountry {
  iso: PhoneCountryIso;
  /** E.164 calling code with the leading plus, e.g. "+968". */
  dialCode: string;
  /** Calling code digits only, e.g. "968". */
  cc: string;
  /** Exact number of subscriber digits after the calling code. */
  localLength: number;
  /** English display name for the picker. */
  name: string;
  /** Arabic display name — the picker is searchable in both locales. */
  nameAr: string;
  /** Regional-indicator flag emoji. Presentation only; never parsed. */
  flag: string;
}

/**
 * Supported countries for phone entry.
 *
 * ── WHY A FIXED `localLength` IS STILL CORRECT AT 14 COUNTRIES ──
 *
 * Every country here has a fixed-length MOBILE subscriber number, which is the only kind a
 * patient gives a clinic. That is what lets `phoneE164`, `phoneLocal`, `phoneInput` and
 * `phoneProblem` stay exactly as they were — the registry grew, the algorithms did not.
 * Adding a country with variable-length numbers (e.g. Germany) would require changing this
 * shape to a range, and that is a deliberate future decision, not an accident waiting to
 * happen.
 *
 * ── ORDER MATTERS FOR +1 ──
 *
 * The United States and Canada share calling code +1 with the same 10-digit length. Their
 * E.164 output is therefore IDENTICAL, so nothing about storage, validation or delivery is
 * ambiguous — only the flag shown. Telling them apart needs an NANP area-code table, which
 * would be a second, much larger registry for a purely cosmetic gain.
 *
 * So detection is deliberately DETERMINISTIC rather than clever: the first +1 entry wins,
 * and US is declared first. A Canadian patient may pick 🇨🇦 in the selector and see 🇺🇸 when
 * they reopen the screen; their number is stored and delivered correctly either way. This is
 * documented and pinned by a test rather than left as a surprise.
 *
 * ── ORDER ALSO MATTERS FOR PREFIX SHADOWING ──
 *
 * `COUNTRIES_BY_CC_LENGTH` below re-sorts by calling-code length so "968" is always tested
 * before "96"-style shorter codes and "880" before "88". Without that, a short code could
 * swallow a longer one and silently mis-country a number.
 */
export const PHONE_COUNTRIES: Record<PhoneCountryIso, PhoneCountry> = {
  // Oman first: the production market and the default.
  OM: { iso: "OM", dialCode: "+968", cc: "968", localLength: 8, name: "Oman", nameAr: "عُمان", flag: "🇴🇲" },
  IN: { iso: "IN", dialCode: "+91", cc: "91", localLength: 10, name: "India", nameAr: "الهند", flag: "🇮🇳" },
  // US BEFORE CA — see the +1 note above. Changing this order changes which flag a stored
  // +1 number displays.
  US: { iso: "US", dialCode: "+1", cc: "1", localLength: 10, name: "United States", nameAr: "الولايات المتحدة", flag: "🇺🇸" },
  CA: { iso: "CA", dialCode: "+1", cc: "1", localLength: 10, name: "Canada", nameAr: "كندا", flag: "🇨🇦" },
  GB: { iso: "GB", dialCode: "+44", cc: "44", localLength: 10, name: "United Kingdom", nameAr: "المملكة المتحدة", flag: "🇬🇧" },
  AU: { iso: "AU", dialCode: "+61", cc: "61", localLength: 9, name: "Australia", nameAr: "أستراليا", flag: "🇦🇺" },
  CN: { iso: "CN", dialCode: "+86", cc: "86", localLength: 11, name: "China", nameAr: "الصين", flag: "🇨🇳" },
  AE: { iso: "AE", dialCode: "+971", cc: "971", localLength: 9, name: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة", flag: "🇦🇪" },
  SA: { iso: "SA", dialCode: "+966", cc: "966", localLength: 9, name: "Saudi Arabia", nameAr: "السعودية", flag: "🇸🇦" },
  QA: { iso: "QA", dialCode: "+974", cc: "974", localLength: 8, name: "Qatar", nameAr: "قطر", flag: "🇶🇦" },
  KW: { iso: "KW", dialCode: "+965", cc: "965", localLength: 8, name: "Kuwait", nameAr: "الكويت", flag: "🇰🇼" },
  BH: { iso: "BH", dialCode: "+973", cc: "973", localLength: 8, name: "Bahrain", nameAr: "البحرين", flag: "🇧🇭" },
  PK: { iso: "PK", dialCode: "+92", cc: "92", localLength: 10, name: "Pakistan", nameAr: "باكستان", flag: "🇵🇰" },
  BD: { iso: "BD", dialCode: "+880", cc: "880", localLength: 10, name: "Bangladesh", nameAr: "بنغلاديش", flag: "🇧🇩" },
};

/**
 * Selector order: Oman and India first (the two markets that actually matter today), then
 * the rest alphabetically. Declaration order in the record above is authoritative for
 * DETECTION; this list is authoritative for DISPLAY.
 */
export const PHONE_COUNTRY_LIST: readonly PhoneCountry[] = [
  PHONE_COUNTRIES.OM,
  PHONE_COUNTRIES.IN,
  ...Object.values(PHONE_COUNTRIES)
    .filter((c) => c.iso !== "OM" && c.iso !== "IN")
    .sort((a, b) => a.name.localeCompare(b.name)),
];

/**
 * Free-text search over the country list, for the picker.
 *
 * Matches the English name, the Arabic name, the ISO code and the dial code, so a user can
 * type "oman", "عمان", "OM", "968" or "+968" and find the same row. Dial-code matching
 * ignores the "+" because a number pad may not offer one.
 */
export function searchPhoneCountries(
  query: string | null | undefined,
  list: readonly PhoneCountry[] = PHONE_COUNTRY_LIST
): readonly PhoneCountry[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return list;
  const qDigits = normalizeDigits(q);
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.nameAr.includes(q) ||
      c.iso.toLowerCase() === q ||
      (qDigits.length > 0 && c.cc.startsWith(qDigits))
  );
}

/** Oman — the product default. Nothing changes for an Oman patient. */
export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES.OM;

/** Longest calling code first, so a longer code can never be shadowed by a shorter one. */
const COUNTRIES_BY_CC_LENGTH: readonly PhoneCountry[] = Object.values(PHONE_COUNTRIES).sort(
  (a, b) => b.cc.length - a.cc.length
);

/** The country whose dial code this is (accepts "+968" or "968"), or `null`. */
export function phoneCountryForDialCode(dialCode: string | null | undefined): PhoneCountry | null {
  const cc = normalizeDigits(dialCode);
  return COUNTRIES_BY_CC_LENGTH.find((c) => c.cc === cc) ?? null;
}

/**
 * Which country a STORED value belongs to, or `null` when it matches none.
 *
 * `null` is meaningful and must not be coerced to Oman by the caller: it means "do not
 * touch this value". Requires an exact calling-code + local-length match, so a truncated or
 * over-long number is reported as unknown rather than being forced into a country.
 */
export function detectPhoneCountry(stored: string | null | undefined): PhoneCountry | null {
  const digits = normalizeDigits(stored);
  if (!digits) return null;
  return (
    COUNTRIES_BY_CC_LENGTH.find(
      (c) => digits.startsWith(c.cc) && digits.length === c.cc.length + c.localLength
    ) ?? null
  );
}

/**
 * Exact local subscriber digits for `country`, or `""`.
 *
 * NEVER truncates: a value that is not either bare-local or this country's full E.164
 * returns `""`, which is what stops the +91 → last-8-digits corruption.
 */
export function phoneLocal(
  input: string | null | undefined,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY
): string {
  const digits = normalizeDigits(input);
  if (digits.length === country.localLength) return digits;
  if (digits.startsWith(country.cc) && digits.length === country.cc.length + country.localLength) {
    return digits.slice(country.cc.length);
  }
  return "";
}

/**
 * Digits with this country's calling code removed, NOT length-capped — the honest input for
 * a validator, so 11 digits stay 11 and can be rejected instead of silently truncated.
 */
export function phoneDigits(
  input: string | null | undefined,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY
): string {
  const digits = normalizeDigits(input);
  if (digits.length > country.localLength && digits.startsWith(country.cc)) {
    return digits.slice(country.cc.length);
  }
  return digits;
}

/** Progressive keystroke sanitiser: folds Arabic-Indic, drops non-digits, caps at the country length. */
export function phoneInput(
  input: string | null | undefined,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY
): string {
  return phoneDigits(input, country).slice(0, country.localLength);
}

/**
 * Does this value CLAIM to be another country's E.164, even if malformed?
 *
 * `detectPhoneCountry` requires an exact length, so it reports `null` for the 4 malformed
 * `+91` rows in production (91 + 9, + 11, + 12 digits). Those would then fall through to
 * Oman's legacy-tolerant reader and DISPLAY as a truncated 8-digit number — not written
 * anywhere, but still misrepresenting the patient's number back to them.
 *
 * Three conditions together, because any two alone would misfire:
 *   • an explicit leading "+" — the value is asserting a country code
 *   • digits begin with a KNOWN calling code that is not the one asked for
 *   • longer than the target's local length
 *
 * The last two matter: a bare Oman number like `91234567` also begins with "91", so without
 * the "+" requirement and the length test this would reject legitimate Oman input.
 */
function claimsForeignDialCode(input: string | null | undefined, country: PhoneCountry): boolean {
  if (typeof input !== "string" || !input.trim().startsWith("+")) return false;
  const digits = normalizeDigits(input);
  if (digits.length <= country.localLength) return false;
  return COUNTRIES_BY_CC_LENGTH.some((c) => c.iso !== country.iso && digits.startsWith(c.cc));
}

/** Local digits → canonical E.164 for `country`, or `null` when the length is wrong. */
export function phoneE164(
  input: string | null | undefined,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY
): string | null {
  const local = phoneLocal(input, country);
  return local.length === country.localLength ? `${country.dialCode}${local}` : null;
}

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
  // QA G2 — THE FIX. The tolerant `slice(-8)` below is what mangled a foreign number into a
  // plausible-looking Oman one. Any value that is recognisably ANOTHER country's E.164 is
  // refused outright, so it can never reach the truncation. `""` tells the caller "not an
  // Oman number" — the field stays empty and the write is omitted, leaving the stored value
  // untouched. Detection needs an exact cc + length match, so this cannot swallow a
  // legitimate Oman value.
  const detected = detectPhoneCountry(input);
  if (detected && detected.iso !== "OM") return "";
  // Also refuse a MALFORMED foreign number (+91 with the wrong digit count). It detects as
  // null, so without this it would reach the trailing-8 fallback and display a truncated
  // number back to the patient as if it were theirs.
  if (claimsForeignDialCode(input, PHONE_COUNTRIES.OM)) return "";

  let digits = normalizeDigits(input);
  // Drop the country code only when doing so still leaves a full local number — otherwise
  // a legitimate local number that happens to begin "968…" would be truncated.
  if (digits.length > OMAN_LOCAL_LENGTH && digits.startsWith(OMAN_CC)) {
    digits = digits.slice(OMAN_CC.length);
  }
  // Still tolerant for OMAN shapes only: legacy emergency-contact strings really are stored
  // as "Name · +968 9111 1111", and a name containing a digit shifts the offset, so the
  // trailing-8 fallback is what loads those correctly (QA #3 back-compat).
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
