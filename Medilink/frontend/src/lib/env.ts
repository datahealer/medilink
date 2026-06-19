/**
 * Typed access to PUBLIC env vars only. Secrets (service-role key, Thawani/Stripe
 * secrets, etc.) live in `backend/` and must never be imported here — anything
 * referenced in this package can end up in the browser bundle.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required public env var: ${name}`);
  }
  return value;
}

export const env = {
  SUPABASE_URL: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  // Backend (Next.js API) base URL for privileged routes. Falls back to same-origin.
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "",
} as const;
