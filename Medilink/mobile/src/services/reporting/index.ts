import Constants from "expo-constants";

import { env, isDev } from "@/config/env";

/**
 * Crash/error reporting for the mobile app.
 *
 * The ONLY module that knows Sentry exists. App code calls `reportError` and never imports
 * the SDK, so swapping or removing the provider is a change to this one file.
 *
 * ── Why Sentry is loaded lazily, via `require`, instead of a top-level import ──
 *
 * `@sentry/react-native` ships native code. A static import binds the native module the
 * moment this file is evaluated, which would break any dev client or standalone build made
 * BEFORE this dependency was added — the JS bundle would look for a native module the
 * binary doesn't contain. Requiring it only once a DSN is present means:
 *
 *   • with no DSN (today, and every local dev setup) the SDK is never evaluated at all, so
 *     adding this dependency cannot change how the existing app behaves; and
 *   • the roadmap's "no-op when DSN unset" requirement is satisfied literally, not merely
 *     by initialising a client that drops events.
 *
 * ── Scope of what is captured ──
 *
 * `enableNative: false` on purpose. Native crash capture and readable stack traces need the
 * `@sentry/react-native/expo` config plugin plus a source-map upload step in the EAS build,
 * neither of which can be verified without an actual native build. JS-level errors — which
 * is what the ErrorBoundary and every `catch` block produce — are captured today. Turning on
 * native is the documented swap below and is additive.
 *
 * ── Enabling it later (the whole swap) ──
 *
 *   1. set `EXPO_PUBLIC_SENTRY_DSN` in the EAS profile (see eas.json / mobile/.env.example)
 *   2. add `@sentry/react-native/expo` to `plugins` in app.json, set `enableNative: true`
 *      here, and rebuild — this is what adds native crash capture and source maps
 *
 * ── Privacy ──
 *
 * This app carries PHI, so nothing is attached automatically: `sendDefaultPii` is off and no
 * user identifier is ever set. Associating crashes with a patient id is a privacy-policy
 * decision, not an engineering default, so there is deliberately no API here to do it.
 * Callers pass only non-identifying `tags`/`extra`.
 */

type SentryModule = typeof import("@sentry/react-native");

export type ReportContext = {
  /** Low-cardinality labels, e.g. `{ surface: "error-boundary" }`. Never PII. */
  tags?: Record<string, string>;
  /** Extra diagnostic detail attached to the event. Never PII. */
  extra?: Record<string, unknown>;
};

let sentry: SentryModule | null = null;
let initialised = false;

/** True when a DSN was configured and the SDK is live. False in every local dev setup. */
export function isReportingActive(): boolean {
  return sentry !== null;
}

/**
 * Wire up reporting. Safe to call more than once; only the first call does anything.
 * Called from the root layout so it runs before any screen can throw.
 */
export function initReporting(): void {
  if (initialised) return;
  initialised = true;

  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    if (isDev) {
      console.log("[MediLink] error reporting disabled (no EXPO_PUBLIC_SENTRY_DSN)");
    }
    return;
  }

  try {
    // Deliberate lazy load — see the header comment. A static import would bind native
    // code in builds that predate this dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@sentry/react-native") as SentryModule;
    mod.init({
      dsn,
      // Distinguishes staging noise from real production incidents.
      environment: env.APP_ENV,
      // Ties an event to a build. `version` comes from app.json; nativeBuildVersion is the
      // per-store build number, which is what actually differs between two uploads of the
      // same version.
      release: `medilink-mobile@${Constants.expoConfig?.version ?? "unknown"}`,
      dist: Constants.expoConfig?.runtimeVersion?.toString() ?? undefined,
      // See the header: native capture needs the config plugin + a verified rebuild.
      enableNative: false,
      // PHI app — never let the SDK infer identity from the device or request.
      sendDefaultPii: false,
      // Performance tracing is a separate decision with its own cost; errors only for now.
      tracesSampleRate: 0,
      debug: isDev,
    });
    sentry = mod;
  } catch (err) {
    // A reporting failure must never take the app down. If the SDK can't load (e.g. a
    // binary without the native module), fall back to console-only reporting.
    console.warn(
      "[MediLink] error reporting unavailable:",
      err instanceof Error ? err.message : String(err)
    );
    sentry = null;
  }
}

/**
 * Report an error.
 *
 * Always writes to the console first, so behaviour with no DSN is exactly what it was
 * before reporting existed and a developer never loses a stack trace to a silent reporter.
 */
export function reportError(error: unknown, context?: ReportContext): void {
  console.error("[MediLink]", error, context?.extra ?? "");

  if (!sentry) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    sentry.captureException(err, { tags: context?.tags, extra: context?.extra });
  } catch {
    // Swallow: a failure to report is never worth escalating to the user.
  }
}

/** Test seam: drops the loaded client so each test starts from a known state. */
export function resetReportingForTests(): void {
  sentry = null;
  initialised = false;
}
