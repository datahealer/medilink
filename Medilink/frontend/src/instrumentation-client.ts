/**
 * Browser-side error reporting for the patient web app. Next.js loads this file on the
 * client before the app boots, so it can catch errors during first render.
 *
 * ── Why the SDK is imported dynamically ──
 *
 * A static `import * as Sentry` puts the whole browser SDK in the initial chunk whether or
 * not a DSN is set — measured at ~384 KB of uncompressed JS, about 15% of this app's client
 * bundle. No DSN is configured yet, so that is pure cost shipped to every patient, many of
 * them on mobile connections. Importing inside the guard moves the SDK into its own async
 * chunk the browser only fetches once a DSN exists, which makes "inert when unset" literally
 * true rather than merely "loaded but silent".
 *
 * The trade-off, stated plainly: the SDK loads a tick after boot, so an error thrown in that
 * window is missed. A static import would trade a permanent 384 KB penalty for that narrow
 * window. Once a DSN is configured permanently, switching back to a static import is a
 * one-line change and at that point the better call.
 *
 * Uses NEXT_PUBLIC_SENTRY_DSN rather than SENTRY_DSN because this runs in the browser and the
 * value must be inlined at build time. That is by design: a DSN is a public, write-only
 * ingest key, the same category as the Supabase anon key.
 *
 * ── Privacy ──
 *
 * `sendDefaultPii` is off, and Session Replay and browser tracing are deliberately NOT
 * enabled. Replay records the DOM, which on a patient portal means capturing medical records
 * verbatim — that needs a privacy review and explicit masking rules, not an SDK default.
 */
type SentryModule = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentry: SentryModule | null = null;

if (dsn) {
  void import("@sentry/nextjs")
    .then((mod) => {
      mod.init({
        dsn,
        environment: process.env.NODE_ENV,
        // Errors only. Tracing carries its own quota/cost profile and is a separate decision.
        tracesSampleRate: 0,
        sendDefaultPii: false,
      });
      sentry = mod;
    })
    .catch((err: unknown) => {
      // Reporting must never be the reason the app fails to start.
      console.warn(
        "[MediLink] error reporting unavailable:",
        err instanceof Error ? err.message : String(err)
      );
    });
}

/**
 * Next.js calls this on client-side navigations so router errors are attributable. Exported
 * unconditionally and forwarded only once the SDK has loaded — Next requires a synchronous
 * export, which a dynamic import cannot provide directly.
 */
export const onRouterTransitionStart: SentryModule["captureRouterTransitionStart"] = (
  ...args
) => sentry?.captureRouterTransitionStart(...args);
