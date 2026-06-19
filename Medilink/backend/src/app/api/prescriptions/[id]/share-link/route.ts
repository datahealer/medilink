import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    const service = createServiceSupabase();

    const { data: prescription, error } = await service
      .from("prescriptions")
      .select("id, patient_id, doctor_id, share_token, share_token_expires_at")
      .eq("id", id)
      .single();

    if (error || !prescription) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (role === "patient") {
      const { data: pp } = await service
        .from("patient_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!pp || pp.id !== prescription.patient_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (role === "doctor") {
      const { data: doctor } = await service
        .from("doctors")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!doctor || doctor.id !== prescription.doctor_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!["facility_admin", "super_admin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();

    // Reuse existing token if still valid
    if (
      prescription.share_token &&
      prescription.share_token_expires_at &&
      new Date(prescription.share_token_expires_at) > now
    ) {
      return NextResponse.json({
        url: `/prescription/${prescription.share_token}`,
        expires_at: prescription.share_token_expires_at,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await service
      .from("prescriptions")
      .update({ share_token: token, share_token_expires_at: expiresAt })
      .eq("id", id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      url: `/prescription/${token}`,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
