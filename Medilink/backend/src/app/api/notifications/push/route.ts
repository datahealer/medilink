import { NextResponse, type NextRequest } from "next/server";

import { createServiceSupabase } from "@/lib/supabase/service";
import { sendPushToUser } from "@/lib/notifications/sendPush";

/**
 * Push dispatch. Server-to-server only — guarded by a shared secret so it can never be
 * called from a client bundle. Delegates to the canonical `sendPushToUser` dispatcher
 * (device_tokens + profiles.notification_prefs opt-in + Expo batching + invalid-token
 * cleanup), so every push path behaves identically.
 *
 * Body: { userId: string, title: string, body: string, data?: Record<string, unknown> }
 * Header: x-internal-secret: <INVITE_SECRET>
 */
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
    return NextResponse.json({ error: "userId, title and body are required" }, { status: 400 });
  }

  const service = createServiceSupabase();
  const result = await sendPushToUser(service, { userId, title, body, data });
  return NextResponse.json(result);
}
