// A Supabase client typed to the reused HAMS schema. Web passes an SSR/cookie
// client, mobile passes a bearer-token client — both hit identical RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/index";
// Dependency-free module (no imports of its own), so this cannot create a cycle.
import { omanToday } from "../config/time";

export type DB = SupabaseClient<Database>;
export type { Json };

// Convenience aliases over the generated schema so modules stay terse + typed.
export type Tables = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];

/** Resolve the signed-in auth user id (throws if unauthenticated). */
export async function getCurrentUserId(db: DB): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

/**
 * Resolve the current user's `patient_profiles.id` — the FK most patient tables
 * (appointments, family_members, lab_results, prescriptions, reviews, …) key on.
 * RLS already scopes the row to the caller; the explicit user_id filter is belt-and-braces.
 */
export async function getMyPatientProfileId(db: DB): Promise<string> {
  const userId = await getCurrentUserId(db);
  const { data, error } = await db
    .from("patient_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Today's date as `YYYY-MM-DD` in OMAN, used for upcoming/past partitioning.
 *
 * Was `toISOString()` — i.e. UTC, despite the comment claiming "local". Since
 * `appointments.slot_date` is an Oman calendar date, that mis-classified rows for
 * four hours every night: between 00:00 and 04:00 Oman time the UTC date is still
 * yesterday, so YESTERDAY's appointments were listed as upcoming. Uses the same
 * shared helper as the booking grid and mirrors the database's `oman_today()`.
 */
export function today(): string {
  return omanToday();
}
