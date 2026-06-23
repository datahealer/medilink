/**
 * Data layer entry point. Selects the repository implementation from
 * `EXPO_PUBLIC_DATA_MODE`:
 *   • mock                  → typed in-memory data (no backend) — UI-first default
 *   • staging / production  → real HAMS + Supabase (per-module wiring)
 *
 * The UI imports `repositories` (and the domain types) from here only.
 */
import { DATA_MODE } from "@/config/env";
import { mockRepositories } from "./mock";
import { realRepositories } from "./real";
import type { Repositories } from "./repositories";

export const repositories: Repositories =
  DATA_MODE === "mock" ? mockRepositories : realRepositories;

export const isMockData = DATA_MODE === "mock";

// Temporary dev diagnostics (no secrets) — confirms mode + selected source at runtime.
if (__DEV__) {
  console.log("[MediLink] DATA_MODE =", DATA_MODE);
  if (isMockData) console.log("[MediLink] mock repository selected");
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
