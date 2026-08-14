import { NextRequest, NextResponse } from "next/server";

/**
 * CORS for the API-only backend.
 *
 * The frontend (a separate origin, e.g. http://localhost:3000) calls these routes
 * with `credentials: "include"`. Credentialed CORS requires an explicit allowed
 * origin (never `*`) plus `Access-Control-Allow-Credentials: true`, so we reflect
 * the request origin only when it is in the allow-list below.
 *
 * This does NOT touch authentication or any query — it only adds the response
 * headers the browser needs to expose the (already-correct) response to JS,
 * and answers CORS preflight (OPTIONS) requests.
 */
/**
 * `http://localhost:3000` is allowed ONLY outside production.
 *
 * It used to be allow-listed unconditionally, so the deployed API reflected
 * `Access-Control-Allow-Origin: http://localhost:3000` with
 * `Access-Control-Allow-Credentials: true`. Anything a patient runs on their own port 3000
 * — a dev server, a local tool, a malicious app told to listen there — could then make
 * credentialed cross-origin calls to production and read the responses.
 *
 * Gated on NODE_ENV rather than removed, because local web development genuinely needs it:
 * `frontend` runs on :3000 and calls this API on :3001 as a separate origin. Next sets
 * NODE_ENV=production in a deployed build and development under `next dev`, so this needs
 * no new environment variable.
 *
 * Production origins come from NEXT_PUBLIC_FRONTEND_URL / FRONTEND_URL, which are already
 * the documented way to add one (see .env.example). An unset value is dropped rather than
 * defaulted — an empty allow-list refuses everything, which is the correct failure
 * direction for CORS.
 */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ALLOWED_ORIGINS = new Set<string>(
  [
    IS_PRODUCTION ? "" : "http://localhost:3000",
    process.env.NEXT_PUBLIC_FRONTEND_URL ?? "",
    process.env.FRONTEND_URL ?? "",
  ].filter(Boolean)
);

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function applyCors(req: NextRequest, headers: Headers): Headers {
  const origin = req.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
    headers.set(
      "Access-Control-Allow-Headers",
      req.headers.get("access-control-request-headers") || "Content-Type, Authorization"
    );
    // Response varies by Origin because we reflect it — keep caches correct.
    headers.append("Vary", "Origin");
  }
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
