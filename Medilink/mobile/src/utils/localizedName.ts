/**
 * Fallback rule for HAMS-authored Arabic entity names (doctors, clinics).
 * Per the implementation plan §1a, the Arabic value is shown ONLY when:
 *   • the UI is in RTL (Arabic locale), AND
 *   • an Arabic value exists, AND
 *   • it has been human-confirmed (status `verified` or `admin_entered`).
 * Machine-unverified drafts and missing values fall back to the English value.
 *
 * The app NEVER generates or machine-translates names — it only displays the
 * verified Arabic HAMS provides. Any other case returns the English name.
 */
const DISPLAYABLE_AR_STATUSES = new Set(["verified", "admin_entered"]);

export function localizedName(
  en: string,
  ar: string | null | undefined,
  status: string | null | undefined,
  isRTL: boolean
): string {
  if (isRTL && ar && status && DISPLAYABLE_AR_STATUSES.has(status)) return ar;
  return en;
}
