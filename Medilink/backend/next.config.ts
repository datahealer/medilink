import type { NextConfig } from "next";
// Backend = API-only Next.js app (privileged/heavy ops). No pages/UI.
const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // Privileged SDKs kept server-side:
  serverExternalPackages: ["pdfkit", "@google/generative-ai", "groq-sdk", "stripe", "nodemailer", "googleapis", "sharp"],
};
export default nextConfig;
