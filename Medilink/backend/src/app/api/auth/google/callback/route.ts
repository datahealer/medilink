import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "No code" }, { status: 400 });
    }

    // ================= TOKEN EXCHANGE =================
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token || !tokenData.expires_in) {
      return NextResponse.json(
        { error: "Token exchange failed", details: tokenData },
        { status: 400 }
      );
    }

    // ================= GET USER SAFELY =================
    const supabase = await createApiSupabaseClient(req);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("User not authenticated in callback");
    }

    // ================= SAVE TOKENS =================
    await supabase.from("user_integrations").upsert({
      user_id: user.id,
      provider: "google_calendar",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString(),
    });

    // ================= REDIRECT BACK =================
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Land on an existing patient route. The previous target
  // (/dashboard/dashboardpages/scheduling/calendar-sync) was a HAMS staff path that
  // does not exist in the patient app and would 404. Settings is the closest real
  // home for account integrations; confirm the intended screen with product.
  return NextResponse.redirect(
    `${baseUrl}/dashboard/settings?connected=google`
  );

  } catch (err: any) {
    console.error("GOOGLE CALLBACK ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}