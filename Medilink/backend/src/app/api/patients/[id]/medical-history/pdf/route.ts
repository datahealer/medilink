import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { serverErrorResponse } from "@/lib/http/serverError";
import { env } from "@/lib/env";

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

    /**
     * ── DOCTOR AND FACILITY_ADMIN MUST BE SCOPED TO THE PATIENT ──
     *
     * Previously `patient` and `technician` were scoped but `doctor`, `facility_admin` and
     * `super_admin` fell straight through to the invoke with whatever `patient_id` was in the
     * URL. Any doctor could therefore pull the complete medical history of any patient in the
     * system, including patients they had never treated, and any facility_admin likewise.
     * `super_admin` remains unscoped, which is deliberate — it is a global role by design.
     *
     * The membership lookup uses the caller's own RLS client (reading your own row is a
     * normal self-read), but the appointment existence check uses the SERVICE client on
     * purpose: `appointments` currently carries a permissive `USING (true)` SELECT policy, and
     * when that is removed this authorization check must not silently start failing. Identity
     * still comes only from the verified `user.id` — never from the request.
     */
    const serviceSupabase = createServiceSupabase();

    if (role === "doctor") {
      const { data: doctorRow } = await authSupabase
        .from("doctors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!doctorRow) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: treated } = await serviceSupabase
        .from("appointments")
        .select("id")
        .eq("patient_id", id)
        .eq("doctor_id", doctorRow.id)
        .limit(1)
        .maybeSingle();

      if (!treated) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (role === "facility_admin") {
      const { data: grants } = await authSupabase
        .from("facility_admins")
        .select("facility_id")
        .eq("user_id", user.id)
        .is("revoked_at", null);

      const facilityIds = (grants ?? [])
        .map((g) => g.facility_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0);

      if (!facilityIds.length) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: atFacility } = await serviceSupabase
        .from("appointments")
        .select("id")
        .eq("patient_id", id)
        .in("facility_id", facilityIds)
        .limit(1)
        .maybeSingle();

      if (!atFacility) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Invoke edge function ──
    const { data, error } = await serviceSupabase.functions.invoke("generate-patient-report", {
      body: { patient_id: id, created_by: user.id },
      /**
       * Explicit, not implicit. The function now refuses any caller that does not present the
       * service role credential (see supabase/functions/_shared/internalAuth.ts). supabase-js
       * does fall back to the client key when there is no session, but relying on that would
       * make a security boundary depend on library internals — and on this client never
       * acquiring a session. Sending it here states the contract at the call site.
       */
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });

    if (error) {
      // Logged in full server-side; the message itself is the Edge Function's internal detail
      // and is deliberately not returned. It previously was, as a `detail` field.
      console.error("generate-patient-report error:", error);
      return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
    }

    return NextResponse.json({ url: data.url });

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("medical-history/pdf error:", err.message);
    return serverErrorResponse(err, "patients/[id]/medical-history/pdf");
  }
}
