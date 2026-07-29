import * as SecureStore from "expo-secure-store";

/**
 * "Remember me" preference for the login session.
 *
 * The Supabase client always persists its session to the keychain
 * (`persistSession: true` in `src/lib/supabase.ts`) so that a warm resume from the
 * background never loses auth. "Remember me" is layered on top: on a *cold* app
 * launch, if the user did NOT ask to be remembered, `AuthProvider` drops the
 * persisted session so they must sign in again. If they did, the session is
 * restored as normal.
 *
 * Stored as a tiny flag in SecureStore (well under the ~2KB limit). Absent flag
 * defaults to "remembered" so pre-existing sessions are never surprise-logged-out;
 * the preference only takes hold once the user signs in with the checkbox present.
 */
const REMEMBER_KEY = "medilink.rememberSession";

export async function setRememberSession(remember: boolean): Promise<void> {
  await SecureStore.setItemAsync(REMEMBER_KEY, remember ? "1" : "0");
}

export async function getRememberSession(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(REMEMBER_KEY);
  // Only an explicit "0" means "do not remember"; unset → remember (safe default).
  return value !== "0";
}
