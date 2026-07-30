/**
 * The patient web app's environment contract, in one place.
 *
 * PUBLIC vars only. Secrets (service-role key, Thawani keys, SMTP credentials) belong in
 * `backend/` and must never be referenced from this package — anything reachable from here
 * can be inlined into the browser bundle. `backend/src/lib/env.ts` is the server-side
 * counterpart and owns that half of the contract.
 *
 * ── Why this validates at module load, while the backend's validates at boot ──
 *
 * Not an inconsistency; the two have genuinely different deadlines. `NEXT_PUBLIC_*` values
 * are INLINED INTO THE BUNDLE at build time, so a build that runs without them produces
 * artifacts that can never work however the server is configured afterwards — the failure has
 * to happen during the build. Backend secrets are read per request, so the backend validates
 * at boot and keeps its build independent of deployment credentials.
 *
 * Confirmed rather than assumed: with `NEXT_PUBLIC_SUPABASE_URL` blank, `next build` fails
 * during page-data collection for `/auth/callback`. That is pre-existing behaviour, and
 * keeping it is deliberate.
 */

/** Absence produces a bundle that cannot work, so the build must fail. */
const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/**
 * Feature-scoped: absence degrades one capability, and the app still builds and runs. The
 * description is the contract — say what breaks, or nobody can tell whether it is safe to
 * leave unset.
 */
export const OPTIONAL_ENV: Record<string, string> = {
  NEXT_PUBLIC_BACKEND_URL:
    "base URL for the privileged backend API (payments, AI, PDFs, OTP). Falls back to an " +
    "empty string, i.e. same-origin — correct only when the backend is proxied under this " +
    "host, so a split deployment must set it",
  NEXT_PUBLIC_SENTRY_DSN:
    "browser error reporting; unset means the Sentry SDK is never downloaded at all " +
    "(see instrumentation-client.ts)",
  SENTRY_DSN: "server-side error reporting for SSR and route handlers; unset leaves it inert",
};

/**
 * Report EVERY missing variable at once.
 *
 * The previous implementation threw on the first one it hit, which turns configuring a fresh
 * environment into a restart-and-discover-the-next-name loop.
 */
function assertRequired(): void {
  const missing = REQUIRED_ENV.filter((name) => {
    const value = process.env[name];
    // Present-but-empty is a misconfiguration, not a value: `NEXT_PUBLIC_SUPABASE_URL=` in a
    // .env file is the most common way this goes wrong. (The previous `!value` check caught
    // this too; keeping the behaviour explicit rather than incidental.)
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required public env var${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        `These are inlined into the browser bundle at build time, so the build cannot produce ` +
        `a working app without them. See .env.example for the full contract.`
    );
  }
}

assertRequired();

export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  // Backend (Next.js API) base URL for privileged routes. Empty string = same origin.
  // Preserved exactly: call sites concatenate onto this directly.
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "",
} as const;

/** Optional vars currently absent — for a startup diagnostic or a config-health view. */
export function inactiveOptionalEnv(): string[] {
  return Object.keys(OPTIONAL_ENV).filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });
}
