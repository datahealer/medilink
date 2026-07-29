import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { logAudit } from "@/lib/audit/logAudit";

export const dynamic = "force-dynamic";

type Kind = "seen" | "on_my_way";
const KINDS: Kind[] = ["seen", "on_my_way"];

/**
 * POST /api/patients/me/queue-status/acknowledge
 *
 * Patient confirms a queue call:
 *   kind = "seen"       -> "I've seen the call"
 *   kind = "on_my_way"  -> "I'm on my way"
 *
 * Body (all optional):
 *   { "appointment_id": "<uuid>", "kind": "seen" | "on_my_way" }
 *
 * Omitting appointment_id acknowledges the caller's current active queue item
 * (called first, else earliest waiting) — the common case for a patient
 * tapping a notification.
 *
 * Authorisation is enforced inside public.acknowledge_queue_call() via
 * auth.uid(), so this must run on the caller's client, never the service
 * client (auth.uid() is NULL under service role). Patients hold no UPDATE
 * privilege on queue_items; the SECURITY DEFINER RPC writes exactly the two
 * acknowledgement columns.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const body = await readJson(req);
    const appointmentId = (body.appointment_id as string | undefined) ?? null;
    const kind = (body.kind as string | undefined) ?? "seen";

    if (appointmentId !== null && !isUuid(appointmentId)) {
      return fail(400, "validation_error", "appointment_id must be a UUID");
    }

    if (!KINDS.includes(kind as Kind)) {
      return fail(400, "invalid_kind", `kind must be one of: ${KINDS.join(", ")}`);
    }

    // Cast: acknowledge_queue_call ships in 20260728000005 and is not yet in
    // src/types/supabase.ts. Regenerate types after applying the migration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("acknowledge_queue_call", {
      p_appointment_id: appointmentId,
      p_kind: kind,
    });

    if (error) {
      console.error("POST /patients/me/queue-status/acknowledge rpc error:", error);
      return fail(500, "server_error", error.message);
    }

    const result = data as Record<string, unknown> | null;

    if (!result || result.success !== true) {
      const reason = (result?.reason as string) ?? "not_in_active_queue";
      const status =
        reason === "forbidden" ? 403 : reason === "unauthenticated" ? 401 : reason === "invalid_kind" ? 400 : 409;
      return fail(status, reason, REASONS[reason] ?? "Could not acknowledge");
    }

    // Audit only the first acknowledgement — repeat taps are noise, and
    // audit_logs is already the largest table in the database.
    if (result.first_acknowledgement === true) {
      await logAudit({
        action: "queue_call_acknowledged",
        actor_user_id: user.id,
        actor_role: "patient",
        resource_type: "queue_item",
        resource_id: result.queue_item_id as string,
        metadata: { kind, source: "patient" },
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message === "Unauthorized") return fail(401, "unauthorized", message);
    if (message === "2FA verification required") return fail(403, "forbidden", message);
    return fail(500, "server_error", message);
  }
}

const REASONS: Record<string, string> = {
  unauthenticated: "Sign in required",
  forbidden: "You cannot acknowledge this appointment",
  invalid_kind: "kind must be 'seen' or 'on_my_way'",
  not_in_active_queue: "You have no active queue entry to acknowledge",
};

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Empty body is valid: acknowledge the current queue item as "seen".
    return {};
  }
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
