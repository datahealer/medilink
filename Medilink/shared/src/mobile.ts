// @medilink/shared/mobile — RN-safe subset (excludes web-only utils like cn/tailwind-merge).
export * from "./types/index";
export * from "./auth/index";
export * from "./config/index";
export { ROUTES } from "./utils/routes";
export * as api from "./api/index";

// Flat domain-type re-exports so app screens import HAMS-shaped types directly
// (e.g. `import type { FamilyMember } from "@medilink/shared/mobile"`) instead of
// re-declaring them. Canonical definitions live in the `api/*` modules above.
export type { DB, Enums, Row } from "./api/client";
export type { MyProfile, ProfilePatch } from "./api/profile";
export type { FamilyMember, NewFamilyMember } from "./api/family";
export type {
  MedicalHistory,
  MedicalHistoryPatch,
  PatientDocument,
} from "./api/records";
export type { AppointmentTab } from "./api/appointments";
