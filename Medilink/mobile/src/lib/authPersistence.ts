import AsyncStorage from "@react-native-async-storage/async-storage";
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

/* ─────────────────────── FRESH-INSTALL DETECTION (QA MED-010) ───────────────────────
 *
 * After deleting the app and reinstalling from TestFlight, MediLink opened ALREADY SIGNED
 * IN as the previous user. That was never an authentication bypass — the session was
 * genuine, still within its validity window, and every screen stayed behind the (app)
 * route gate. It is an iOS platform behaviour: SecureStore writes to the KEYCHAIN, and
 * **keychain items survive app deletion by default**. On the next launch AuthProvider found
 * a valid token and restored it, exactly as designed for a warm start.
 *
 * On a resold, shared or handed-over device that means a reinstall can surface the previous
 * owner's health record. Per the product decision, a fresh install must always land on the
 * Sign In / Create Account wall.
 *
 * ── WHY ASYNCSTORAGE IS THE MECHANISM, NOT A CONFIG FLAG ──
 *
 * The fix cannot live in SecureStore, because everything in SecureStore is precisely what
 * survives. It needs a marker in storage that iOS DOES clear on uninstall, and AsyncStorage
 * — plain app-container files — is exactly that. So:
 *
 *     sentinel ABSENT + keychain session PRESENT  →  this is a new INSTALL over old
 *                                                    keychain state → sign out.
 *     sentinel PRESENT                            →  a normal cold launch → restore.
 *
 * The asymmetry between the two stores IS the detector. Nothing else in the app can tell a
 * reinstall from a relaunch.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 * `persistSession: true` in lib/supabase.ts is UNTOUCHED. Disabling it is the tempting
 * one-line "fix" and it is wrong: it would drop the session on every background→foreground
 * resume, breaking warm resume for everyone to address a once-per-install event. The
 * sentinel is checked only in AuthProvider's cold-launch effect, which does not run on a
 * warm resume, so normal persistence is completely unaffected.
 *
 * The sentinel is also NOT a security control — it is a privacy default. The security
 * boundary is RLS plus the (app) gate, both unchanged.
 *
 * Android note: app data is normally cleared on uninstall there, so the sentinel is usually
 * absent anyway and this path is a harmless no-op. It still earns its place, because
 * Android auto-backup can restore both stores and produce the same stale-session shape.
 */
const INSTALL_SENTINEL_KEY = "medilink.installSentinel";

/**
 * True on the first launch of a NEW installation — including a reinstall that inherited
 * keychain state from a previous one.
 *
 * Fails CLOSED: if AsyncStorage cannot be read we report "fresh", which signs the user out.
 * The cost of a false positive is one extra sign-in; the cost of a false negative is
 * exposing the previous owner's record.
 */
export async function isFreshInstall(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INSTALL_SENTINEL_KEY)) === null;
  } catch {
    return true;
  }
}

/** Record that this installation has launched, so subsequent cold launches restore normally. */
export async function markInstalled(): Promise<void> {
  try {
    await AsyncStorage.setItem(INSTALL_SENTINEL_KEY, "1");
  } catch {
    // Non-fatal. An unwritten sentinel means the next launch repeats the sign-out, which is
    // the safe direction — never a crash on a cold start.
  }
}
