import type { NextConfig } from "next";
import path from "path";
const nextConfig: NextConfig = {
  transpilePackages: ["@medilink/shared"],
  // Monorepo: pin the file-tracing root to the workspace root (Medilink/) so Vercel
  // resolves the hoisted node_modules and the transpiled @medilink/shared package.
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};
export default nextConfig;
