import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStorage } from "./persist";

export type ColorMode = "light" | "dark" | "system";

interface ThemeState {
  /** User preference. Resolved against the OS scheme by the ThemeProvider. */
  mode: ColorMode;
  /** Set once async persistence has rehydrated (gates the splash screen). */
  hasHydrated: boolean;
  setMode: (mode: ColorMode) => void;
  toggle: (current: "light" | "dark") => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      hasHydrated: false,
      setMode: (mode) => set({ mode }),
      // Dev-only quick toggle: flip to the opposite of the resolved scheme.
      toggle: (current) => set({ mode: current === "dark" ? "light" : "dark" }),
    }),
    {
      name: "medilink.theme",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ mode: s.mode }),
      onRehydrateStorage: () => (state) => {
        state?.setMode(state.mode);
        useThemeStore.setState({ hasHydrated: true });
      },
    }
  )
);
