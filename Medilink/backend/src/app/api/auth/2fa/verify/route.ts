import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

// In-memory rate limiter: max 5 attempts per user per 5-minute window.
// Replace with Redis/Upstash for multi-instance deployments.
const attemptMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 5 * 60 * 1000;
  const entry = attemptMap.get(userId);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(userId, { count: 1, resetAt: now + window });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count += 1;
  return true;
}

function clearRateLimit(userId: string) {
  attemptMap.delete(userId);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);

    // S-4 fix: assert session exists before touching MFA
    const user = await getUserOrThrow(supabase);

    // S-1 fix: rate limit — 5 attempts per user per 5 minutes
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { success: false, error: "Too many verification attempts. Please wait 5 minutes." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { factorId, challengeId, code } = body;

    if (!factorId || !challengeId || !code) {
      return NextResponse.json(
        { success: false, error: "factorId, challengeId and code are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      // S-7 fix: generic message, not raw Supabase internals
      return NextResponse.json(
        { success: false, error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    clearRateLimit(user.id);

    // M-2 fix: sync profiles.two_factor_enabled flag
    await supabase
      .from("profiles")
      .update({ two_factor_enabled: true })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      data: { user: data.user },
      message: "MFA verified successfully",
    });
  } catch (err: any) {
    const authRes = authErrorResponse(err, "success");
    if (authRes) return authRes;
    console.error("MFA verify error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
