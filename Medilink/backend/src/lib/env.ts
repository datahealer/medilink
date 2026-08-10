/**
 * The backend's environment contract, in one place.
 *
 * Problem this solves: a missing `SUPABASE_SERVICE_ROLE_KEY` used to surface as an opaque
 * 500 on whichever privileged route a user happened to hit first, with nothing in the
 * message pointing at configuration. Now the server refuses to start and says exactly which
 * variables are absent.
 *
 * ── What counts as REQUIRED ──
 *
 * Only variables whose absence breaks *every* route. That is a deliberately narrow bar, and
 * the reason is availability: making `GROQ_API_KEY` boot-required would take payments,
 * appointments and auth offline because one AI feature lacks a key. A missing optional
 * variable degrades exactly one feature — which is the behaviour the routes already
 * implement (AI returns a graceful 5xx, never fabricated data), so promoting them to
 * required would be a regression dressed up as strictness.
 *
 * Everything else is in OPTIONAL below, each entry documenting what stops working without
 * it. That list is the "documented allow-list" half of this module: a variable absent from
 * BOTH lists is a variable nobody has thought about, and `npm run env:audit`-style drift is
 * caught by the test suite comparing these lists against `.env.example`.
 *
 * ── Where validation runs ──
 *
 * `assertBackendEnv()` is called from `instrumentation.ts` → `register()`, which Next.js runs
 * once per server runtime at startup. Deliberately NOT a module-scope throw: route modules
 * are evaluated by `next build` during page-data collection (see the lazy-init comment in
 * ai/scan-prescription), so a top-level throw in a module any route imports would make the
 * build require runtime secrets. Boot is the right gate — it catches every real
 * misconfiguration without coupling the build to deployment credentials.
 *
 * No NODE_ENV branching anywhere in this file. The required set is identical in development,
 * staging and production; an environment-dependent contract is how "works on my machine"
 * happens.
 */

/**
 * Absence breaks every route, so the server must not start.
 *
 * All three are Supabase: the URL plus the anon key back every RLS-scoped request, and the
 * service-role key backs every privileged one. There is no code path that works without them.
 */
export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Feature-scoped. Absence disables the named capability and nothing else — so it is logged
 * at boot, not fatal. The description is the contract: if you add a variable, say what
 * breaks without it, or the next person cannot tell whether it is safe to leave unset.
 */
export const OPTIONAL_ENV: Record<string, string> = {
  // ── Payments (Thawani) ──
  THAWANI_BASE_URL: "Thawani API host — checkout, verify, refund and webhook re-query all fail without it",
  THAWANI_SECRET_KEY: "Thawani API key — same four routes",
  THAWANI_PUBLISHABLE_KEY: "appended to the hosted-checkout URL; the redirect is rejected without it",
  THAWANI_CHECKOUT_BASE_URL: "hosted-checkout host; falls back to the UAT host, so real-money deploys MUST set it",
  THAWANI_WEBHOOK_SECRET: "enables webhook HMAC verification; unset skips it (the Thawani re-query stays authoritative)",
  THAWANI_WEBHOOK_SIGNATURE_HEADER: 'signature header name; defaults to "thawani-signature"',

  // ── AI (Groq) ──
  GROQ_API_KEY: "all four AI routes return a graceful 5xx without it — never fabricated data",
  GROQ_MODEL: "overrides the chat model; defaults to llama-3.3-70b-versatile",

  // ── Email (transactional only) ──
  //
  // Application email ONLY: booking/cancellation/reschedule confirmations, payment
  // receipts, invitations. Authentication email (signup verification, password reset,
  // login OTP) is delivered by Supabase Auth's own mailer and reads NONE of these — see
  // lib/email/transporter.ts. Absence disables application email and nothing else; every
  // send site already treats a failure as non-fatal.
  //
  // AUTH: Microsoft Entra OAuth2 (client credentials → XOAUTH2). Basic SMTP auth is refused
  // by Microsoft whenever Entra security defaults are enabled, so these three are the real
  // credential set. All server-only — never NEXT_PUBLIC_/EXPO_PUBLIC_.
  MICROSOFT_TENANT_ID: "Entra tenant (directory) ID — OAuth2 SMTP does not authenticate without it",
  MICROSOFT_CLIENT_ID: "Entra app (client) ID of the mail-sending app registration",
  MICROSOFT_CLIENT_SECRET: "Entra client secret — SERVER ONLY, never in a client bundle",
  SMTP_HOST: 'SMTP server; defaults to "smtp.office365.com" (Microsoft 365)',
  SMTP_PORT: "SMTP port; defaults to 587 (STARTTLS)",
  SMTP_SECURE: 'implicit TLS — set "true" ONLY with SMTP_PORT=465; 587 must stay false',
  SMTP_USER: "the mailbox to submit as (e.g. alerts@medilink.om) — required in BOTH auth modes",
  SMTP_PASS:
    "LEGACY Basic-auth password, kept only as a rollback path. Ignored whenever the " +
    "MICROSOFT_* variables are set — OAuth2 always wins, and a partial OAuth config is " +
    "reported as an error rather than silently downgrading to this",
  EMAIL_FROM: "From address on outbound email; falls back to SMTP_USER",
  SMTP_CA_FILE:
    "extra trusted root (PEM path) for a dev machine behind a TLS-intercepting proxy or " +
    'endpoint antivirus, which otherwise fails with "self-signed certificate in certificate ' +
    'chain". Adds a root; verification stays on. Leave unset in production',
  // Legacy names from the Gmail-era modules. Still read as a fallback so an environment
  // that has not been migrated keeps sending; prefer SMTP_USER / SMTP_PASS.
  EMAIL_USER: "deprecated alias for SMTP_USER",
  EMAIL_PASS: "deprecated alias for SMTP_PASS",

  // ── Google (OAuth + Calendar) ──
  GOOGLE_CLIENT_ID: "Google sign-in / Calendar sync; the routes fail without it",
  GOOGLE_CLIENT_SECRET: "same",
  GOOGLE_REDIRECT_URI: "OAuth redirect target; the callback cannot complete without it",

  // ── URLs ──
  NEXT_PUBLIC_APP_URL:
    "absolute base for payment success/cancel redirects. NOT interpolation-safe: checkout builds " +
    '"undefined/payment-success" if unset, so treat it as required for any deploy taking payments',
  NEXT_PUBLIC_FRONTEND_URL: "added to the CORS allow-list in middleware.ts",
  FRONTEND_URL: "server-side alias for the same CORS entry",

  // ── Misc ──
  INVITE_SECRET: "HMAC key for set-password links and the internal push header; those two routes fail without it",
  ENABLE_API_DOCS: 'must be exactly "true" to expose /api/docs; anything else returns 404',
  SENTRY_DSN: "error reporting; unset leaves it completely inert (see instrumentation.ts)",
};

/** Framework-managed — set by Next.js, never by a deployer. Listed so drift checks ignore it. */
export const FRAMEWORK_ENV = ["NODE_ENV"] as const;

/** Returns the names of any REQUIRED variables that are missing or blank. */
export function missingRequiredEnv(
  source: Record<string, string | undefined> = process.env
): string[] {
  return REQUIRED_ENV.filter((name) => {
    const value = source[name];
    // A variable present but empty is a misconfiguration, not a value — `SUPABASE_URL=`
    // in a .env file is the single most common way this goes wrong.
    return value === undefined || value.trim() === "";
  });
}

/** Optional variables that are absent, so boot can say which features are inactive. */
export function inactiveOptionalEnv(
  source: Record<string, string | undefined> = process.env
): string[] {
  return Object.keys(OPTIONAL_ENV).filter((name) => {
    const value = source[name];
    return value === undefined || value.trim() === "";
  });
}

/**
 * Fail the boot if the environment cannot support the app.
 *
 * Reports EVERY missing variable at once. Failing on the first one turns configuring a fresh
 * environment into a game of whack-a-mole — restart, discover the next name, repeat.
 */
export function assertBackendEnv(source: Record<string, string | undefined> = process.env): void {
  const missing = missingRequiredEnv(source);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ` +
        `${missing.join(", ")}. ` +
        `The backend cannot serve any route without these. ` +
        `See .env.example for the full contract.`
    );
  }
}

/**
 * Typed access to the required values, for code that would otherwise write
 * `process.env.X!` and pass `undefined` into a client constructor.
 *
 * Getters, not a resolved object: reading a value is what validates it, so importing this
 * module stays free of side effects and cannot make `next build` depend on runtime secrets.
 */
export const env = {
  get SUPABASE_URL(): string {
    return requireValue("NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_ANON_KEY(): string {
    return requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return requireValue("SUPABASE_SERVICE_ROLE_KEY");
  },
};

function requireValue(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example for the full contract.`
    );
  }
  return value;
}
