import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const authSupabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(authSupabase);

    // ── Role check ──
    const { data: profile } = await authSupabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;

    if (!role || !["patient", "doctor", "facility_admin", "super_admin", "technician"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Patient can only access their own record ──
    if (role === "patient") {
      const { data: patientProfile } = await authSupabase
        .from("patient_profiles")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!patientProfile) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Technician role access check ──
    if (role === "technician") {
      const { data: techProfile, error: techErr } = await authSupabase
        .from("technicians")
        .select("facility_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (techErr || !techProfile?.facility_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: canAccess, error: accessErr } = await authSupabase
        .from("lab_results")
        .select("id")
        .eq("patient_id", id)
        .eq("facility_id", techProfile.facility_id)
        .limit(1)
        .maybeSingle();

      if (accessErr || !canAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Invoke edge function ──
    const serviceSupabase = createServiceSupabase();

    const { data, error } = await serviceSupabase.functions.invoke("generate-patient-report", {
      body: { patient_id: id, created_by: user.id },
    });

    if (error) {
      console.error("generate-patient-report error:", error);
      const detail =
        typeof error === "object" && error !== null
          ? (error as { message?: string }).message ?? JSON.stringify(error)
          : String(error);

      return NextResponse.json(
        { error: "Report generation failed", detail },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.url });

  } catch (err: any) {
    console.error("medical-history/pdf error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
