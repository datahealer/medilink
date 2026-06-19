/** MediLink brand palette — shared source of truth for light & dark themes. */
export const brand = {
  violet: "#2E1A47", // Russian Violet
  lavender: "#DFC8E7", // Shocking Lavender
  blue: "#C3D7EE", // Smooth Pastel Blue
  white: "#F9F4FA", // Eye White
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  muted: string;
  border: string;
}

export const lightColors: ThemeColors = {
  background: brand.white,
  surface: "#FFFFFF",
  foreground: brand.violet,
  primary: brand.violet,
  primaryForeground: brand.white,
  accent: brand.lavender,
  muted: brand.blue,
  border: "#E7DCEE",
};

export const darkColors: ThemeColors = {
  background: "#1C1030",
  surface: "#241640",
  foreground: brand.white,
  primary: brand.lavender,
  primaryForeground: brand.violet,
  accent: "#3A2560",
  muted: "#2A1C44",
  border: "#3A2560",
};

export const radii = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
