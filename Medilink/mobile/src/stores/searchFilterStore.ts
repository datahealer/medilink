import { create } from "zustand";

import type { DoctorSearchParams } from "@/data/types";

/**
 * Doctor-search filters (PDF p17/p18). Client-only state shared between the Search
 * & Results screen, the Filters bottom sheet and the Specialty grid. Not persisted —
 * filters reset on relaunch.
 */
type Filters = Pick<
  DoctorSearchParams,
  "specialty" | "gender" | "maxFee" | "minRating" | "availableToday" | "topRated"
>;

interface SearchFilterState extends Filters {
  setFilters: (patch: Partial<Filters>) => void;
  reset: () => void;
}

const INITIAL: Filters = {
  specialty: undefined,
  gender: "any",
  maxFee: undefined,
  minRating: undefined,
  availableToday: false,
  topRated: false,
};

export const useSearchFilterStore = create<SearchFilterState>((set) => ({
  ...INITIAL,
  setFilters: (patch) => set(patch),
  reset: () => set(INITIAL),
}));

/** Count of non-default filters — used for the Search header filter badge. */
export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.specialty) n++;
  if (f.gender && f.gender !== "any") n++;
  if (f.maxFee != null) n++;
  if (f.minRating != null) n++;
  if (f.availableToday) n++;
  if (f.topRated) n++;
  return n;
}
