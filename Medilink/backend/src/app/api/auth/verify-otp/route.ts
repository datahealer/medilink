import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";

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

  const body = await req.json().catch(() => ({}));
  const { code } = body;

  if (!code || typeof code !== "string" || code.length !== 6) {
    return NextResponse.json({ error: "Valid 6-digit code required" }, { status: 400 });
  }

  // Mirror send-otp phone resolution: profile.phone wins, else fallback to body
  let phone: string | null = profile.phone ?? null;
  if (!phone) {
    phone = body.phone ?? null;
    if (!phone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }
  }

  const { data: record } = await supabase
    .from("otp_records")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!record) {
    return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
  }

  if (record.attempts >= 5) {
    return NextResponse.json({ error: "Too many attempts. Request a new OTP." }, { status: 429 });
  }

  // TODO: compare against hashed value once hashing is implemented
  if (record.hash !== code) {
    await supabase
      .from("otp_records")
      .update({ attempts: record.attempts + 1 })
      .eq("user_id", user.id);

    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  await supabase
    .from("profiles")
    .update({ phone, phone_verified: true })
    .eq("id", user.id);

  await supabase.auth.updateUser({ data: { phone_verified: true } });

  await supabase.from("otp_records").delete().eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
