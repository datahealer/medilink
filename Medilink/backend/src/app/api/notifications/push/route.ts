import { NextResponse, type NextRequest } from "next/server";

import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * Push dispatch (foundation). Server-to-server only — guarded by a shared secret so
 * it can never be called from a client bundle. Looks up the target user's registered
 * device tokens (service role) and fans the message out via Expo's push service.
 *
 * Body: { userId: string, title: string, body: string, data?: Record<string, unknown> }
 * Header: x-internal-secret: <INVITE_SECRET>
 *
 * Provider note: Expo push is used as the transport abstraction over FCM/APNs. Swap
 * the `sendToExpo` impl for direct FCM/APNs later without changing callers.
 */
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

interface PushBody {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!process.env.INVITE_SECRET || secret !== process.env.INVITE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PushBody;
  try {
    payload = (await req.json()) as PushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, title, body, data } = payload;
  if (!userId || !title || !body) {
    return NextResponse.json(
      { error: "userId, title and body are required" },
      { status: 400 }
    );
  }

  const supabase = createServiceSupabase();

  // Respect the user's opt-in before sending.
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("push")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs && prefs.push === false) {
    return NextResponse.json({ skipped: "push disabled by user" });
  }

  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!tokens?.length) {
    return NextResponse.json({ sent: 0, reason: "no registered devices" });
  }

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    data: data ?? {},
    sound: "default",
  }));

  const result = await sendToExpo(messages);
  return NextResponse.json({ sent: messages.length, result });
}

async function sendToExpo(messages: unknown[]): Promise<unknown> {
  const res = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  return res.json().catch(() => null);
}
