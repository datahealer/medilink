import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

import {
  darkColors,
  lightColors,
  radii,
  spacing,
  type ThemeColors,
} from "@/theme/tokens";

type ColorMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ColorMode; // user preference
  scheme: "light" | "dark"; // resolved scheme actually in use
  colors: ThemeColors;
  radii: typeof radii;
  spacing: typeof spacing;
  setMode: (mode: ColorMode) => void;
}

const STORAGE_KEY = "medilink.colorMode";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() ?? "light";
  const [mode, setModeState] = useState<ColorMode>("system");

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next);
  }, []);

  const scheme: "light" | "dark" = mode === "system" ? system : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors: scheme === "dark" ? darkColors : lightColors,
      radii,
      spacing,
      setMode,
    }),
    [mode, scheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
