import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * The app had none, which for a PHI-carrying patient portal left clickjacking, MIME
 * sniffing and protocol downgrade entirely unmitigated.
 *
 * Two deliberate choices:
 *
 * 1. CSP ships as REPORT-ONLY. Next.js App Router injects its own inline bootstrap and
 *    RSC-flight scripts, so an enforcing `script-src` without per-request nonces would
 *    break hydration on every page. Nonces mean threading a value through
 *    `middleware.ts` (which today only refreshes the Supabase session) — worth doing as
 *    its own task once report-only has produced a clean QA run. Until then the header
 *    still surfaces violations with zero risk of breaking the app.
 *
 * 2. HSTS is emitted only in production builds. Sending it from a dev server pins
 *    `localhost` to HTTPS in the browser's HSTS cache, which breaks every other local
 *    HTTP project on that machine and is awkward to clear.
 *
 * The origins below are evidence-based, not guessed:
 *   • Supabase auth/REST/realtime/storage — NEXT_PUBLIC_SUPABASE_URL
 *   • MediLink backend API               — NEXT_PUBLIC_BACKEND_URL
 *   • OpenStreetMap raster tiles         — NearbyDoctorsMap.tsx:127
 *   • fonts are `next/font/local`  -> no external font origin required
 *   • leaflet is an npm dependency -> no CDN origin required
 */
const isProd = process.env.NODE_ENV === "production";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
// Supabase realtime is a websocket on the same host as the REST endpoint.
const supabaseWs = supabaseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const connectSrc = [
  "'self'",
  supabaseUrl,
  supabaseWs,
  backendUrl,
  "https://*.tile.openstreetmap.org",
]
  .filter(Boolean)
  .join(" ");

const imgSrc = ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", supabaseUrl]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required until nonces land — see note 1 above.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind and Next inject style attributes and <style> blocks.
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Report-only for now. Promote to `Content-Security-Policy` once a full QA pass
  // reports no violations.
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays available to self (the map's "near me"); nothing else is used.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // NOTE: do NOT set outputFileTracingRoot on Vercel — Vercel auto-detects the
  // monorepo/workspace root; pinning it breaks server-runtime trace paths.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
