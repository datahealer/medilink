import type { useI18n } from "@/i18n";

type T = ReturnType<typeof useI18n>["t"];

// Maps the curated specialty catalog slug (Specialty.id) to a localized label
// key. Mirrors apptStatusLabel/payStatusLabel. Freetext values that aren't a
// known slug (e.g. doctors.specialty) fall back to the raw string.
const SPECIALTY_KEYS: Record<string, Parameters<T>[0]> = {
  general: "specialtyNames.general",
  pathology: "specialtyNames.pathology",
  radiology: "specialtyNames.radiology",
  cardiology: "specialtyNames.cardiology",
  dermatology: "specialtyNames.dermatology",
  pediatrics: "specialtyNames.pediatrics",
  physio: "specialtyNames.physio",
  skincare: "specialtyNames.skincare",
  dentist: "specialtyNames.dentist",
};

/**
 * Localized catalog specialty label. Accepts a catalog slug OR a freetext value
 * (e.g. `doctors.specialty`): tries an exact slug match first, then a normalized
 * (trimmed + lower-cased) match so freetext like "Cardiology" resolves to the
 * `cardiology` slug. Anything unmapped falls back to the raw name unchanged
 * (so English is untouched and unknown specialties still display).
 */
export function specialtyLabel(slugOrName: string | null | undefined, name: string, t: T): string {
  if (!slugOrName) return name;
  const key = SPECIALTY_KEYS[slugOrName] ?? SPECIALTY_KEYS[slugOrName.trim().toLowerCase()];
  return key ? t(key) : name;
}

const FACILITY_TYPE_KEYS: Record<string, Parameters<T>[0]> = {
  clinic: "facilityTypes.clinic",
  hospital: "facilityTypes.hospital",
  lab: "facilityTypes.lab",
  radiology: "facilityTypes.radiology",
  pharmacy: "facilityTypes.pharmacy",
  dental: "facilityTypes.dental",
  optical: "facilityTypes.optical",
  physiotherapy: "facilityTypes.physiotherapy",
  mental_health: "facilityTypes.mental_health",
  other: "facilityTypes.other",
};

/** Localized facility-type label; falls back to the raw value when unmapped. */
export function facilityTypeLabel(type: string | null | undefined, t: T): string {
  if (!type) return "";
  const key = FACILITY_TYPE_KEYS[type];
  return key ? t(key) : type.replace(/_/g, " ");
}
