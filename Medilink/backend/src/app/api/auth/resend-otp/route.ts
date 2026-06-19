import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";

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

    // 🧹 delete old OTP before inserting (UNIQUE constraint on user_id)
    await supabase.from("otp_records").delete().eq("user_id", user.id);

    // ⚠️ In production → hash this instead of storing plain code
    const { error } = await supabase.from("otp_records").insert([
      {
        user_id: user.id,
        hash: code,
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
      // ⚠️ Remove this in production (only for testing)
      otp: code,
    });

  } catch (err: any) {
    console.error("OTP send error:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}