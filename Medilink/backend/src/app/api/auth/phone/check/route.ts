import { NextRequest, NextResponse } from "next/server";

import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { getClientIp, logAudit } from "@/lib/audit/logAudit";
import { checkVerification } from "@/lib/twilio/verify";
import { phoneLast4 } from "@/lib/twilio/verifyConfig";
import { normalisePhone, phoneOwnedByAnotherUser } from "@/lib/twilio/phoneLink";

/**
 * POST /api/auth/phone/check — verify the SMS code and LINK the number to the caller.
 *
 * ── THE WHOLE POINT OF THIS ROUTE ──
 *
 * Step 3 below is why phone linking is server-side at all:
 *
 *     admin.updateUserById(user.id, { phone, phone_confirm: true })
 *
 * That writes `auth.users.phone` DIRECTLY, ATOMICALLY, for an EXPLICIT user id, and stamps
 * `phone_confirmed_at`. It never touches `auth.users.phone_change`, so GoTrue's
 * "resolve the user by searching phone_change" path — the one that can confirm a number
 * onto the wrong account when an earlier attempt was abandoned — is never entered.
 *
 * The account is taken from the SESSION, never the body. There is no `userId` field, so
 * the only account this route can ever modify is the caller's own.
 *
 * Body: { phone: string, code: string }
 * Auth: Bearer (patient session).
 * Never returns: the code, the Twilio body, or any credential.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (profile.role !== "patient") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };

    const parsed = normalisePhone(body.phone);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Enter a valid mobile number.", reason: parsed.reason }, { status: 400 });
    }
    const phone = parsed.phone;

    // Digits only, exactly 6 — matching the Verify service and the 6-cell OtpInput.
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (code.length !== 6) {
      return NextResponse.json({ error: "Valid 6-digit code required", reason: "invalid_code" }, { status: 400 });
    }

    const service = createServiceSupabase();

    // Re-checked here as well as in `start`. Ownership can change between the two calls,
    // and this narrows the window — though the UNIQUE constraint below is what actually
    // closes it.
    if (await phoneOwnedByAnotherUser(service, phone, user.id)) {
      return NextResponse.json(
        { error: "That number is already linked to another account.", reason: "already_linked" },
        { status: 409 }
      );
    }

    // 1. Ask Twilio. `approved` is the ONLY success — `pending` means a wrong code.
    const result = await checkVerification(phone, code);
    if (!result.ok) {
      const status =
        result.reason === "not_configured" ? 503 : result.reason === "rate_limited" ? 429 : 400;
      return NextResponse.json({ error: "Invalid or expired code.", reason: result.reason }, { status });
    }

    // 2. Link it. `phone_confirm: true` marks it verified in the same write, so there is no
    //    window in which the number is attached but unconfirmed.
    const { error: linkErr } = await service.auth.admin.updateUserById(user.id, {
      phone,
      phone_confirm: true,
    });

    if (linkErr) {
      // The UNIQUE constraint on auth.users.phone firing here is the authoritative
      // duplicate guarantee — it means another account claimed the number between the
      // pre-flight and now. Reported as a conflict, not a server fault.
      const message = String(linkErr.message ?? "").toLowerCase();
      if (message.includes("duplicate") || message.includes("already") || message.includes("unique")) {
        return NextResponse.json(
          { error: "That number is already linked to another account.", reason: "already_linked" },
          { status: 409 }
        );
      }
      console.error("[auth/phone/check] admin link failed");
      return NextResponse.json({ error: "Could not link the number." }, { status: 500 });
    }

    // 3. Mirror into `profiles`, which is what RLS and every clinic-facing screen read.
    //    `auth.users.phone_confirmed_at` remains the source of truth; this keeps the mirror
    //    from drifting. Best-effort: the number IS verified at this point whatever the
    //    mirror says, and failing the request would invite a pointless re-send.
    const { error: mirrorErr } = await service
      .from("profiles")
      .update({ phone, phone_verified: true })
      .eq("id", user.id);
    if (mirrorErr) console.error("[auth/phone/check] profile mirror failed for", user.id);

    await logAudit({
      actor_user_id: user.id,
      actor_role: profile.role,
      action: "phone_verified",
      resource_type: "profile",
      resource_id: user.id,
      actor_ip: getClientIp(req),
      metadata: { phone: phoneLast4(phone) },
    });

    return NextResponse.json({ ok: true, phone, confirmed: true });
  } catch (err: unknown) {
    const authRes = authErrorResponse(err, "error");
    if (authRes) return authRes;
    console.error("[auth/phone/check] failed");
    return NextResponse.json({ error: "Could not verify the code." }, { status: 500 });
  }
}
