/**
 * Clinic type options shown in the UI dropdown.
 * "Other" allows a custom text entry as a fallback.
 */
export const CLINIC_TYPES = [
  "Clinic",
  "Hospital",
  "Lab",
  "Radiology",
  "Physio",
  "Skincare",
  "General",
  "Other",
] as const;

export type ClinicType = (typeof CLINIC_TYPES)[number];
