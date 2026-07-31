import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting for the patient web app (SSR, server components, route
 * handlers). The browser half lives in `instrumentation-client.ts`.
 *
 * Inert without a DSN — `Sentry.init` is skipped and `onRequestError` returns immediately,
 * so the shipped default adds no overhead and changes no behaviour.
 *
 * DELIBERATELY NOT wired yet: `withSentryConfig` in `next.config.ts`. That is the build-time
 * half (source-map upload, optional tunnel route); it needs `SENTRY_AUTH_TOKEN` and it changes
 * production bundling, so it is a separate, explicit step. Without it, browser stack traces
 * from `instrumentation-client.ts` will be minified — the events still arrive, they are just
 * harder to read. That is the one real limitation of stopping here.
 */
const dsn = process.env.SENTRY_DSN;

export async function register() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Patient portal: no request bodies, headers, cookies or IPs.
    sendDefaultPii: false,
  });
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!dsn) return;
  return Sentry.captureRequestError(...args);
};
