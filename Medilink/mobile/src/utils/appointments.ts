import type { useI18n } from "@/i18n";

type T = ReturnType<typeof useI18n>["t"];
type Num = ReturnType<typeof useI18n>["num"];

const DOW = ["dowSun", "dowMon", "dowTue", "dowWed", "dowThu", "dowFri", "dowSat"] as const;

/**
 * Format a slot date for display. Real rows are ISO ("YYYY-MM-DD"); mock rows are
 * already display strings ("Wed 18 Jun") — those pass through unchanged.
 */
export function formatApptDate(value: string | null | undefined, t: T, num: Num): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const d = new Date(`${value}T00:00:00`);
  const dow = t(`common.${DOW[d.getDay()]}` as Parameters<T>[0]);
  const month = t(`common.month${d.getMonth()}` as Parameters<T>[0]);
  return `${dow} ${num(String(d.getDate()))} ${month}`;
}

/** Format a slot time. Real rows are "HH:MM[:SS]"; mock rows ("10:30 AM") pass through. */
export function formatApptTime(value: string | null | undefined, num: Num): string {
  if (!value) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  let h = Number(m[1] ?? "0");
  const min = m[2] ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${num(String(h))}:${num(min)} ${ampm}`;
}

export type ApptStatusCategory = "info" | "success" | "danger" | "muted";

/** Map a backend status to a semantic tone category (screens map this to colors). */
export function apptStatusCategory(status: string | null | undefined): ApptStatusCategory {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
    case "no_show":
      return "danger";
    case "checked_in":
      return "info";
    case "pending":
    case "confirmed":
      return "info";
    default:
      return "muted";
  }
}

const STATUS_KEYS: Record<string, Parameters<T>[0]> = {
  pending: "appointments.status_pending",
  confirmed: "appointments.status_confirmed",
  checked_in: "appointments.status_checked_in",
  completed: "appointments.status_completed",
  cancelled: "appointments.status_cancelled",
  no_show: "appointments.status_no_show",
};

/** Localized status label; humanizes any unmapped status defensively. */
export function apptStatusLabel(status: string | null | undefined, t: T): string {
  if (!status) return "";
  const key = STATUS_KEYS[status];
  return key ? t(key) : status.replace(/_/g, " ");
}
