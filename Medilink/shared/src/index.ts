// @medilink/shared — universal exports (web + backend).
export const SHARED_PACKAGE = "@medilink/shared";
export * from "./types/index";
export * from "./auth/index";
export * from "./config/index";
export * from "./utils/index";
export * as api from "./api/index";

// Flat domain-type re-exports (mirror of mobile.ts) so consumers can import
// HAMS-shaped types from the package root. Canonical defs live in `api/*`.
export type { DB, Enums, Row } from "./api/client";
export type { MyProfile, ProfilePatch } from "./api/profile";
export type { FamilyMember, NewFamilyMember } from "./api/family";
export type {
  MedicalHistory,
  MedicalHistoryPatch,
  PatientDocument,
} from "./api/records";
export type { AppointmentTab } from "./api/appointments";
