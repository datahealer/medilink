import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit/logAudit";

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const body = await req.json();
    if (body?.confirmation !== "DELETE") {
      return NextResponse.json(
        { error: 'Type "DELETE" to confirm account deletion.' },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .single();

    if (["doctor", "facility_admin", "super_admin"].includes(profile?.role ?? "")) {
      return NextResponse.json(
        { error: "Account deletion must be requested through your administrator." },
        { status: 403 }
      );
    }

    if (profile?.status === "deletion_pending") {
      return NextResponse.json(
        { error: "Account deletion is already pending." },
        { status: 409 }
      );
    }

    const deletesAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const serviceClient = createServiceSupabase();

    // Soft-delete: mark profile as deletion_pending
    const { error: updateErr } = await serviceClient
      .from("profiles")
      .update({
        status: "deletion_pending",
        deletion_requested_at: new Date().toISOString(),
      } as any)
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Cancel active appointments — need patient_profile.id first
    const { data: pp } = await serviceClient
      .from("patient_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (pp?.id) {
      await serviceClient
        .from("appointments")
        .update({
          status: "cancelled",
          cancellation_reason: "account_deletion",
          cancelled_by: user.id,
        } as any)
        .eq("patient_id", pp.id)
        .in("status", ["pending", "confirmed"]);
    }

    await logAudit({
      action: "account_deletion_requested",
      actor_user_id: user.id,
      actor_role: profile?.role ?? null,
      resource_type: "profile",
      resource_id: user.id,
    });

    return NextResponse.json({ status: "deletion_pending", deletes_at: deletesAt });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
