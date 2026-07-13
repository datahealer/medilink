// Generated Supabase DB types + domain types (extracted from HAMS, reused unchanged).
import type { Database as GeneratedDatabase, Json } from "./supabase";

/**
 * `device_tokens` and `notification_preferences` are now present in the generated
 * `supabase.ts` (they were previously hand-augmented here while awaiting codegen).
 * The manual augmentation has been removed to eliminate schema drift — the generated
 * types are the single source of truth.
 */
export type Database = GeneratedDatabase;

export type { Json };
export * from "./facility";
