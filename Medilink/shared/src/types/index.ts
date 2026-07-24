// Generated Supabase DB types + domain types (extracted from HAMS, reused unchanged).
import type { Database as GeneratedDatabase, Json } from "./supabase";

/**
 * `device_tokens` and `notification_preferences` are now present in the generated
 * `supabase.ts` (they were previously hand-augmented here while awaiting codegen).
 * The manual augmentation has been removed to eliminate schema drift — the generated
 * types are the single source of truth.
 *
 * (The Feature 1/2 columns — `patient_profiles.civil_number`, `doctors.full_name_ar`
 * /`full_name_ar_status`, `facilities.name_ar`/`name_ar_status`, and
 * `profiles.full_name_ar`/`full_name_ar_status` — are now present in the generated
 * types above; the temporary overlays that bridged the gap before the migrations
 * were applied have been removed.)
 */
export type Database = GeneratedDatabase;

export type { Json };
export * from "./facility";
