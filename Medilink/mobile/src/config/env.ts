/**
 * Public (EXPO_PUBLIC_*) env only. Secrets never ship in the mobile bundle —
 * privileged work goes through the backend over HTTPS with the user's bearer token.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  SUPABASE_URL: required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL
  ),
  SUPABASE_ANON_KEY: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ),
  BACKEND_URL: required(
    "EXPO_PUBLIC_BACKEND_URL",
    process.env.EXPO_PUBLIC_BACKEND_URL
  ),
} as const;
