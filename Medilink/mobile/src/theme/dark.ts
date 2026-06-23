import type { ThemeColors } from "./light";
import { radii, spacing } from "./tokens";

/**
 * DARK theme — values are 1:1 with the approved MediLink design tokens
 * (`design-tokens.json` → semantic/dark) and were cross-checked by pixel-sampling
 * the rendered dark-mode screens in `MediLink_Design_Documentation.pdf`
 * (background ≈ #120C20, surface ≈ #211633, border ≈ #3A2A53 — matching below).
 *
 * The dark base is a NEAR-BLACK deep violet (#0F0A18), NOT the brand primary
 * #2E1A47. Purple appears only where the PDF uses it: the lavender CTA/primary,
 * raised surfaces, accents, selected chips and icons.
 */
export const darkColors: ThemeColors = {
  background: "#0F0A18", // bg — near-black violet screen base
  surface: "#221634", // cards
  surfaceAlt: "#2B1D40", // surface2 — inputs, search, unselected chips
  text: "#F1EBF8",
  textMuted: "#B4A8C6",
  textFaint: "#7E7493",
  textOnPrimary: "#241338", // primaryContrast — dark text on the lavender CTA
  primary: "#DFC8E7", // Shocking Lavender becomes primary on dark
  primaryMuted: "#E8DCF1", // lavender200
  accent: "#4A3168",
  accent2: "#2F4A6B",
  border: "#3A2B53",
  inputBackground: "#2B1D40",
  overlay: "rgba(0, 0, 0, 0.55)",
  // Status (dark variants)
  success: "#5FCF9B",
  warning: "#E0B25A",
  error: "#EF7D93",
  info: "#9CC1EE",
  // Splash / onboarding hero (deep violet gradient into the near-black base)
  heroFrom: "#2E1A47",
  heroTo: "#0F0A18",
};

export const darkTheme = {
  scheme: "dark" as const,
  colors: darkColors,
  spacing,
  radii,
};
