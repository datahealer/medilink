/**
 * Access gate for the internal API docs (`/api/docs`, `/api/openapi.json`).
 *
 * Rules (in order):
 *   1. If `ENABLE_API_DOCS` !== "true"  → docs are OFF everywhere → 404.
 *   2. In production (`NODE_ENV === "production"`) the docs are exposed ONLY to an
 *      authenticated internal admin (super_admin / facility_admin). Everyone else → 404.
 *   3. In development / staging (any non-production env) → allowed once the flag is on.
 *
 * Returning a 404 (not 403) so the existence of the docs is not leaked in production.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";

const STAFF_ROLES = ["super_admin", "facility_admin"];

/** The shared 404 used whenever access is denied. */
export function notFound(): NextResponse {
  return new NextResponse("Not found", { status: 404 });
}

/**
 * Returns `null` when access is allowed, or a ready 404 `NextResponse` when denied.
 */
export async function denyDocsAccess(req: NextRequest): Promise<NextResponse | null> {
  // 1. Hard flag gate — off by default.
  if (process.env.ENABLE_API_DOCS !== "true") return notFound();

  // 2. Non-production: flag is enough.
  if (process.env.NODE_ENV !== "production") return null;

  // 3. Production: require an authenticated internal admin.
  try {
    const supabase = await createApiSupabaseClient(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return notFound();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.role || !STAFF_ROLES.includes(profile.role)) return notFound();
    return null;
  } catch {
    return notFound();
  }
}
