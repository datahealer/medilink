/**
 * Data layer entry point. Selects the repository implementation from
 * `EXPO_PUBLIC_DATA_MODE`:
 *   • mock                  → typed in-memory data (no backend) — UI-first default
 *   • staging / production  → CONTROLLED HYBRID: only the modules that have a clean,
 *     confirmed backend are wired to real (MediLink backend + Supabase); the rest stay mock so
 *     no screen goes empty while we migrate flow-by-flow.
 *
 * Current hybrid (real backend): Auth + session restore; Patient profile; the
 * Profile cluster (family members + medical history); Appointments end-to-end
 * (slots, booking, cancel, reschedule, check-in); Live Queue (HAMS-owned queue
 * backend — `GET /api/patients/me/queue-status` + acknowledge + realtime on the
 * patient's own `queue_items` row); Payments (Thawani checkout +
 * verify, invoice, history); Document Vault; Prescriptions; Lab Results
 * (analytes + trends); Reviews (doctor reviews list + rating submission);
 * Favourites (doctors + clinics); Doctor search + details; the Dashboard
 * discovery sections (Specialties catalog, featured clinics, recently-visited
 * doctors); Notifications list + preferences + Facility Messages; AI (doctor
 * recommendations + visit summary).
 *
 * Still mock — exactly ONE method of 77, and it is unreachable at runtime:
 * `doctor.mapClinics`. It has no backend: `real.doctor.mapClinics` is a stub that
 * returns `[]`, so wiring it would empty the screen rather than make it live. No screen
 * calls it either — `useMapClinics` exists in hooks/queries/useDoctors.ts but has no
 * consumer, and Map View reads the REAL `discovery.nearbyClinics` instead
 * (app/(app)/search/map.tsx). Do not "fix" this by pointing the hybrid at the real stub.
 *
 * Corrected 2026-07-31 — this block previously claimed three things that are no longer
 * true, which made the app look less integrated than it is:
 *   • Facility messages are REAL (`api.notifications.listFacilityMessages`), not mock.
 *   • There is no AI Symptom Checker transcript stub; app/(app)/ai/assistant.tsx streams
 *     from the live endpoint.
 *   • The AI Insights vitals-trend chart is not "static" — it was REMOVED, because
 *     MediLink has no vitals data source and a trend there would be fabricated clinical
 *     data (see the note at the top of app/(app)/ai/insights.tsx).
 *
 * NOTE on the spreads below: `...mockRepositories` and the per-repository spreads are
 * now redundant — all 16 repositories and every method except `doctor.mapClinics` are
 * explicitly wired to real. They are kept as a safety net so that ADDING a method to a
 * repository interface cannot leave a screen with `undefined`; it falls back to mock
 * instead. The trade-off is that a new method silently serves mock data until wired, so
 * check this file whenever the Repositories interface grows.
 *
 * The UI imports `repositories` (and the domain types) from here only.
 */
import { DATA_MODE } from "@/config/env";
import { mockRepositories } from "./mock";
import { realRepositories } from "./real";
import type { Repositories } from "./repositories";

/** Real where confirmed; mock everywhere else. */
const hybridRepositories: Repositories = {
  ...mockRepositories,
  auth: realRepositories.auth,
  patient: realRepositories.patient,
  family: realRepositories.family,
  medicalHistory: realRepositories.medicalHistory,
  appointment: realRepositories.appointment,
  // Queue: real. Requires the 5 HAMS queue migrations (20260728000001-05) to be
  // applied; until then the endpoint answers 500 and the screen shows its error
  // state. See docs/QUEUE_INTEGRATION_STATUS.md.
  queue: realRepositories.queue,
  payment: realRepositories.payment,
  doctor: {
    // `mapClinics` is the ONE method still served by mock — deliberately. There is no
    // backend for it (real.doctor.mapClinics returns []), and nothing calls it. See the
    // header block.
    ...mockRepositories.doctor,
    search: realRepositories.doctor.search,
    get: realRepositories.doctor.get,
    reviews: realRepositories.doctor.reviews,
  },
  discovery: {
    ...mockRepositories.discovery,
    listSpecialties: realRepositories.discovery.listSpecialties,
    featuredClinics: realRepositories.discovery.featuredClinics,
    recentDoctors: realRepositories.discovery.recentDoctors,
    nearbyClinics: realRepositories.discovery.nearbyClinics,
    searchClinics: realRepositories.discovery.searchClinics,
    getClinic: realRepositories.discovery.getClinic,
  },
  // Document Vault: real (patient_documents + patient-docs bucket).
  document: realRepositories.document,
  prescription: realRepositories.prescription,
  // Lab Results: real (lab_results + lab_result_analytes, trigger-derived status).
  lab: realRepositories.lab,
  review: realRepositories.review,
  // Favourites: real (favourites table + RLS).
  favourite: realRepositories.favourite,
  ai: realRepositories.ai,
  notification: {
    ...mockRepositories.notification,
    list: realRepositories.notification.list,
    facilityMessages: realRepositories.notification.facilityMessages,
    markFacilityMessagesRead: realRepositories.notification.markFacilityMessagesRead,
    getPreferences: realRepositories.notification.getPreferences,
    updatePreferences: realRepositories.notification.updatePreferences,
    markAllRead: realRepositories.notification.markAllRead,
  },
};

export const repositories: Repositories =
  DATA_MODE === "mock" ? mockRepositories : hybridRepositories;

export const isMockData = DATA_MODE === "mock";

// Temporary dev diagnostics (no secrets) — confirms mode + selected source at runtime.
if (__DEV__) {
  console.log("[MediLink] DATA_MODE =", DATA_MODE, isMockData ? "(mock)" : "(hybrid)");
}

export * from "./types";
export type {
  AuthRepository,
  PatientRepository,
  FamilyRepository,
  MedicalHistoryRepository,
  AppointmentRepository,
  QueueRepository,
  Repositories,
} from "./repositories";
