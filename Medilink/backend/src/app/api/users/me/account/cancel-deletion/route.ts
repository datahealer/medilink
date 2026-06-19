import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit/logAudit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .single();

    if (profile?.status !== "deletion_pending") {
      return NextResponse.json(
        { error: "No pending deletion request found." },
        { status: 400 }
      );
    }

    const serviceClient = createServiceSupabase();

    const { error: updateErr } = await serviceClient
      .from("profiles")
      .update({
        status: "active",
        deletion_requested_at: null,
      } as any)
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await logAudit({
      action: "account_deletion_cancelled",
      actor_user_id: user.id,
      actor_role: profile?.role ?? null,
      resource_type: "profile",
      resource_id: user.id,
    });

    return NextResponse.json({ status: "active" });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
