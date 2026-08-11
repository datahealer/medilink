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
const REMEMBERED_EMAIL_KEY = "medilink.rememberedEmail";

export async function setRememberSession(remember: boolean): Promise<void> {
  await SecureStore.setItemAsync(REMEMBER_KEY, remember ? "1" : "0");
}

export async function getRememberSession(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(REMEMBER_KEY);
  // Only an explicit "0" means "do not remember"; unset → remember (safe default).
  return value !== "0";
}

/* ─────────────────────────── REMEMBERED EMAIL (QA MED-018) ───────────────────────────
 *
 * "Remember me" persisted a session but nothing the USER could see: the Sign In form hard-
 * coded `remember: false` and never read the stored preference back, so the checkbox reset
 * to unchecked on every visit. Signing in without re-ticking it then wrote
 * `setRememberSession(false)`, silently turning the feature off again. And the email field
 * always started empty, so "remember me" appeared to remember nothing at all.
 *
 * ── WHAT IS STORED, AND WHAT IS DELIBERATELY NOT ──
 *
 * ONLY the email address. The password is NEVER persisted — not here, not in AsyncStorage,
 * not anywhere. Storing a reusable password on the device would convert "remember my
 * email" into a credential store, and a device compromise would then yield the account
 * itself rather than an address. Supabase's refresh token already provides "stay signed
 * in"; nothing needs the password after the initial exchange.
 *
 * The email lives in SecureStore (OS keychain/keystore) rather than AsyncStorage because
 * it is personal data on a health app — AsyncStorage is app-private but unencrypted at
 * rest, as `QueryProvider` already notes for the query cache.
 *
 * ── THE PRESENCE OF AN EMAIL IS THE PREFERENCE ──
 *
 * There is no third "unset" state to track: a stored email means the user last chose to be
 * remembered, so the checkbox renders ticked and the field prefills. Choosing not to be
 * remembered clears it, and the form falls back to its previous empty/unchecked default —
 * which is also what a fresh install sees. `getRememberSession()` keeps its own separate
 * "unset → remembered" default, because it governs whether an EXISTING session survives a
 * cold launch and must not start logging people out.
 *
 * Sign-out deliberately does NOT clear this. Being signed out is exactly when the prefill
 * earns its keep; forgetting the address there would defeat the feature.
 */

/** Persist the address to prefill next time, or `null` to forget it. Never a password. */
export async function setRememberedEmail(email: string | null): Promise<void> {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value) {
    await SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY);
    return;
  }
  await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, value);
}

/** The address to prefill on Sign In, or `null` when the user is not being remembered. */
export async function getRememberedEmail(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY);
  return value && value.trim() ? value : null;
}
