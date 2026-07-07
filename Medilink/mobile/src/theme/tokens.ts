/**
 * MediLink design primitives — the single source of truth for the brand palette,
 * spacing rhythm and radii. Semantic light/dark themes are composed from these in
 * `light.ts` / `dark.ts`. Screens never import raw tokens; they read the resolved
 * theme via `useTheme()`.
 *
 * Brand palette (Brand Identity v1.0):
 *   Russian Violet     #2E1A47  · primary
 *   Shocking Lavender  #DFC8E7  · accent
 *   Smooth Pastel Blue #C3D7EE  · accent 2
 *   Eye White          #F9F4FA  · surface
 */
export const brand = {
  violet: "#2E1A47",
  lavender: "#DFC8E7",
  blue: "#C3D7EE",
  white: "#F9F4FA",
} as const;

/** Extended ramp used by both themes (kept small + intentional). */
export const palette = {
  violet: brand.violet,
  violet900: "#1C1030",
  violet800: "#241640",
  violet700: "#3A2560",
  lavender: brand.lavender,
  lavender200: "#E8DCF1",
  blue: brand.blue,
  white: brand.white,
  pureWhite: "#FFFFFF",
  ink: "#241338",
  muted: "#6C6379",
  borderLight: "#E8E0F0",

  // Semantic status (carry meaning only — never decorative).
  success: "#2F8F63",
  warning: "#B07D12",
  error: "#C93B56",
  info: "#3B6AA8",
} as const;

/** 8-pt spacing rhythm (Brand audit: consistent 8-pt grid). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/** Minimum accessible touch target (iOS HIG + Android Material). */
export const HIT_TARGET = 44;

export type Spacing = typeof spacing;
export type Radii = typeof radii;
