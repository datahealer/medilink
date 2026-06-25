import { palette, radii, spacing } from "./tokens";

/**
 * Semantic colour roles for the LIGHT theme — values are 1:1 with the approved
 * MediLink design tokens (`design-tokens.json` → semantic/light). Components
 * reference roles (`colors.primary`, `colors.textMuted`, …), never raw hex, so the
 * dark theme is a single-file swap.
 */
export const lightColors = {
  background: "#F9F4FA", // appBg (Eye White) — the app screen surface
  surface: "#FFFFFF", // cards
  surfaceAlt: "#F4EEF9", // surface2 — search field, unselected chips, subtle fills
  text: "#241338",
  textMuted: "#6C6379",
  textFaint: "#9A92A8",
  textOnPrimary: "#FFFFFF", // primaryContrast
  primary: palette.violet, // #2E1A47 Russian Violet
  primaryMuted: "#6E4AA0", // violet (PDF vector) — decorative/pressed/track
  accent: palette.lavender, // #DFC8E7
  accent2: palette.blue, // #C3D7EE
  border: "#E8E0F0",
  inputBackground: "#FFFFFF",
  overlay: "rgba(36, 19, 56, 0.45)",
  // Status
  success: "#2F8F63",
  successSurface: "#DCF3E7", // soft success tint (e.g. confirmation badge)
  warning: "#B07D12",
  error: "#C93B56",
  errorSurface: "#FBE7EC", // soft error tint (e.g. blood-group pill)
  info: "#3B6AA8",
  // Splash / brand hero (violet gradient — sampled from the PDF splash artboard)
  heroFrom: "#2E1A47",
  heroTo: "#3B2056",
} as const;

/** Colour roles (values widened to `string` so the dark theme can override them). */
export type ThemeColors = Record<keyof typeof lightColors, string>;

export const lightTheme = {
  scheme: "light" as const,
  colors: lightColors,
  spacing,
  radii,
};
