// Shared, non-secret config & constants.
export const APP_NAME = "MediLink";
export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export * from "./payments";

/**
 * BP-2 — booking window. Patients may book only within the next
 * `BOOKING_WINDOW_DAYS` days: today through today + (N-1), inclusive (7 = today+6).
 * Single source of truth for the TS/UX layers (mobile renders exactly this many
 * day chips). The DB guard in `book_appointment_atomic` is authoritative and reads
 * `facility_settings.booking_window_days` (default 7) so the two stay aligned;
 * changing the window here + the settings default is the only change needed.
 * Emergency (`is_emergency=true`) bookings bypass the window (server-side).
 */
export const BOOKING_WINDOW_DAYS = 7;
export * from "./clinicTypes";
export * as i18n from "./i18n/index";
