import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { useThemeStore, type ColorMode } from "@/stores/themeStore";
import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import type { ThemeColors } from "./light";

export interface Theme {
  scheme: "light" | "dark";
  colors: ThemeColors;
  spacing: typeof lightTheme.spacing;
  radii: typeof lightTheme.radii;
}

interface ThemeContextValue {
  theme: Theme;
  /** User preference (light/dark/system). */
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Resolves the active theme from the persisted user preference + the OS colour
 * scheme, and exposes it via context. Every component reads colours/spacing from
 * here — no hardcoded values in screens.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? "light";
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const toggleStore = useThemeStore((s) => s.toggle);

  const scheme: "light" | "dark" = mode === "system" ? systemScheme : mode;
  const theme = scheme === "dark" ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      setMode,
      toggle: () => toggleStore(scheme),
    }),
    [theme, mode, setMode, toggleStore, scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
