// Shared notification-preview mapping — used by DashboardNav's bell dropdown.
// Mirrors the backend-type → UI-style mapping already used on the notifications
// page and the dashboard home (kept here once so new consumers don't re-derive it).
import type { api } from "@medilink/shared";

export type NotifUiType = "reminder" | "confirmed" | "lab" | "rx" | "payment" | "message";

export const NOTIF_STYLE: Record<NotifUiType, { icon: string; dotColor: string }> = {
  reminder:  { icon: "⏰", dotColor: "#f59e0b" },
  confirmed: { icon: "✅", dotColor: "#10b981" },
  lab:       { icon: "🧪", dotColor: "#38bdf8" },
  rx:        { icon: "💊", dotColor: "#a855f7" },
  payment:   { icon: "💳", dotColor: "#8b5cf6" },
  message:   { icon: "💬", dotColor: "#3b82f6" },
};

export function notifUiType(backendType: string | null | undefined): NotifUiType {
  const s = (backendType ?? "").toLowerCase();
  if (s.includes("lab")) return "lab";
  if (s.includes("pay") || s.includes("invoice") || s.includes("refund")) return "payment";
  if (s.includes("prescription") || s.includes("rx") || s.includes("medication")) return "rx";
  if (s.includes("message") || s.includes("chat")) return "message";
  if (s.includes("confirm") || s.includes("approv") || s.includes("book")) return "confirmed";
  return "reminder";
}

export function notifRelTime(iso: string | null, isAr: boolean): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000), hr = Math.floor(min / 60), day = Math.floor(hr / 24);
  if (isAr) return day > 0 ? `منذ ${day}ي` : hr > 0 ? `منذ ${hr}س` : `منذ ${min}د`;
  return day > 0 ? `${day}d ago` : hr > 0 ? `${hr}h ago` : `${min}m ago`;
}

type NotifRow = Awaited<ReturnType<typeof api.notifications.listNotifications>>[number];

export type NotifPreview = {
  id: string;
  icon: string;
  unread: boolean;
  dotColor: string;
  en: { title: string; body: string; time: string };
  ar: { title: string; body: string; time: string };
};

/** Map a raw `in_app_notifications` row to the shape the bell dropdown renders. */
export function toNotifPreview(row: NotifRow): NotifPreview {
  const style = NOTIF_STYLE[notifUiType(row.type)];
  const title = row.title ?? "";
  const body = row.body ?? "";
  return {
    id: row.id,
    icon: style.icon,
    unread: !row.is_read,
    dotColor: style.dotColor,
    en: { title, body, time: notifRelTime(row.created_at, false) },
    ar: { title: row.title_ar || title, body: row.body_ar || body, time: notifRelTime(row.created_at, true) },
  };
}
