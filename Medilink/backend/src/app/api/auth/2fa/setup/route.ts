import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createAdminSupabaseClient } from "@/lib/supabase/adminClient";
import { getUserOrThrow } from "@/lib/auth/api";
import { isStaff } from "@medilink/shared";

/* ================= POST (MFA ENROLL) ================= */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    /* ── Role guard ── */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    if (!isStaff(profile.role)) {
      return NextResponse.json(
        { success: false, error: "2FA enrollment is only available for staff accounts." },
        { status: 403 }
      );
    }

    /* ── Delete ALL existing factors via admin client ──────────────────────
     * supabase.auth.mfa.unenroll() called with a user JWT requires an AAL2
     * session to remove a *verified* factor — but if the user is trying to
     * (re-)enroll, they are by definition at AAL1, which means unenroll silently
     * fails and the subsequent enroll() throws "factor already exists".
     *
     * The admin client uses the service-role key, which bypasses the AAL check
     * entirely and can delete any factor regardless of its status.
     * -------------------------------------------------------------------- */
    const adminSupabase = createAdminSupabaseClient();

    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const existingFactors = factorsData?.totp ?? [];

    for (const factor of existingFactors) {
      const { error: deleteError } = await adminSupabase.auth.admin.mfa.deleteFactor({
        userId: user.id,
        id: factor.id,
      });
      if (deleteError) {
        console.error(`Failed to delete factor ${factor.id}:`, deleteError.message);
      }
    }

    /* ── Enroll fresh TOTP factor ── */
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    // S-6: return only what the frontend needs — never expose totp.uri or the raw secret
    return NextResponse.json({
      success: true,
      data: { id: data.id, qr_code: data.totp.qr_code },
      message: "MFA enrollment started",
    });

  } catch (err: any) {
    console.error("MFA enroll error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}