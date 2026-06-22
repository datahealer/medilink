import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

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
      .select("id, patient_id, doctor_id, pdf_url")
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

    if (!prescription.pdf_url) {
      return NextResponse.json({ error: "PDF not yet generated" }, { status: 404 });
    }

    const { data: signed, error: signErr } = await service.storage
      .from("prescriptions")
      .createSignedUrl(prescription.pdf_url, 3600);

    if (signErr || !signed) {
      throw signErr ?? new Error("Failed to create signed URL");
    }

    return NextResponse.json({ signed_url: signed.signedUrl });
  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
