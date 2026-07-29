import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

/* ================= POST (SEND OTP) ================= */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    const body = await req.json();
    const { phone } = body;

    // ✅ Optional validation
    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone is required" },
        { status: 400 }
      );
    }

    // ✅ Generate OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Rate-limit: reject a re-issue inside the cooldown window (anti-abuse guard).
    // 20s stays below the clients' resend countdowns (web 60s, mobile 24s).
    const OTP_COOLDOWN_MS = 20_000;
    const { data: existingOtp } = await supabase
      .from("otp_records")
      .select("created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      existingOtp?.created_at &&
      Date.now() - new Date(existingOtp.created_at).getTime() < OTP_COOLDOWN_MS
    ) {
      return NextResponse.json(
        { success: false, error: "Please wait a few seconds before requesting another code." },
        { status: 429 }
      );
    }

    // 🧹 delete old OTP before inserting (UNIQUE constraint on user_id)
    await supabase.from("otp_records").delete().eq("user_id", user.id);

    // Store a bcrypt hash of the OTP — never the plaintext code.
    const hashedCode = await bcrypt.hash(code, 10);
    const { error } = await supabase.from("otp_records").insert([
      {
        user_id: user.id,
        hash: hashedCode,
        expires_at: expiresAt,
        attempts: 0,
      },
    ]);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (err: any) {
    const authRes = authErrorResponse(err, "success");
    if (authRes) return authRes;
    console.error("OTP send error:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}