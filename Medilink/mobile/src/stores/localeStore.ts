import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStorage } from "./persist";

export type Locale = "en" | "ar";

interface LocaleState {
  locale: Locale;
  hasHydrated: boolean;
  /** Persist the chosen locale. RTL side-effects are handled by the i18n layer. */
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      hasHydrated: false,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "medilink.locale",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ locale: s.locale }),
      onRehydrateStorage: () => () => {
        useLocaleStore.setState({ hasHydrated: true });
      },
    }
  )
);
