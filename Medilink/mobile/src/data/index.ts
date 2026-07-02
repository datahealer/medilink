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
 * (slots, booking, cancel, reschedule, check-in); Payments (Thawani checkout +
 * verify, invoice, history); Document Vault; Prescriptions; Lab Results
 * (analytes + trends); Reviews (doctor reviews list + rating submission); Doctor
 * search + details; the Dashboard discovery sections (Specialties catalog,
 * featured clinics, recently-visited doctors); Notifications list + preferences +
 * Facility Messages; AI (doctor recommendations + visit summary).
 *
 * Still mock (no backend source yet): Doctor map pins (Map View needs a native
 * map SDK — see docs/backend-specs/map-view-backend-spec.md). The AI Symptom
 * Checker transcript and the AI Insights vitals-trend chart are intentionally
 * static (product decision / documented gaps), not wired to a repository.
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
  payment: realRepositories.payment,
  doctor: {
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
  },
  // Document Vault: real (patient_documents + patient-docs bucket).
  document: realRepositories.document,
  prescription: realRepositories.prescription,
  // Lab Results: real (lab_results + lab_result_analytes, trigger-derived status).
  lab: realRepositories.lab,
  review: realRepositories.review,
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
  Repositories,
} from "./repositories";
