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
const ALLOWED_ORIGINS = new Set<string>(
  [
    "http://localhost:3000",
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
