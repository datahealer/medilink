import type { Locale } from "@/stores/localeStore";

/**
 * Numeral formatting.
 *
 * Product decision: the Arabic UI uses Western (Latin) numerals 0-9 — the same
 * digits as English — rather than Eastern-Arabic-Indic (٠١٢…). So digits are
 * returned unchanged in every locale.
 *
 * Kept as a locale-parameterised helper (rather than deleted) so the i18n layer and
 * every call site need no change, and any future locale-specific numeral rule can be
 * reintroduced here in exactly one place.
 */
export function localizeDigits(input: string | number, _locale: Locale): string {
  return String(input);
}
