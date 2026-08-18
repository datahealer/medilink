/**
 * CORS allow-list resolution — pure, so the rules are assertable without Next.js.
 *
 * ── WHY THIS EXISTS ──
 *
 * The deployed backend was returning NO `Access-Control-Allow-Origin` for ANY origin. Probed
 * against production on 2026-08-18: the real frontend, the custom domain, preview URLs and
 * localhost all got nothing back. The allow-list was simply EMPTY, because neither
 * `NEXT_PUBLIC_FRONTEND_URL` nor `FRONTEND_URL` is set in the backend's environment.
 *
 * The old code was CORRECT about that — "an empty allow-list refuses everything, which is the
 * correct failure direction for CORS" — but it had three properties that turned a missing
 * environment variable into a silent, hard-to-diagnose outage:
 *
 *   1. THE LIST WAS BUILT AT MODULE SCOPE. In the Edge runtime that is evaluated once per
 *      isolate boot, so a corrected environment variable did not take effect until the isolate
 *      recycled. Resolution now happens per request.
 *
 *   2. MATCHING WAS EXACT-STRING. `https://app.example.com/` (one trailing slash, which is
 *      what you get if you paste a URL out of a browser bar) never matched the Origin header
 *      `https://app.example.com`, and failed with no explanation. Both sides are normalised now.
 *
 *   3. ONLY ONE ORIGIN COULD BE CONFIGURED. A Vercel project has a production domain AND a
 *      per-deployment preview URL, and this product also expects a custom domain later. One
 *      slot forced a choice between them. A comma-separated list is accepted now.
 *
 * And separately — the failure was SILENT. Nothing was logged when an origin was refused, which
 * is why this survived to production. `corsRejectionLog()` exists so the next occurrence is one
 * log line away from being understood.
 *
 * ── WHAT DELIBERATELY DID NOT CHANGE ──
 *
 * No wildcards. No `*.vercel.app` pattern — every Vercel project shares that suffix, so
 * allowing it would let any Vercel-hosted site make credentialed calls to this API. No `*`
 * response value, because `Access-Control-Allow-Credentials: true` is meaningless with it and
 * bearer/cookie auth would break. `http://localhost:3000` stays excluded whenever
 * `NODE_ENV === "production"`, which includes Vercel preview deployments.
 *
 * The allow-list is still the only thing that grants access, and it is still empty by default.
 *
 * ── THE BUILD-TIME TRAP (read this before configuring) ──
 *
 * `NEXT_PUBLIC_*` variables are INLINED INTO THE BUNDLE at build time. Verified empirically:
 * a sentinel passed as `NEXT_PUBLIC_FRONTEND_URL` appears verbatim inside
 * `.next/server/src/middleware.js` after `next build`, while a sentinel passed as
 * `FRONTEND_URL` appears nowhere in the output.
 *
 * So setting `NEXT_PUBLIC_FRONTEND_URL` in a hosting dashboard and NOT redeploying changes
 * nothing — the old (empty) value is already compiled in. `FRONTEND_URL` is read at runtime and
 * is therefore the variable to prefer. Both are still supported, because `.env.example`
 * documents both and existing deployments may use either.
 */

export interface CorsEnv {
  NODE_ENV?: string;
  /** Runtime-read. PREFER THIS — it is not baked into the bundle. Comma-separated. */
  FRONTEND_URL?: string;
  /** Build-inlined by Next. Requires a redeploy to change. Comma-separated. */
  NEXT_PUBLIC_FRONTEND_URL?: string;
}

/** Origin allowed only outside production, so local web dev keeps working. */
export const DEV_ORIGIN = "http://localhost:3000";

/**
 * Normalise an origin for comparison.
 *
 * An Origin header is `scheme://host[:port]` with no path and no trailing slash. Configured
 * values routinely arrive with one, or with mixed case in the host, or wrapped in whitespace
 * from a copy-paste. Scheme and host are case-insensitive per RFC 3986; the port is not
 * touched, and neither is anything else — this only removes differences that are not
 * differences.
 *
 * Returns "" for anything unusable, and "" never matches, so a malformed configured value
 * fails closed rather than matching unexpectedly.
 */
export function normalizeOrigin(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Reject anything that is not a plain absolute origin. `null` is a real Origin header value
  // (sandboxed iframes, some redirects) and must never be allow-listed.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  // `url.origin` is already scheme + lowercased host + non-default port, with no trailing slash.
  return url.origin.toLowerCase();
}

/**
 * The set of origins permitted to make credentialed cross-origin calls.
 *
 * Both variables are read and merged, each accepting a comma-separated list, so a deployment
 * can allow its production domain and its preview URL together.
 */
export function allowedOrigins(env: CorsEnv): Set<string> {
  const isProduction = env.NODE_ENV === "production";

  const configured = [env.FRONTEND_URL, env.NEXT_PUBLIC_FRONTEND_URL]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .flatMap((v) => v.split(","))
    .map(normalizeOrigin)
    .filter(Boolean);

  const origins = new Set<string>(configured);
  if (!isProduction) origins.add(normalizeOrigin(DEV_ORIGIN));
  return origins;
}

/** Is this request's Origin allowed? Compares normalised values on both sides. */
export function isOriginAllowed(origin: string | undefined | null, env: CorsEnv): boolean {
  return resolveAllowedOrigin(origin, env) !== null;
}

/**
 * The exact value to send back in `Access-Control-Allow-Origin`, or null to send nothing.
 *
 * ── WHY THIS RETURNS A VALUE INSTEAD OF A BOOLEAN ──
 *
 * The caller must reflect THIS string, never the raw `Origin` header. Matching is done on the
 * normalised form, so several different raw headers can legitimately be allowed while denoting
 * the same origin, and reflecting the raw bytes then emits something that is not a serialised
 * origin. Found by probing this module directly:
 *
 *   Origin: https://app.example.com/\r\nX-Injected: 1   normalises to https://app.example.com
 *   Origin: https://app.\r\nexample.com                 normalises to https://app.example.com
 *
 * WHATWG URL parsing strips tabs and newlines from its input, so both are allowed — correctly,
 * they do name the allow-listed origin. But the RAW string still holds the CR/LF, and
 * `Headers.set()` rejects a header value containing one with a TypeError. Reflecting raw
 * therefore turned a crafted request header into an unhandled throw in middleware — a 500 on
 * every backend route, from an unauthenticated request.
 *
 * It was not a header-injection hole: `Headers.set()` refusing the value is what made it a
 * crash instead of a smuggled header. Two lesser variants existed too — userinfo
 * (`https://evil.com@app.example.com`, where the host really is the allow-listed one) and
 * percent-encoded dots (`app%2Eexample%2Ecom`) — both of which would have reflected a
 * technically-invalid origin that browsers reject anyway.
 *
 * Returning the canonical value removes the whole class: what goes out is always exactly one of
 * the configured origins, and for any Origin a real browser sends it is byte-identical to the
 * header that arrived.
 */
export function resolveAllowedOrigin(origin: string | undefined | null, env: CorsEnv): string | null {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  return allowedOrigins(env).has(normalized) ? normalized : null;
}

/**
 * One operator-readable line explaining a refusal, or null when the origin is allowed.
 *
 * Logged server-side only. An Origin header is not a secret — it is attacker-supplied public
 * data — and the configured origins are public hostnames, so naming them is safe and is the
 * entire point. No environment VALUE beyond a hostname is ever included.
 *
 * Distinguishes "nothing is configured" from "configured, but this origin is not on the list",
 * because the fixes are completely different and the old silent failure made them
 * indistinguishable.
 */
export function corsRejectionLog(origin: string | undefined | null, env: CorsEnv): string | null {
  if (isOriginAllowed(origin, env)) return null;

  const allowed = allowedOrigins(env);
  const shown = origin ? normalizeOrigin(origin) || `<unparseable: ${String(origin).slice(0, 60)}>` : "<no Origin header>";

  if (allowed.size === 0) {
    return (
      `[cors] refused ${shown} — the allow-list is EMPTY. Set FRONTEND_URL (read at runtime; ` +
      `comma-separated for several origins). NEXT_PUBLIC_FRONTEND_URL also works but is inlined ` +
      `at build time, so it needs a redeploy to take effect.`
    );
  }
  return `[cors] refused ${shown} — not in the allow-list (${[...allowed].join(", ")})`;
}
