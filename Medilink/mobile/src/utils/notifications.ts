import type { NotificationKind } from "@/data/types";

/** Shape of the `data` payload attached to in-app + push notifications. */
export type NotificationData = {
  /** Routable category set by the producer (DB `type` is constrained to info|warning|error). */
  kind?: string;
  appointment_id?: string;
  /** Optional explicit in-app route path; takes precedence over kind-based routing. */
  url?: string;
  [key: string]: unknown;
};

/**
 * Classify a notification into a UI kind. The routable category is carried in
 * `data.kind` (the DB `type` column is constrained to info|warning|error). We read
 * `data.kind` first, then any keyword in `type`, then infer from the payload; unknown
 * rows fall back to `general` (the notifications screen — never the wrong destination).
 *
 * Shared by the in-app notifications list and the push-notification tap handler so both
 * classify identically.
 */
export function classifyNotification(
  type: string | null | undefined,
  data: NotificationData | null | undefined
): NotificationKind {
  const explicit = typeof data?.kind === "string" ? data.kind.toLowerCase() : "";
  const t = explicit || (type ?? "").toLowerCase();
  if (t.includes("payment") || t.includes("invoice") || t.includes("refund")) return "payment";
  if (
    t.includes("appointment") || t.includes("booking") || t.includes("reminder") ||
    t.includes("reschedul") || t.includes("cancel") || t.includes("confirm") ||
    t.includes("checkin") || t.includes("check_in") || t.includes("waitlist")
  )
    return "appointment";
  if (t.includes("lab") || t.includes("result")) return "lab";
  if (t.includes("prescription") || t.includes("medication") || t.includes("rx")) return "prescription";
  if (t.includes("insight") || t.includes("assistant") || t.includes("ai")) return "assistant";
  if (t.includes("message") || t.includes("chat")) return "facility";
  // Legacy rows with no kind: infer an appointment/payment link from the payload id.
  if (!explicit && typeof data?.appointment_id === "string") return "appointment";
  return "general";
}

/**
 * Resolve a notification's in-app destination from its kind, deep-linking to the
 * specific record when an id is available. Returns the notifications screen for
 * general announcements. Callers already on the notifications list should skip
 * navigating to `/notifications` (a no-op) — see the list's tap handler.
 */
export function routeForNotification(kind: NotificationKind, appointmentId?: string | null): string | null {
  switch (kind) {
    case "payment":
      return appointmentId ? `/appointments/${appointmentId}` : "/payments";
    case "appointment":
      return appointmentId ? `/appointments/${appointmentId}` : "/appointments";
    case "lab":
      return "/records/labs";
    case "prescription":
      return "/records/prescriptions";
    case "assistant":
      return "/ai/insights";
    case "facility":
      return "/notifications/messages";
    case "general":
      return "/notifications";
    default:
      return null;
  }
}

/**
 * Resolve the destination for a tapped push notification from its `data` payload.
 * Prefers an explicit `data.url` (a relative in-app route the backend can specify),
 * otherwise derives it from the classified kind + appointment id.
 */
export function routeForNotificationData(data: NotificationData | null | undefined): string | null {
  if (typeof data?.url === "string" && data.url.startsWith("/")) return data.url;
  const kind = classifyNotification(null, data);
  const appointmentId = typeof data?.appointment_id === "string" ? data.appointment_id : null;
  return routeForNotification(kind, appointmentId);
}
