/**
 * GET /api/docs — interactive Scalar API reference (with "Try it out" + Authorize).
 *
 * Reads the spec from /api/openapi.json. Gated by the same `denyDocsAccess` rule as
 * the spec endpoint (ENABLE_API_DOCS flag; prod requires an internal admin).
 */
import { type NextRequest } from "next/server";
import { ApiReference } from "@scalar/nextjs-api-reference";
import { denyDocsAccess } from "@/lib/openapi/access";

export const dynamic = "force-dynamic";

// Scalar returns an () => Response handler that serves the reference HTML page,
// which loads the standalone Scalar bundle and points it at our spec URL.
const reference = ApiReference({
  url: "/api/openapi.json",
  theme: "purple",
  metaData: { title: "MediLink Internal API Docs" },
  // Pre-fill the Try-it-out server so requests hit this backend origin.
  // Authorize (Bearer) is provided by the spec's securitySchemes.
});

export async function GET(req: NextRequest) {
  const denied = await denyDocsAccess(req);
  if (denied) return denied;
  return reference();
}
