import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const CODE_COUNT = 10;
const SALT_ROUNDS = 12;

function generatePlainCode(): string {
  // Format: XXXX-XXXX-XXXX (12 hex chars, grouped for readability)
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    // Only generate if 2FA is actually enabled
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedFactor = factors?.totp?.some((f) => f.status === "verified");
    if (!hasVerifiedFactor) {
      return NextResponse.json(
        { success: false, error: "2FA must be enabled before generating recovery codes." },
        { status: 403 }
      );
    }

    // Generate 10 plain codes
    const plainCodes: string[] = Array.from({ length: CODE_COUNT }, generatePlainCode);

    // Hash each code with bcrypt
    const hashed = await Promise.all(
      plainCodes.map((c) => bcrypt.hash(c, SALT_ROUNDS))
    );

    // Delete any existing codes for this user, then insert fresh set
    await supabase
      .from("two_factor_recovery_codes")
      .delete()
      .eq("user_id", user.id);

    const rows = hashed.map((code_hash) => ({
      user_id: user.id,
      code_hash,
    }));

    const { error } = await supabase
      .from("two_factor_recovery_codes")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to save recovery codes." },
        { status: 500 }
      );
    }

    // Return plain codes ONCE — never stored, never retrievable again
    return NextResponse.json({ success: true, codes: plainCodes });
  } catch (err: any) {
    console.error("Recovery code generation error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
