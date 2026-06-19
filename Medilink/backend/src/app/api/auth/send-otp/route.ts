import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
// import { sendOtpSms } from "@/lib/sms/sendOtp";
import crypto from "crypto";

// TODO: add per-user rate limiting (e.g., max 3 OTPs per 15 min)

export async function POST(req: NextRequest) {
  const supabase = await createApiSupabaseClient(req);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, phone")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.role !== "patient") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // Smart phone: use profile.phone if set, else require it from the request body
  let phone: string | null = profile.phone ?? null;

  if (!phone) {
    const body = await req.json().catch(() => ({}));
    phone = body.phone ?? null;

    if (!phone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    if (!String(phone).startsWith("+") || String(phone).length < 10) {
      return NextResponse.json({ error: "Invalid phone number format. Use E.164 (e.g. +91XXXXXXXXXX)" }, { status: 400 });
    }
  }

  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Delete any existing OTP (UNIQUE constraint on user_id)
  await supabase.from("otp_records").delete().eq("user_id", user.id);

  // TODO: hash OTP before storing (e.g. SHA-256 with per-user salt or bcrypt)
  const { error: insertError } = await supabase.from("otp_records").insert({
    user_id: user.id,
    hash: code,
    expires_at: expiresAt,
    attempts: 0,
  });

  if (insertError) {
    return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
  }

  // await sendOtpSms(phone, code);

  return NextResponse.json({ success: true });
}
