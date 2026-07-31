import * as Sentry from "@sentry/nextjs";

import { assertBackendEnv, inactiveOptionalEnv } from "@/lib/env";

/**
 * Server-side error reporting for the API app.
 *
 * Next.js calls `register()` once per server runtime at startup, and `onRequestError` for
 * every unhandled error thrown while handling a request — which for this app means route
 * handlers. There is no client init file here on purpose: this app is API-only, it serves
 * JSON and has no UI to instrument.
 *
 * Inert without a DSN. `Sentry.init` is skipped entirely and `onRequestError` returns
 * immediately, so the default configuration adds no network calls, no overhead, and no
 * behaviour change — it only starts reporting once `SENTRY_DSN` is set.
 *
 * DELIBERATELY NOT wired yet: `withSentryConfig` in `next.config.ts`. That is the build-time
 * half (source-map upload so stack traces are readable, plus an optional tunnel route). It
 * needs `SENTRY_AUTH_TOKEN` — a real credential — and it changes how the production bundle is
 * built, so it is left as an explicit follow-up rather than bundled into observability
 * scaffolding. Runtime capture, below, does not depend on it; unminified server stacks are
 * already readable.
 */
const dsn = process.env.SENTRY_DSN;

export async function register() {
  // Environment contract first, before anything else gets a chance to fail obscurely.
  // `register()` runs once per server runtime at startup, which makes it the earliest hook
  // that can refuse to serve a misconfigured deployment. Throwing here fails the boot.
  assertBackendEnv();

  const inactive = inactiveOptionalEnv();
  if (inactive.length > 0) {
    // Not a warning about a mistake — most of these are legitimately unset in development.
    // It is here so "why did email not send" is answerable from the startup log.
    console.info(
      `[MediLink] optional env not set, these features are inactive: ${inactive.join(", ")}`
    );
  }

  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Errors only for now. Tracing has its own cost/quota profile and is a separate call.
    tracesSampleRate: 0,
    // This app handles PHI: never let the SDK attach request bodies, headers, cookies or IPs.
    sendDefaultPii: false,
  });
}

/**
 * Required for App Router route handlers — thrown errors are caught by the framework, so
 * without this hook they never reach Sentry.
 */
export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!dsn) return;
  return Sentry.captureRequestError(...args);
};
