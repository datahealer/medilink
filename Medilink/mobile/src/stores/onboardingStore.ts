import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStorage } from "./persist";

interface OnboardingState {
  /** True once the user has finished (or skipped) the onboarding carousel. */
  completed: boolean;
  hasHydrated: boolean;
  complete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      hasHydrated: false,
      complete: () => set({ completed: true }),
      reset: () => set({ completed: false }),
    }),
    {
      name: "medilink.onboarding",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ completed: s.completed }),
      onRehydrateStorage: () => () => {
        useOnboardingStore.setState({ hasHydrated: true });
      },
    }
  )
);
