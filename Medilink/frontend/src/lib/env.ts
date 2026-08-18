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

/**
 * ── Why every read below is a LITERAL `process.env.NEXT_PUBLIC_X` ──
 *
 * Next.js inlines these by substituting the exact member-expression `process.env.NEXT_PUBLIC_X`
 * for a string literal at build time (webpack DefinePlugin-style). It is a syntactic match, not
 * data-flow analysis, so a DYNAMIC read — `process.env[name]` — is never substituted and
 * survives into the browser bundle as a real runtime lookup.
 *
 * That mattered: it shipped a bug. On the client `globalThis.process` does not exist, so Next's
 * shim falls back to a polyfill whose `env` is `{}` — making every dynamic lookup `undefined`
 * while the static ones held their inlined values. The build and SSR passed (real `process.env`
 * there), the bundle genuinely contained the Supabase URL, and yet the browser threw
 * "Missing required public env vars" on load.
 *
 * So: never read a NEXT_PUBLIC_* value through a computed key in this file. Keep the name and
 * the read adjacent in a literal map.
 */

/** Absence produces a bundle that cannot work, so the build must fail. */
const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** Statically-inlinable reads for the required set. Order matches REQUIRED_ENV. */
const REQUIRED_VALUES: Record<(typeof REQUIRED_ENV)[number], string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

/** Statically-inlinable reads for the optional set. Keys match OPTIONAL_ENV. */
const OPTIONAL_VALUES: Record<string, string | undefined> = {
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
  NEXT_PUBLIC_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
  // Server-only by design (no NEXT_PUBLIC_ prefix), so this is always undefined in the
  // browser. `inactiveOptionalEnv` is a diagnostic, so reporting it as inactive client-side
  // is expected and was the behaviour before this fix too.
  SENTRY_DSN: process.env.SENTRY_DSN,
};

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
  NEXT_PUBLIC_SUPPORT_EMAIL:
    "public support address. The /contact form opens the visitor's mail client addressed to " +
    "it; unset REPLACES the form with an honest 'messaging isn't available yet' notice rather " +
    "than the fake success state that shipped before, and drops the email link from the footer",
  NEXT_PUBLIC_SUPPORT_PHONE:
    "public support phone in international form. Unset omits the Call and WhatsApp channels " +
    "entirely — never substitute a placeholder number",
  NEXT_PUBLIC_SUPPORT_WHATSAPP:
    "public WhatsApp number, when it differs from NEXT_PUBLIC_SUPPORT_PHONE. Unset falls back " +
    "to the phone number, and omits WhatsApp when that is unset too",
};

/**
 * Report EVERY missing variable at once.
 *
 * The previous implementation threw on the first one it hit, which turns configuring a fresh
 * environment into a restart-and-discover-the-next-name loop.
 */
function assertRequired(): void {
  const missing = REQUIRED_ENV.filter((name) => {
    // Reads the pre-resolved literal map, NOT `process.env[name]` — see the note above.
    const value = REQUIRED_VALUES[name];
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
    // Same reason as assertRequired: literal map, never a computed `process.env` key.
    const value = OPTIONAL_VALUES[name];
    return value === undefined || value.trim() === "";
  });
}
