/**
 * Public (EXPO_PUBLIC_*) env only. Secrets NEVER ship in the mobile bundle —
 * privileged work goes through the backend over HTTPS with the user's bearer token.
 *
 * Physical-device note: EXPO_PUBLIC_API_URL must be a host the phone can reach —
 * a staging URL or your laptop's LAN IP (e.g. http://192.168.1.20:3000), NOT
 * `localhost` (which resolves to the device itself). See mobile/.env.example.
 */
import { Platform } from "react-native";

import { assertProductionEnv } from "./envGuard.js";

/**
 * Data source for the whole app:
 *   • mock        — typed in-memory data, no backend (UI-first; the dev default)
 *   • staging     — real MediLink backend + Supabase against the staging API
 *   • production  — real MediLink backend + Supabase against production
 */
export type DataMode = "mock" | "staging" | "production";
const RAW_DATA_MODE = (process.env.EXPO_PUBLIC_DATA_MODE ?? "mock").toLowerCase();
export const DATA_MODE: DataMode =
  RAW_DATA_MODE === "staging" || RAW_DATA_MODE === "production" ? RAW_DATA_MODE : "mock";
const isMockMode = DATA_MODE === "mock";

// Runtime half of the production guard. `app.config.ts` runs the same check while Expo
// resolves the config, which is what actually fails a bad BUILD; this catches a bundle
// whose variables changed afterwards (e.g. a dev client relaunched against new env).
// Fails loudly at startup rather than silently serving seeded mock patient data.
assertProductionEnv(process.env);

/** Required when talking to a real backend; in mock mode it falls back harmlessly. */
function required(name: string, value: string | undefined, mockFallback: string): string {
  if (value && value.trim()) return value;
  if (isMockMode) return mockFallback;
  throw new Error(`Missing required env var: ${name} (DATA_MODE=${DATA_MODE})`);
}

function optional(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

// Backend base URL: EXPO_PUBLIC_API_URL is canonical; BACKEND_URL kept as a
// fallback for older .env files so the app never hard-crashes on a renamed var.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_BACKEND_URL;

export const env = {
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  DATA_MODE,
  API_URL: required("EXPO_PUBLIC_API_URL", API_URL, "http://mock.local"),
  SUPABASE_URL: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL, "http://mock.local"),
  SUPABASE_ANON_KEY: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, "mock-anon-key"),
  // Google OAuth public client IDs — optional. When absent, Google sign-in is hidden
  // entirely on that platform (we never fake auth, and never show a dead button).
  //
  // These are PUBLIC by design: a client ID appears in every OAuth request and in the
  // decoded ID token's `aud` claim. The client SECRET is a different value and lives
  // ONLY in the Supabase dashboard — it must never reach this bundle.
  //
  // WEB is the odd one out: despite the name it is required on ANDROID, because the
  // Google Play Services sign-in returns an ID token whose audience is the *Web*
  // client. The Android client ID is never referenced in code at all — Google matches
  // the Android client by package name + SHA-1 at sign-in time. It is declared here
  // only so the environment contract documents that the client must exist.
  GOOGLE_WEB_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  GOOGLE_ANDROID_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  GOOGLE_IOS_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  // Sentry ingest URL — optional. Absent means error reporting stays fully inert (the SDK
  // is never even loaded); see src/services/reporting. A DSN is a public, write-only
  // ingest key by design, which is why it lives in EXPO_PUBLIC_* like the anon key.
  SENTRY_DSN: optional(process.env.EXPO_PUBLIC_SENTRY_DSN),
} as const;

export const isDev = env.APP_ENV !== "production";

/**
 * Is native Google sign-in usable on THIS platform?
 *
 * Per-platform on purpose. The previous rule was
 *   `WEB && (ANDROID || IOS)`
 * which is not platform-aware: with the Web + Android IDs set but no iOS ID it reported
 * "configured" on iOS too, so the iOS button rendered enabled and then failed at
 * runtime inside GoogleSignin.configure(). The requirements genuinely differ:
 *
 *   • Android — needs ONLY the Web client ID (that is the ID token's audience). The
 *     Android OAuth client must exist in Google Cloud, matched by package + SHA-1, but
 *     its ID is never passed to any API.
 *   • iOS     — needs the Web client ID AND the iOS client ID, plus the reversed-client-ID
 *     URL scheme registered natively via the config plugin in app.json.
 *
 * iOS is therefore OFF until `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set. That is
 * deliberate and doubles as an App Store safeguard: Guideline 4.8 requires Sign in with
 * Apple as soon as a third-party social login ships on iOS, and Apple sign-in is not
 * built yet. Enabling Google on iOS before then would get the build rejected. See
 * docs/GOOGLE_SIGN_IN_SETUP.md for the exact steps to turn it on later.
 */
export const isGoogleConfigured: boolean =
  Platform.OS === "ios"
    ? !!env.GOOGLE_WEB_CLIENT_ID && !!env.GOOGLE_IOS_CLIENT_ID
    : Platform.OS === "android"
      ? !!env.GOOGLE_WEB_CLIENT_ID
      : false; // web/other: mobile app ships no browser OAuth flow
