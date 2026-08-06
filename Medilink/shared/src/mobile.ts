// @medilink/shared/mobile — RN-safe subset (excludes web-only utils like cn/tailwind-merge).
export * from "./types/index";
export * from "./auth/index";
export * from "./config/index";
export { ROUTES } from "./utils/routes";
// Input normalization — no dependencies, so it is RN-safe and exported directly
// (the ./utils barrel is not, because cn pulls in tailwind-merge).
export * from "./utils/normalize";
// Redirect allow-listing. Mobile does not redirect, but this is the only workspace with
// a Jest runner, so its tests live there — see src/utils/__tests__/safeNext.test.ts.
export * from "./utils/safeNext";
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
export type {
  QueueItemStatus,
  QueueAcknowledgeKind,
  QueueErrorCode,
  QueueStatusPayload,
  QueueAcknowledgePayload,
  QueueEnvelope,
} from "./api/queue";
