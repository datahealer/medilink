// src/app/api/auth/set-password/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getUserOrThrow } from "@/lib/auth/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createHmac } from "crypto";

/* ─────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────── */

const SetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  /** The raw invite token — used to look up who invited this user so we
   *  can notify the super admin afterwards.  Optional: if omitted the
   *  password is still updated, but no notification is sent. */
  token: z.string().optional(),
  type: z.enum(["facility_admin", "doctor", "technician", "staff"]).optional(),
});

function hashToken(rawToken: string): string {
  if (!process.env.INVITE_SECRET) {
    throw new Error("INVITE_SECRET missing");
  }
  return createHmac("sha256", process.env.INVITE_SECRET)
    .update(rawToken)
    .digest("hex");
}

/* ─────────────────────────────────────────────
   POST  /api/auth/set-password
───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    /* ── Parse + validate body ── */
    const body = await req.json();
    const parsed = SetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { password, token, type } = parsed.data;
    const serviceSupabase = createServiceSupabase();

    // Doctor flow: token-based one-time password setup from invite email.
    if (type === "doctor" && token) {
      const tokenHash = hashToken(token);

      const { data: invite, error: inviteErr } = await serviceSupabase
        .from("invitations")
        .select("id, email, doctor_id, invite_type, status, expires_at")
        .eq("token_hash", tokenHash)
        .eq("invite_type", "doctor")
        .maybeSingle();

      if (inviteErr) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }

      if (!invite) {
        return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
      }

      // The accept step (/api/invitations/accept → accept_doctor_invite RPC) already
      // marks the invite "accepted" before redirecting here. Allow both statuses.
      if (invite.status !== "pending" && invite.status !== "accepted") {
        return NextResponse.json(
          { error: "This invitation has already been used. Please login." },
          { status: 409 }
        );
      }

      const { data: allUsers, error: usersErr } = await serviceSupabase.auth.admin.listUsers();
      if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
      }

      const matched = allUsers?.users?.find(
        (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
      );

      if (!matched) {
        return NextResponse.json({ error: "Auth account not found for this invite" }, { status: 404 });
      }

      const { error: updateErr } = await serviceSupabase.auth.admin.updateUserById(matched.id, {
        password,
        user_metadata: {
          ...(matched.user_metadata ?? {}),
          invite_pending: false,
        },
      });

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Profile role already set by accept_doctor_invite RPC; upsert ensures consistency.
      await serviceSupabase
        .from("profiles")
        .upsert(
          { id: matched.id, email: invite.email.toLowerCase(), role: "doctor" },
          { onConflict: "id" }
        );

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Technician flow: token-based, same as doctor
    if (type === "technician" && token) {
      const tokenHash = hashToken(token);

      const { data: invite, error: inviteErr } = await serviceSupabase
        .from("invitations")
        .select("id, email, invite_type, status, expires_at, facility_id")
        .eq("token_hash", tokenHash)
        .eq("invite_type", "technician")
        .maybeSingle();

      if (inviteErr) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }

      if (!invite) {
        return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
      }

      // The accept step (AcceptInvitePage → /api/invitations/accept) already marks
      // the invitation as "accepted" before redirecting here. Allow both statuses.
      if (invite.status !== "pending" && invite.status !== "accepted") {
        return NextResponse.json(
          { error: "This invitation has already been used. Please login." },
          { status: 409 }
        );
      }

      const { data: allUsers, error: usersErr } = await serviceSupabase.auth.admin.listUsers();
      if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
      }

      const matched = allUsers?.users?.find(
        (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
      );

      if (!matched) {
        return NextResponse.json({ error: "Auth account not found for this invite" }, { status: 404 });
      }

      const { error: updateErr } = await serviceSupabase.auth.admin.updateUserById(matched.id, {
        password,
        user_metadata: {
          ...(matched.user_metadata ?? {}),
          invite_pending: false,
        },
      });

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      await serviceSupabase
        .from("profiles")
        .upsert(
          { id: matched.id, email: invite.email.toLowerCase(), role: "technician" },
          { onConflict: "id" }
        );

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Staff flow: token-based, same pattern as technician
    if (type === "staff" && token) {
      const tokenHash = hashToken(token);

      const { data: invite, error: inviteErr } = await serviceSupabase
        .from("invitations")
        .select("id, email, invite_type, status, expires_at, facility_id")
        .eq("token_hash", tokenHash)
        .eq("invite_type", "staff" as any)
        .maybeSingle();

      if (inviteErr) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }

      if (!invite) {
        return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
      }

      if (invite.status !== "pending" && invite.status !== "accepted") {
        return NextResponse.json(
          { error: "This invitation has already been used. Please login." },
          { status: 409 }
        );
      }

      const { data: allUsers, error: usersErr } = await serviceSupabase.auth.admin.listUsers();
      if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
      }

      const matched = allUsers?.users?.find(
        (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
      );

      if (!matched) {
        return NextResponse.json({ error: "Auth account not found for this invite" }, { status: 404 });
      }

      const { error: updateErr } = await serviceSupabase.auth.admin.updateUserById(matched.id, {
        password,
        user_metadata: { ...(matched.user_metadata ?? {}), invite_pending: false },
      });

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      await serviceSupabase
        .from("profiles")
        .upsert(
          { id: matched.id, email: invite.email.toLowerCase(), role: "staff" },
          { onConflict: "id" }
        );

      return NextResponse.json({ success: true }, { status: 200 });
    }

    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    /* ── 1. Update the user's password via the user-scoped client ──
       supabase.auth.updateUser uses the user's own session JWT, so this
       is safe — a user can only update their own password.              */
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      console.error("[set-password] updateUser error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    /* ── 2. Strip the invite_pending flag from user metadata ── */
    await serviceSupabase.auth.admin.updateUserById(user.id, {
      user_metadata: { invite_pending: false, is_temp_password: false },
    });

    /* ── 3. Notify super admin (fire-and-forget via internal API) ──
       We call our own notification endpoint rather than doing it inline
       so that a notification failure never breaks the password-set flow. */
    if (token) {
      const internalUrl = `${req.nextUrl.origin}/api/notifications/admin-password-set`;
      fetch(
        internalUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Forward the user's auth cookie so the internal route can
            // verify the caller.  In a server-to-server call you would
            // use a shared secret instead; this keeps it simple.
            Cookie: req.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({ token, userId: user.id }),
        }
      ).catch((err) =>
        console.error("[set-password] notification fetch failed:", err)
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/auth/set-password]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}