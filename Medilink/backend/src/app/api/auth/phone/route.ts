import { NextRequest, NextResponse } from "next/server";

import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

/**
 * GET /api/auth/phone — the caller's REAL phone-confirmation state.
 *
 * Reads `auth.users` (via the caller's own session, so no service role is involved and no
 * other account is reachable) rather than `profiles.phone_verified`.
 *
 * That distinction matters. `profiles.phone_verified` is a MIRROR, and it can lie in one
 * specific historical direction: the retired `POST /api/auth/auth/verify-otp` route set it
 * to `true` after checking a code from `otp_records` — and that code was never actually
 * delivered, because no SMS provider was ever wired. Any row verified through that path
 * claims a verification that never happened. `auth.users.phone_confirmed_at` is only ever
 * stamped by GoTrue or by our Admin-API link, so it is the trustworthy signal.
 *
 * Auth: Bearer (any signed-in user).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    const raw = user as typeof user & { phone_confirmed_at?: string | null };
    const phone = raw.phone ? `+${String(raw.phone).replace(/^\+/, "")}` : null;

    return NextResponse.json({
      phone,
      confirmed: !!raw.phone_confirmed_at,
    });
  } catch (err: unknown) {
    const authRes = authErrorResponse(err, "error");
    if (authRes) return authRes;
    console.error("[auth/phone] status read failed");
    return NextResponse.json({ error: "Could not read phone status." }, { status: 500 });
  }
}
