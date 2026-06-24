import { Platform } from "react-native";

/**
 * Typography system — wired to the OFFICIAL MediLink brand fonts (Brand Identity v1.0,
 * `design-tokens.json`):
 *   • Agatho          — serif, EN headlines & brand moments (Regular/Medium/Bold)
 *   • Manrope         — EN UI / body (Regular/Medium/SemiBold/Bold/ExtraBold)
 *   • 29LT Zarid Sans — all Arabic (single weight shipped)
 *
 * The licensed files live in `assets/fonts/` and are registered in `app/_layout.tsx`
 * via `useFonts(BRAND_FONT_FILES)` before the UI renders. Custom fonts do NOT
 * synthesise weights, so each (role, weight) resolves to a concrete loaded family
 * name rather than relying on RN's `fontWeight`.
 */
export const USE_BRAND_FONTS = true;

/** Registered with expo-font. Keys are the family names referenced by the resolver. */
export const BRAND_FONT_FILES = {
  "Agatho-Regular": require("../../assets/fonts/Agatho-Regular.otf"),
  "Agatho-Medium": require("../../assets/fonts/Agatho-Medium.otf"),
  "Agatho-Bold": require("../../assets/fonts/Agatho-Bold.otf"),
  "Manrope-Regular": require("../../assets/fonts/Manrope-Regular.otf"),
  "Manrope-Medium": require("../../assets/fonts/Manrope-Medium.otf"),
  "Manrope-SemiBold": require("../../assets/fonts/Manrope-SemiBold.otf"),
  "Manrope-Bold": require("../../assets/fonts/Manrope-Bold.otf"),
  "Manrope-ExtraBold": require("../../assets/fonts/Manrope-ExtraBold.otf"),
  "ZaridSans-Regular": require("../../assets/fonts/ZaridSans.ttf"),
} as const;

const systemSerif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" })!;
const systemSans = Platform.select({ ios: "System", android: "sans-serif", default: "System" })!;

export type FontRole = "heading" | "body" | "arabic";
export type FontWeight = "400" | "500" | "600" | "700" | "800";

/**
 * Resolve the concrete font family for a (role, weight, direction) combination.
 * Arabic content always uses 29LT Zarid Sans (single shipped weight). When brand
 * fonts are disabled we fall back to platform faces (right tone, not pixel-exact).
 */
export function fontFamilyFor(role: FontRole, weight: FontWeight, isRTL: boolean): string {
  if (isRTL || role === "arabic") {
    return USE_BRAND_FONTS ? "ZaridSans-Regular" : systemSans;
  }
  if (role === "heading") {
    if (!USE_BRAND_FONTS) return systemSerif;
    const w = Number(weight);
    if (w <= 400) return "Agatho-Regular";
    if (w <= 500) return "Agatho-Medium";
    return "Agatho-Bold";
  }
  // body / UI → Manrope
  if (!USE_BRAND_FONTS) return systemSans;
  switch (weight) {
    case "400": return "Manrope-Regular";
    case "500": return "Manrope-Medium";
    case "600": return "Manrope-SemiBold";
    case "700": return "Manrope-Bold";
    case "800": return "Manrope-ExtraBold";
    default: return "Manrope-Regular";
  }
}

/** Custom families already encode weight; only emit fontWeight with system fallbacks. */
export const EMIT_FONT_WEIGHT = !USE_BRAND_FONTS;

export type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  family: FontRole;
};

/**
 * Type scale (design-tokens.json · type/en + MediLink_Design_Documentation.pdf p5).
 * `family` resolves per-locale + weight. Display & H1 match the approved PDF
 * "Typography Scale" page exactly: Display = Agatho 40, Heading 1 = Agatho 28.
 */
export const typeScale = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: "700", family: "heading" },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700", family: "heading" },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: "500", family: "heading" },
  title: { fontSize: 16, lineHeight: 22, fontWeight: "800", family: "body" },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "400", family: "body" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", family: "body" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400", family: "body" },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof typeScale;
