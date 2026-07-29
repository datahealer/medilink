import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/patients/me/queue-status
 *
 * Live queue state for the calling patient. The single read surface MediLink
 * consumes; there is no patient-facing equivalent of the staff queue list.
 *
 * Query params:
 *   appointment_id (optional) — scope to one appointment. Omit to let the
 *   server pick the most relevant one (called > waiting > done in last 2h).
 *
 * All logic lives in public.get_my_queue_position(). This handler deliberately
 * contains no SQL: people_ahead / ETA / ordering must have exactly one
 * implementation so HAMS and MediLink cannot drift apart.
 *
 * Called with the caller's own client, never the service client — the RPC
 * derives ownership from auth.uid(), which is NULL under service role.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);

    // Establishes identity and throws 401/2FA before any data work. The RPC
    // re-derives the caller from auth.uid(), so the returned user is not needed.
    await getAal2UserOrThrow(supabase);

    const appointmentId = new URL(req.url).searchParams.get("appointment_id");

    if (appointmentId && !isUuid(appointmentId)) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "appointment_id must be a UUID" } },
        { status: 400 }
      );
    }

    // Cast: get_my_queue_position ships in 20260728000004 and is not yet in
    // src/types/supabase.ts. Regenerate types after the migration is applied
    // (`supabase gen types typescript --linked`) and the cast can go.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_my_queue_position", {
      p_appointment_id: appointmentId,
    });

    if (error) {
      console.error("GET /patients/me/queue-status rpc error:", error);
      return NextResponse.json(
        { success: false, error: { code: "server_error", message: error.message } },
        { status: 500 }
      );
    }

    const result = data as Record<string, unknown> | null;

    if (!result || result.found !== true) {
      const reason = (result?.reason as string) ?? "not_in_queue";

      // 'forbidden' is returned for both "someone else's appointment" and
      // "no such appointment", so the status code leaks nothing either way.
      const status = reason === "forbidden" ? 403 : reason === "unauthenticated" ? 401 : 404;

      return NextResponse.json(
        { success: false, error: { code: reason, message: REASONS[reason] ?? "Not in queue" } },
        { status }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message === "2FA verification required" ? 403 : 500;
    return NextResponse.json(
      { success: false, error: { code: status === 500 ? "server_error" : "unauthorized", message } },
      { status }
    );
  }
}

const REASONS: Record<string, string> = {
  unauthenticated: "Sign in required",
  forbidden: "You cannot view this appointment",
  not_in_queue: "You are not currently in a queue",
  not_checked_in: "This appointment has not been checked in yet",
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
