import { NextRequest, NextResponse } from "next/server";

import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { getClientIp, logAudit } from "@/lib/audit/logAudit";
import { startVerification } from "@/lib/twilio/verify";
import { phoneLast4 } from "@/lib/twilio/verifyConfig";
import {
  PER_PHONE_SENDS,
  PER_USER_SENDS,
  normalisePhone,
  phoneOwnedByAnotherUser,
  withinLimit,
} from "@/lib/twilio/phoneLink";

/**
 * POST /api/auth/phone/start — send (or re-send) an SMS code to link a phone number.
 *
 * ── WHY LINKING IS A BACKEND ROUTE AT ALL ──
 *
 * The obvious client-side approach, `supabase.auth.updateUser({ phone })` followed by
 * `verifyOtp({ type: "phone_change" })`, is unsafe. It stages the number in
 * `auth.users.phone_change`, a column WITHOUT a uniqueness constraint, and at verification
 * GoTrue resolves the user by SEARCHING that column rather than by the session — so an
 * abandoned attempt by one account can cause the number to be confirmed onto it when its
 * real owner verifies. Supabase documents this ("Phone linked to incorrect user ID") and
 * states there is no client-side workaround. In an app holding PHI that is not acceptable,
 * so verification happens here and the link is written with the Admin API in `../check`.
 *
 * ── THE ACCOUNT IS NEVER TAKEN FROM THE REQUEST ──
 *
 * There is no `userId` field in the body, and there never may be. The account is derived
 * from the caller's own session token via `getUserOrThrow`, which makes linking a number to
 * someone else's account structurally impossible rather than merely forbidden.
 *
 * Body: { phone: string }   → E.164 or local; normalised server-side regardless.
 * Auth: Bearer (patient session).
 * Never returns: the code, the Twilio body, or any credential.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    // Role gate — mirrors the retired verify-otp route. Staff phone numbers are managed by
    // HAMS, not by this app.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (profile.role !== "patient") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
    const parsed = normalisePhone(body.phone);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          error:
            parsed.reason === "unsupported_country"
              ? "That country is not supported yet."
              : "Enter a valid mobile number.",
          reason: parsed.reason,
        },
        { status: 400 }
      );
    }
    const phone = parsed.phone;

    // Rate limits BEFORE any spend. Per-user stops an account being used as an SMS pump;
    // per-phone stops many accounts being aimed at one victim's handset.
    if (!withinLimit(`user:${user.id}`, PER_USER_SENDS)) {
      return NextResponse.json({ error: "Too many attempts. Try again later.", reason: "rate_limited" }, { status: 429 });
    }
    if (!withinLimit(`phone:${phone}`, PER_PHONE_SENDS)) {
      return NextResponse.json({ error: "Too many attempts. Try again later.", reason: "rate_limited" }, { status: 429 });
    }

    // Pre-flight only — the UNIQUE constraint on auth.users.phone is the real guarantee and
    // is enforced atomically in ../check. This refusal exists to give a comprehensible
    // message and to avoid paying for an SMS that could never complete.
    const service = createServiceSupabase();
    if (await phoneOwnedByAnotherUser(service, phone, user.id)) {
      return NextResponse.json(
        { error: "That number is already linked to another account.", reason: "already_linked" },
        { status: 409 }
      );
    }

    const result = await startVerification(phone);
    if (!result.ok) {
      const status = result.reason === "rate_limited" ? 429 : result.reason === "not_configured" ? 503 : 400;
      return NextResponse.json({ error: "Could not send the code.", reason: result.reason }, { status });
    }

    await logAudit({
      actor_user_id: user.id,
      actor_role: profile.role,
      action: "phone_verification_sent",
      resource_type: "profile",
      resource_id: user.id,
      actor_ip: getClientIp(req),
      // Last 4 only. The number is already on the profile row for anyone authorised to see
      // it; the audit trail needs to record THAT this happened, not to republish it.
      metadata: { phone: phoneLast4(phone) },
    });

    return NextResponse.json({ ok: true, status: result.status ?? "pending" });
  } catch (err: unknown) {
    const authRes = authErrorResponse(err, "error");
    if (authRes) return authRes;
    // Generic body: a provider message could echo request detail, and the client has
    // nothing actionable to do with it beyond "try again".
    console.error("[auth/phone/start] failed");
    return NextResponse.json({ error: "Could not send the code." }, { status: 500 });
  }
}
