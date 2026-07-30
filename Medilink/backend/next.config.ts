import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import type { NextConfig } from "next";
// Backend = API-only Next.js app (privileged/heavy ops). No pages/UI.
const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // Privileged SDKs kept server-side:
  serverExternalPackages: ["pdfkit", "@google/generative-ai", "groq-sdk", "stripe", "nodemailer", "googleapis", "sharp"],
  // pdfkit reads its built-in AFM font metrics from disk at runtime; make sure those
  // data files are traced into the serverless bundle for the one route that uses them.
  // NOTE: do NOT set outputFileTracingRoot on Vercel — Vercel auto-detects the
  // monorepo/workspace root, and pinning it breaks server-runtime trace paths.
  outputFileTracingIncludes: {
    "/api/prescriptions/[id]/generate-pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
