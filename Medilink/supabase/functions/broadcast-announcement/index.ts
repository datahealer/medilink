import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import nodemailer from "npm:nodemailer";
import { requireInternalCaller } from "../_shared/internalAuth.ts";

const BATCH_SIZE = 10;

serve(async (req) => {
  /**
   * SERVER-TO-SERVER ONLY.
   *
   * verify_jwt alone is NOT sufficient: it only proves the caller presented a VALID project
   * JWT, and the anon key is a valid project JWT that ships publicly in every browser bundle.
   * Demonstrated on this project -- poll-refund-status had verify_jwt = true and no guard, and
   * returned 200 to the public anon key.
   *
   * Its only caller is src/app/api/facilities/[id]/announcements/route.ts, which was sending
   * the ANON key -- a public credential -- and has been switched to the service-role key in
   * the same change. Unguarded, anyone could broadcast an announcement to every recipient of
   * an arbitrary announcement_id.
   *
   * requireInternalCaller accepts only the raw injected service-role key or a
   * signature-verified `role: service_role` JWT; anon and authenticated are refused 401. It is
   * placed FIRST so an unauthorized caller learns nothing -- no method check, no body parse, no
   * database access happens before it.
   *
   * ⚠️ Operational invariant from _shared/internalAuth.ts: verify_jwt must stay TRUE for this
   * function, or an unsigned forged token could claim role: service_role.
   */
  const refusal = requireInternalCaller(req, "broadcast-announcement");
  if (refusal) return refusal;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { announcement_id } = await req.json();

    // ===============================
    // EMAIL CONFIG
    // ===============================
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: Deno.env.get("EMAIL_USER"),
        pass: Deno.env.get("EMAIL_PASS"),
      },
    });

    // ===============================
    // GET ANNOUNCEMENT
    // ===============================
    const { data: announcement } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", announcement_id)
      .single();

    if (!announcement) throw new Error("Announcement not found");

    let userIds: string[] = [];

    // ===============================
    // 🎯 TARGETING
    // ===============================
    if (announcement.target_audience === "all") {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "patient");

      userIds = data?.map((u) => u.id) || [];
    }

    // ===============================
    // GET USERS
    // ===============================
    const { data: users } = await supabase
      .from("profiles")
      .select("id, email, push_tokens, muted_facilities")
      .in("id", userIds);

    if (!users?.length) {
      return new Response(JSON.stringify({ success: true, users: 0 }));
    }

    // ===============================
    // ❗ MUTED FILTER
    // ===============================
    const filteredUsers = users.filter(
      (u) => !u.muted_facilities?.includes(announcement.facility_id)
    );

    console.log("👥 After mute filter:", filteredUsers.length);

    // ===============================
    // 🔔 IN-APP
    // ===============================
    await supabase.from("in_app_notifications").insert(
      filteredUsers.map((u) => ({
        user_id: u.id,
        title: announcement.title,
        body: announcement.message,
        type: "info",
        data: { kind: "announcement" },
      }))
    );

    // ===============================
    // 📧 EMAIL (BATCH + PARALLEL)
    // ===============================
    if (announcement.channels?.includes("email")) {
      for (let i = 0; i < filteredUsers.length; i += BATCH_SIZE) {
        const batch = filteredUsers.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (user) => {
            if (!user.email) return;

            try {
              console.log("📧 Sending:", user.email);

              await transporter.sendMail({
                from: Deno.env.get("EMAIL_FROM"),
                to: user.email,
                subject: `📢 ${announcement.title}`,
                html: `
                  <h2>${announcement.title}</h2>
                  <p>${announcement.message}</p>
                `,
              });

              console.log("✅ Sent:", user.email);
            } catch (err) {
              console.error("❌ Email failed:", user.email);
            }
          })
        );
      }
    }

    // ===============================
    // 📱 PUSH (EXPO)
    // ===============================
    if (announcement.channels?.includes("push")) {
      const tokens = filteredUsers.flatMap((u) => u.push_tokens || []);

      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);

        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            batch.map((token) => ({
              to: token,
              title: announcement.title,
              body: announcement.message,
            }))
          ),
        );
      }
    }

    // ===============================
    // UPDATE COUNT
    // ===============================
    await supabase
      .from("announcements")
      .update({ recipient_count: filteredUsers.length })
      .eq("id", announcement.id);

    console.log("🎉 Done:", filteredUsers.length);

    return new Response(
      JSON.stringify({ success: true, users: filteredUsers.length }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("❌ ERROR:", err.message);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});