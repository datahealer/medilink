import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { logAudit, getClientIp } from "@/lib/audit/logAudit";

/**
 * POST /api/auth/session-log
 * Called by the client after a successful login (SIGNED_IN auth event).
 * Logs the login action — cannot be captured by a DB trigger since
 * login is a Supabase Auth event, not a table write.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    await logAudit({
      actor_user_id: user.id,
      actor_role: profile?.role ?? null,
      action: "login",
      resource_type: "auth",
      actor_ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch {
    // Non-fatal — never surface audit errors to the client
    return NextResponse.json({ success: true });
  }
}
