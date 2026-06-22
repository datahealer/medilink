import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    const body = await req.json().catch(() => ({}));
    const { code } = body;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: "Your current 6-digit authenticator code is required to disable 2FA." },
        { status: 400 }
      );
    }

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      return NextResponse.json(
        { success: false, error: "Failed to retrieve 2FA factors." },
        { status: 400 }
      );
    }

    const totpFactors = factors?.totp ?? [];
    if (totpFactors.length === 0) {
      return NextResponse.json(
        { success: false, error: "No 2FA factor enrolled." },
        { status: 400 }
      );
    }

    // S-3 fix: verify the TOTP code before allowing unenroll
    const factorId = totpFactors[0].id;
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr || !challenge) {
      return NextResponse.json(
        { success: false, error: "Could not create verification challenge." },
        { status: 400 }
      );
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) {
      return NextResponse.json(
        { success: false, error: "Invalid authenticator code. 2FA was not disabled." },
        { status: 403 }
      );
    }

    // TOTP verified — safe to unenroll all factors
    for (const factor of totpFactors) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        return NextResponse.json(
          { success: false, error: "Failed to unenroll 2FA factor." },
          { status: 400 }
        );
      }
    }

    // M-2 fix: sync profiles.two_factor_enabled flag
    await supabase
      .from("profiles")
      .update({ two_factor_enabled: false })
      .eq("id", user.id);

    // Clean up recovery codes — they're tied to the old TOTP setup
    await supabase
      .from("two_factor_recovery_codes")
      .delete()
      .eq("user_id", user.id);

    return NextResponse.json({ success: true, message: "2FA disabled successfully." });
  } catch (err: any) {
    const authRes = authErrorResponse(err, "success");
    if (authRes) return authRes;
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
