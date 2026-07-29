/**
 * GET /api/openapi.json — the complete OpenAPI 3.1 spec for the MediLink internal API.
 *
 * Gated by `denyDocsAccess` (ENABLE_API_DOCS flag; prod requires an internal admin).
 */
import { NextResponse, type NextRequest } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi/spec";
import { denyDocsAccess } from "@/lib/openapi/access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await denyDocsAccess(req);
  if (denied) return denied;

  return NextResponse.json(buildOpenApiSpec(), {
    headers: { "Cache-Control": "no-store" },
  });
}
