import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // NOTE: do NOT set outputFileTracingRoot on Vercel — Vercel auto-detects the
  // monorepo/workspace root; pinning it breaks server-runtime trace paths.
};
export default nextConfig;
