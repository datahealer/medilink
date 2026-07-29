import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createApiSupabaseClient } from "@/lib/supabase/api";
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

  // Rate-limit: reject a re-issue inside the cooldown window (anti-abuse / SMS-bomb guard).
  // 20s stays below the clients' resend countdowns (web 60s, mobile 24s), so legitimate
  // resends pass while rapid programmatic calls are blocked.
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
      { error: "Please wait a few seconds before requesting another code." },
      { status: 429 }
    );
  }

  // Delete any existing OTP (UNIQUE constraint on user_id)
  await supabase.from("otp_records").delete().eq("user_id", user.id);

  // Store a bcrypt hash of the OTP — never the plaintext code.
  const hashedCode = await bcrypt.hash(code, 10);
  const { error: insertError } = await supabase.from("otp_records").insert({
    user_id: user.id,
    hash: hashedCode,
    expires_at: expiresAt,
    attempts: 0,
  });

  if (insertError) {
    return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
  }

  // NOTE: OTP delivery (SMS) is not wired yet — no provider is configured. Until a
  // provider is chosen (deferred task T5), the generated code is stored but not sent,
  // so the phone-verification step cannot be completed. The code is never returned to
  // the client.

  return NextResponse.json({ success: true });
}
