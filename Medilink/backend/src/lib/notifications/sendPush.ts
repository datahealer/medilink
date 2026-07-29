import type { createServiceSupabase } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceSupabase>;

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK = 100; // Expo accepts at most 100 messages per request.

export type PushInput = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushResult = { sent: number; skipped?: string; removed?: number };

type ExpoTicket = { status?: string; details?: { error?: string } };

/**
 * Canonical push dispatcher. The single place that turns a "notify user X" intent into
 * delivered device pushes, so every caller uses the same token store, opt-in check,
 * batching and invalid-token cleanup.
 *
 * - Token store: the `device_tokens` table (RLS per-device; the mobile app upserts here).
 *   NOTE: legacy `profiles.push_tokens` is NOT used — the app never populates it.
 * - Opt-in: `profiles.notification_prefs.push` (the canonical prefs store the app writes;
 *   see shared/src/api/notifications.ts). The separate `notification_preferences` table
 *   is not the source of truth for the mobile app.
 * - Cleanup: tokens Expo reports as `DeviceNotRegistered` are deleted so we stop
 *   spending on dead devices.
 *
 * Best-effort: never throws — returns a summary. Callers should not fail their primary
 * action (e.g. finalizing a payment) if a push can't be delivered.
 */
export async function sendPushToUser(service: ServiceClient, input: PushInput): Promise<PushResult> {
  try {
    // Respect the user's push opt-in.
    const { data: profile } = await service
      .from("profiles")
      .select("notification_prefs")
      .eq("id", input.userId)
      .maybeSingle();
    const prefs = (profile?.notification_prefs ?? null) as { push?: boolean } | null;
    if (prefs?.push === false) return { sent: 0, skipped: "push disabled by user" };

    const { data: tokenRows, error } = await service
      .from("device_tokens")
      .select("token")
      .eq("user_id", input.userId);
    if (error) return { sent: 0, skipped: `token lookup failed: ${error.message}` };

    const tokens = (tokenRows ?? []).map((t) => t.token).filter((t): t is string => !!t);
    if (!tokens.length) return { sent: 0, skipped: "no registered devices" };

    let sent = 0;
    let removed = 0;
    for (let i = 0; i < tokens.length; i += EXPO_CHUNK) {
      const batch = tokens.slice(i, i + EXPO_CHUNK);
      const messages = batch.map((to) => ({
        to,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        sound: "default",
      }));
      const tickets = await postExpo(messages);
      removed += await cleanupInvalidTokens(service, batch, tickets);
      sent += batch.length;
    }
    return { sent, removed };
  } catch (err) {
    console.error("sendPushToUser failed:", err instanceof Error ? err.message : err);
    return { sent: 0, skipped: "dispatch error" };
  }
}

async function postExpo(messages: unknown[]): Promise<ExpoTicket[]> {
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    return Array.isArray(json?.data) ? json!.data! : [];
  } catch {
    return [];
  }
}

/** Delete tokens Expo reports as permanently invalid. Returns the count removed. */
async function cleanupInvalidTokens(
  service: ServiceClient,
  tokens: string[],
  tickets: ExpoTicket[]
): Promise<number> {
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered" && tokens[i]) {
      dead.push(tokens[i]);
    }
  });
  if (!dead.length) return 0;
  await service.from("device_tokens").delete().in("token", dead);
  return dead.length;
}
