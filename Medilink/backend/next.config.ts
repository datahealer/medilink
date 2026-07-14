import type { NextConfig } from "next";
import path from "path";
// Backend = API-only Next.js app (privileged/heavy ops). No pages/UI.
const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // Privileged SDKs kept server-side:
  serverExternalPackages: ["pdfkit", "@google/generative-ai", "groq-sdk", "stripe", "nodemailer", "googleapis", "sharp"],
  // Monorepo: the npm-workspace root (with hoisted node_modules) is one level up
  // (Medilink/). Pin the tracing root so Vercel bundles hoisted native/heavy deps
  // (sharp, pdfkit, googleapis, …) instead of mis-detecting the git repo root.
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  // pdfkit reads its built-in AFM font metrics from disk at runtime; make sure those
  // data files are traced into the serverless bundle for the one route that uses them.
  outputFileTracingIncludes: {
    "/api/prescriptions/[id]/generate-pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
};
export default nextConfig;
