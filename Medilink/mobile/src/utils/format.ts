import type { Locale } from "@/stores/localeStore";

/**
 * Locale-aware numeral formatting. Arabic artboards in
 * MediLink_Design_Documentation.pdf (OTP `٩ ٠ ٢`, dates, prices, counts) use
 * Eastern-Arabic-Indic digits, so any ASCII digit shown in the Arabic locale is
 * transliterated. English is returned unchanged.
 */
const EASTERN_ARABIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

/** Convert ASCII digits 0-9 in `input` to Eastern-Arabic-Indic for the `ar` locale. */
export function localizeDigits(input: string | number, locale: Locale): string {
  const str = String(input);
  if (locale !== "ar") return str;
  return str.replace(/[0-9]/g, (d) => EASTERN_ARABIC[Number(d)]!);
}
