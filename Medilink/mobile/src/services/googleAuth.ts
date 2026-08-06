/**
 * Native Google sign-in → Supabase session.
 *
 * ARCHITECTURE (one flow per platform, deliberately not mixed)
 *   mobile → Google Play Services / Google Sign-In SDK  →  ID token  →
 *            supabase.auth.signInWithIdToken({ provider: "google" })
 *   web    → supabase.auth.signInWithOAuth({ provider: "google" })  →  /auth/callback
 *
 * The mobile side uses NO browser, NO expo-auth-session, NO expo-web-browser and NO
 * deep link. That is the point: `signInWithIdToken` is a plain HTTPS call carrying a
 * token Google already signed, so there is no redirect URI to register, no entry needed
 * in Supabase's redirect allow-list, and no `medilink://` route to add to Expo Router.
 * The app has no auth deep-link handler and does not need one.
 *
 * WHICH CLIENT ID GOES WHERE — this trips everyone up:
 *   • `webClientId` is required on BOTH platforms. On Android the returned ID token's
 *     `aud` claim is the WEB client, not the Android one. The Android OAuth client
 *     still has to exist in Google Cloud (Google matches it by package name + SHA-1 to
 *     authorise the request) but its ID is never named in code.
 *   • `iosClientId` is the ID token audience on iOS.
 *   • Supabase → Providers → Google → "Client IDs" must therefore list the Web client
 *     ID and, once iOS ships, the iOS client ID. Verification fails otherwise.
 *
 * SECURITY: only PUBLIC client IDs are referenced here. The Google client SECRET lives
 * exclusively in the Supabase dashboard and must never enter the mobile bundle — the
 * ID-token flow does not use one.
 */
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { api } from "@medilink/shared/mobile";

import { env, isGoogleConfigured } from "@/config/env";
import type { MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";

/** Discriminated result so callers never have to interpret a raw SDK error. */
export type GoogleSignInOutcome =
  | { status: "success" }
  /** User dismissed the sheet, or a sign-in was already in flight. Show nothing. */
  | { status: "cancelled" }
  | { status: "error"; messageKey: MessageKey };

let configured = false;

/**
 * Idempotent SDK setup. `GoogleSignin.configure` is synchronous and safe to call more
 * than once, but it is pointless to repeat and it throws when handed an empty
 * `webClientId`, so it is guarded by both a flag and the platform config check.
 */
function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    // Required on Android AND iOS: this is the ID token audience Supabase validates.
    webClientId: env.GOOGLE_WEB_CLIENT_ID,
    // Ignored on Android; required on iOS, where it becomes the token audience.
    iosClientId: env.GOOGLE_IOS_CLIENT_ID,
    // We want an identity, not Google API access — no Drive/Calendar scopes. Calendar
    // sync is a separate backend integration with its own OAuth client; do not merge
    // the two, or patients get a scary consent screen just to log in.
    scopes: ["openid", "email", "profile"],
    // No offline access: a refresh token would only be useful for server-side Google
    // API calls, which this flow does not make.
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Run the native Google flow and exchange the resulting ID token for a Supabase session.
 *
 * Never throws — every failure path returns a typed outcome, because this is called
 * straight from a button handler and an unhandled rejection there would crash the
 * screen. Tokens are never logged.
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  if (!isGoogleConfigured) {
    return { status: "error", messageKey: "errors.googleNotConfigured" };
  }

  let idToken: string | null = null;

  try {
    ensureConfigured();
    // Android-only; resolves immediately on iOS. Surfaces the "update Google Play
    // Services" system dialog instead of failing with an opaque error.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    // v13+ returns a discriminated union: cancellation is a normal return value,
    // not an exception.
    if (response.type === "cancelled") return { status: "cancelled" };
    idToken = response.data?.idToken ?? null;
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return { status: "cancelled" };
        case statusCodes.IN_PROGRESS:
          // A sheet is already open (double-tap). Treat as a no-op, not an error.
          return { status: "cancelled" };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return { status: "error", messageKey: "errors.googlePlayServices" };
        default:
          break;
      }
    }
    // Misconfiguration surfaces here as DEVELOPER_ERROR (code 10) on Android — almost
    // always a SHA-1 that is not registered on the Google Android OAuth client, which
    // is easy to hit because the Play App Signing SHA-1 differs from the upload key's.
    return { status: "error", messageKey: "errors.googleSignInFailed" };
  }

  // A successful sheet with no token means the SDK is misconfigured rather than the
  // user having done something wrong; do not present it as a generic failure.
  if (!idToken) {
    return { status: "error", messageKey: "errors.googleNoToken" };
  }

  try {
    // Supabase verifies the signature and the `aud` claim against the provider's
    // configured Client IDs, then creates OR RESTORES the user. Identity linking to an
    // existing confirmed-email account is Supabase's own behaviour — we intentionally
    // implement none of our own (see docs/GOOGLE_SIGN_IN_SETUP.md § account linking).
    await api.auth.signInWithIdToken(supabase, {
      provider: "google",
      token: idToken,
    });
    return { status: "success" };
  } catch {
    // Audience mismatch (client ID missing from Supabase), expired token, or network.
    return { status: "error", messageKey: "errors.googleSignInFailed" };
  }
}

/**
 * Clear the Google SDK's cached account so the next sign-in shows the account chooser.
 *
 * Without this, Google silently reuses the last account and "sign out, then sign in as
 * someone else" is impossible on a shared device — a real problem for a clinic tablet.
 * Best-effort: never let it block Supabase sign-out.
 */
export async function signOutGoogle(): Promise<void> {
  if (!isGoogleConfigured || !configured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Nothing actionable — the Supabase session is the source of truth.
  }
}
