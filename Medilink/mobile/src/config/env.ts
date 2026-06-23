/**
 * Public (EXPO_PUBLIC_*) env only. Secrets NEVER ship in the mobile bundle —
 * privileged work goes through the backend over HTTPS with the user's bearer token.
 *
 * Physical-device note: EXPO_PUBLIC_API_URL must be a host the phone can reach —
 * a staging URL or your laptop's LAN IP (e.g. http://192.168.1.20:3000), NOT
 * `localhost` (which resolves to the device itself). See mobile/.env.example.
 */
/**
 * Data source for the whole app:
 *   • mock        — typed in-memory data, no backend (UI-first; the dev default)
 *   • staging     — real HAMS/Supabase against the staging API
 *   • production  — real HAMS/Supabase against production
 */
export type DataMode = "mock" | "staging" | "production";
const RAW_DATA_MODE = (process.env.EXPO_PUBLIC_DATA_MODE ?? "mock").toLowerCase();
export const DATA_MODE: DataMode =
  RAW_DATA_MODE === "staging" || RAW_DATA_MODE === "production" ? RAW_DATA_MODE : "mock";
const isMockMode = DATA_MODE === "mock";

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
  // Google OAuth public client IDs — optional. When absent, Google sign-in stays
  // visibly disabled (we never fake auth).
  GOOGLE_WEB_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  GOOGLE_ANDROID_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  GOOGLE_IOS_CLIENT_ID: optional(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
} as const;

export const isDev = env.APP_ENV !== "production";

/** True only when real Google OAuth client IDs are configured for this platform. */
export const isGoogleConfigured =
  !!env.GOOGLE_WEB_CLIENT_ID &&
  (!!env.GOOGLE_ANDROID_CLIENT_ID || !!env.GOOGLE_IOS_CLIENT_ID);
