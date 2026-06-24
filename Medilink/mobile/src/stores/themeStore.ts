import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStorage } from "./persist";

export type ColorMode = "light" | "dark" | "system";

interface ThemeState {
  /** User preference. Resolved against the OS scheme by the ThemeProvider. */
  mode: ColorMode;
  /** Accessibility larger-text multiplier (Appearance → Larger text). */
  textScale: number;
  /** Set once async persistence has rehydrated (gates the splash screen). */
  hasHydrated: boolean;
  setMode: (mode: ColorMode) => void;
  setLargerText: (on: boolean) => void;
  toggle: (current: "light" | "dark") => void;
}

export const LARGE_TEXT_SCALE = 1.15;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      textScale: 1,
      hasHydrated: false,
      setMode: (mode) => set({ mode }),
      setLargerText: (on) => set({ textScale: on ? LARGE_TEXT_SCALE : 1 }),
      // Dev-only quick toggle: flip to the opposite of the resolved scheme.
      toggle: (current) => set({ mode: current === "dark" ? "light" : "dark" }),
    }),
    {
      name: "medilink.theme",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ mode: s.mode, textScale: s.textScale }),
      onRehydrateStorage: () => (state) => {
        state?.setMode(state.mode);
        useThemeStore.setState({ hasHydrated: true });
      },
    }
  )
);
