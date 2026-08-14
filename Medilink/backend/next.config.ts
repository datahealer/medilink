import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import type { NextConfig } from "next";

/**
 * Security response headers for the API-only app.
 *
 * Scoped differently from the frontend on purpose. This app serves JSON to `fetch()`
 * callers, not documents, so a document-oriented CSP has almost nothing to protect —
 * and a blanket `default-src 'none'` would break the one HTML surface here, the Scalar
 * docs page at /api/docs (already gated behind ENABLE_API_DOCS + a prod admin check).
 * The headers that DO matter for an API are applied: no framing, no MIME sniffing, a
 * tight referrer policy, and HSTS in production.
 *
 * CORS is handled separately in `src/middleware.ts` (explicit origin allow-list with
 * credentials). Different header names, so the two never conflict.
 *
 * HSTS is production-only: emitting it from a dev server pins `localhost` to HTTPS in
 * the browser's HSTS cache and breaks other local HTTP projects.
 */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

// Backend = API-only Next.js app (privileged/heavy ops). No pages/UI.
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  transpilePackages: ["@medilink/shared"],
  // Privileged SDKs kept server-side. `stripe` and `@google/generative-ai` were removed
  // alongside the dependencies themselves — payments run on Thawani and AI on Groq, so
  // neither package was ever imported and externalizing an unimported package is a no-op.
  serverExternalPackages: ["pdfkit", "groq-sdk", "nodemailer", "googleapis", "sharp"],
  // pdfkit reads its built-in AFM font metrics from disk at runtime; make sure those
  // data files are traced into the serverless bundle for the one route that uses them.
  // NOTE: do NOT set outputFileTracingRoot on Vercel — Vercel auto-detects the
  // monorepo/workspace root, and pinning it breaks server-runtime trace paths.
  outputFileTracingIncludes: {
    "/api/prescriptions/[id]/generate-pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
