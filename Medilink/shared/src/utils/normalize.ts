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
 * Strip everything that is not a digit — phone numbers and civil numbers.
 *
 * These are identifiers, not prose: internal spaces in `"9111 1111"` are formatting, so
 * unlike a name they are removed rather than collapsed. Callers still apply their own
 * length/format rule (`OMAN_PHONE`, `CIVIL_NUMBER_RE`) afterwards.
 */
export function normalizeDigits(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  return input.replace(/\D/g, "");
}

/** True when a required text value is missing or only whitespace. */
export function isBlank(input: string | null | undefined): boolean {
  return normalizeHumanText(input) === "";
}
