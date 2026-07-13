import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";
import { api } from "@medilink/shared";

/**
 * First-time-patient detection for post-signup routing.
 *
 * The signup trigger (`hams_handle_new_user`) creates a `patient_profiles` row with
 * only `user_id` set — every clinical field, including `date_of_birth`, starts NULL.
 * DOB is collected in step 1 of `/dashboard/setup` and is written ONLY by that wizard
 * or the profile editor, so "DOB still null" is a reliable, schema-free signal that the
 * patient has not completed onboarding yet.
 *
 * Used solely at the post-OTP / immediate-session signup moment. It is deliberately NOT
 * a route guard: a patient who skips setup keeps DOB null but is never forced back,
 * because sign-in goes straight to the dashboard and only this signup path consults it.
 *
 * On any read error we default to `/dashboard` so onboarding never blocks account access.
 */
export async function postSignupDestination(
  supabase: SupabaseClient<Database>
): Promise<"/dashboard" | "/dashboard/setup"> {
  try {
    const { patient } = await api.profile.getMyProfile(supabase);
    return patient?.date_of_birth ? "/dashboard" : "/dashboard/setup";
  } catch {
    return "/dashboard";
  }
}
