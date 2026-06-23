import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStorage } from "./persist";

/**
 * Active-patient selection — a CLIENT-ONLY concept (no backend endpoint exists).
 * "Active patient" is who the user is currently acting/booking for: themselves
 * (`null`) or one of their family_members (`id`). Persisted so the choice
 * survives relaunch; cleared on logout via `reset()`.
 */
interface PatientState {
  /** family_members.id, or null for the primary account holder ("You"). */
  activePatientId: string | null;
  /** Display name for the active patient (UI convenience; may be stale). */
  activePatientName: string | null;
  hasHydrated: boolean;
  setActivePatient: (id: string | null, name: string | null) => void;
  reset: () => void;
}

export const usePatientStore = create<PatientState>()(
  persist(
    (set) => ({
      activePatientId: null,
      activePatientName: null,
      hasHydrated: false,
      setActivePatient: (activePatientId, activePatientName) =>
        set({ activePatientId, activePatientName }),
      reset: () => set({ activePatientId: null, activePatientName: null }),
    }),
    {
      name: "medilink.activePatient",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        activePatientId: s.activePatientId,
        activePatientName: s.activePatientName,
      }),
      onRehydrateStorage: () => () => {
        usePatientStore.setState({ hasHydrated: true });
      },
    }
  )
);
