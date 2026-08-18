import { NextRequest, NextResponse } from "next/server";
import { corsRejectionLog, resolveAllowedOrigin } from "@/lib/http/corsOrigins";

/**
 * CORS for the API-only backend.
 *
 * The frontend is a SEPARATE ORIGIN in the deployed setup, and it calls these routes with
 * `credentials: "include"` plus an `Authorization: Bearer` header. Credentialed CORS requires an
 * explicit allowed origin (never `*`) together with `Access-Control-Allow-Credentials: true`, so
 * the request origin is reflected only when it is on the allow-list.
 *
 * This does NOT touch authentication or any query — it only adds the response headers the
 * browser needs in order to expose an already-correct response to JavaScript, and answers
 * preflight (OPTIONS) requests.
 *
 * The allow-list rules, the reason they are resolved per request rather than once at module
 * scope, and the `NEXT_PUBLIC_*` build-inlining trap are all documented in
 * `lib/http/corsOrigins.ts`. That module is pure and unit-tested; this file is just the wiring.
 */

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function applyCors(req: NextRequest, headers: Headers): Headers {
  const origin = req.headers.get("origin");

  // No Origin header at all: a same-origin call, a server-to-server call, or curl. Nothing to
  // authorise and nothing to add — CORS is a browser mechanism.
  if (!origin) return headers;

  /**
   * `allowOrigin` is the CANONICAL origin to echo — deliberately not the raw header.
   *
   * Reflecting `origin` verbatim was a crash vector: an Origin such as
   * `https://app.example.com/\r\nX-Injected: 1` normalises to the allow-listed origin (WHATWG
   * URL parsing strips CR/LF), so it passed the check, but the raw string still contained the
   * CR/LF and `Headers.set()` throws TypeError on that — a 500 on any backend route from an
   * unauthenticated request. See `resolveAllowedOrigin`.
   */
  const allowOrigin = resolveAllowedOrigin(origin, process.env);

  if (!allowOrigin) {
    /**
     * Log the refusal.
     *
     * The previous implementation refused silently, which is how a completely empty allow-list
     * reached production and stayed there: every browser call failed with an opaque CORS error
     * while the server logs showed healthy 200s and 401s. One line here turns that into a
     * diagnosable condition. Never includes an environment value beyond a public hostname.
     */
    const reason = corsRejectionLog(origin, process.env);
    if (reason) console.warn(reason);
    return headers;
  }

  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
  headers.set(
    "Access-Control-Allow-Headers",
    req.headers.get("access-control-request-headers") || "Content-Type, Authorization"
  );
  // The response body varies by Origin because we reflect it — keep shared caches correct.
  headers.append("Vary", "Origin");
  return headers;
}

export function middleware(req: NextRequest) {
  // Preflight: answer directly with the CORS headers, no body.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: applyCors(req, new Headers()) });
  }

  const res = NextResponse.next();
  applyCors(req, res.headers);
  return res;
}

// Only the API surface needs CORS.
export const config = {
  matcher: "/api/:path*",
};
