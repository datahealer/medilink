import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import bcrypt from "bcryptjs";

// Rate limit: 5 attempts per user per 10 minutes
const attemptMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const entry = attemptMap.get(userId);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(userId, { count: 1, resetAt: now + window });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait 10 minutes." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { recoveryCode } = body;

    if (!recoveryCode || typeof recoveryCode !== "string") {
      return NextResponse.json(
        { success: false, error: "Recovery code is required." },
        { status: 400 }
      );
    }

    // Fetch all unused recovery codes for this user
    const { data: rows, error: fetchErr } = await supabase
      .from("two_factor_recovery_codes")
      .select("id, code_hash")
      .eq("user_id", user.id)
      .is("used_at", null);

    if (fetchErr || !rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid recovery codes found." },
        { status: 400 }
      );
    }

    // bcrypt.compare against each stored hash (codes are short enough that serial is fine)
    let matchedId: string | null = null;
    for (const row of rows) {
      const match = await bcrypt.compare(recoveryCode.trim(), row.code_hash);
      if (match) {
        matchedId = row.id;
        break;
      }
    }

    if (!matchedId) {
      return NextResponse.json(
        { success: false, error: "Invalid recovery code." },
        { status: 400 }
      );
    }

    // Mark this specific code as used (one-time use)
    await supabase
      .from("two_factor_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", matchedId);

    // Recovery code accepted. Supabase does not expose an API to manually
    // elevate a session from AAL1 to AAL2 via recovery code, so this session
    // stays at AAL1. The /mfa-verify page and middleware treat this path as
    // exempt (/api/auth is in AAL2_EXEMPT_PREFIXES), and the frontend redirects
    // the user to the dashboard after this call succeeds.
    return NextResponse.json({
      success: true,
      message: "Recovery code accepted. You are now logged in.",
    });
  } catch (err: any) {
    console.error("Recovery code use error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
