/**
 * Data layer entry point. Selects the repository implementation from
 * `EXPO_PUBLIC_DATA_MODE`:
 *   • mock                  → typed in-memory data (no backend) — UI-first default
 *   • staging / production  → CONTROLLED HYBRID: only the modules that have a clean,
 *     confirmed backend are wired to real (HAMS + Supabase); the rest stay mock so
 *     no screen goes empty while we migrate flow-by-flow.
 *
 * Current hybrid (real): Auth + session restore.
 * Still mock: profile, family, medical history, appointments, doctor discovery,
 * notifications, booking/slots/create-appointment.
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
