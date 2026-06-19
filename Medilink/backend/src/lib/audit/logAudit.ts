import { createServiceSupabase } from "@/lib/supabase/service";
import { NextRequest } from "next/server";

/**
 * Extract real client IP from a Next.js request (proxy-aware).
 */
export function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

/**
 * Log a non-DB-write audit event (login, logout, document access,
 * external integrations, edge function calls).
 *
 * Uses the service-role client so RLS is bypassed and the insert
 * always succeeds regardless of the caller's session.
 *
 * Failures are caught and logged to console — never throws.
 */
export async function logAudit({
  actor_user_id,
  actor_role,
  action,
  resource_type,
  resource_id = null,
  actor_ip = null,
  before = null,
  after = null,
  metadata = {},
}: {
  actor_user_id: string;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  actor_ip?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await createServiceSupabase()
      .from("audit_logs")
      .insert({
        actor_user_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        actor_ip,
        before,
        after,
        metadata,
      } as any);

    if (error) {
      console.error("[AuditLog] Insert failed:", error.message, error.details, error.hint);
    }
  } catch (err) {
    console.error("[AuditLog] Unexpected error:", err);
  }
}
