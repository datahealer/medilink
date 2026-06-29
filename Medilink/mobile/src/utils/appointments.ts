import type { useI18n } from "@/i18n";
import type { ThemeColors } from "@/theme/light";

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

export type ApptStatusCategory = "success" | "warning" | "danger" | "muted";

/** Map a backend status to a semantic tone category (no blue — per design). */
export function apptStatusCategory(status: string | null | undefined): ApptStatusCategory {
  switch (status) {
    case "confirmed":
    case "checked_in":
      return "success"; // green "Confirmed" chip
    case "pending":
      return "warning"; // amber (replaces the old blue Pending badge)
    case "cancelled":
    case "no_show":
      return "danger";
    case "completed":
    default:
      return "muted";
  }
}

export interface ApptTone {
  bg: string;
  fg: string;
}

/** Resolve a status category to concrete theme colors (pill bg + dot/text). */
export function apptTone(colors: ThemeColors, cat: ApptStatusCategory): ApptTone {
  switch (cat) {
    case "success":
      return { bg: colors.successSurface, fg: colors.success };
    case "warning":
      return { bg: colors.surfaceAlt, fg: colors.warning };
    case "danger":
      return { bg: colors.errorSurface, fg: colors.error };
    default:
      return { bg: colors.surfaceAlt, fg: colors.textMuted };
  }
}

/** Hours from now until an appointment's start. Negative once it has begun. */
export function hoursUntilAppt(date: string | null | undefined, start: string | null | undefined): number {
  if (!date) return Number.POSITIVE_INFINITY;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return Number.POSITIVE_INFINITY; // mock display rows — treat as far out
  const time = /^(\d{1,2}):(\d{2})/.exec(start ?? "00:00");
  const hh = time ? time[1]?.padStart(2, "0") : "00";
  const mm = time ? time[2] : "00";
  const when = new Date(`${date}T${hh}:${mm}:00`);
  return (when.getTime() - Date.now()) / 3_600_000;
}

export interface RefundTier {
  /** Refund percentage applied to the consultation fee. */
  pct: 100 | 50 | 10 | 0;
  /** i18n key for the cancellation-window label. */
  windowKey: "appointments.policyWindowFull" | "appointments.policyWindow50" | "appointments.policyWindow10" | "appointments.policyWindowNone";
}

/** Tiered refund rule (design p26) by hours remaining before the appointment. */
export function refundTier(hours: number): RefundTier {
  if (hours <= 0) return { pct: 0, windowKey: "appointments.policyWindowNone" };
  if (hours < 24) return { pct: 10, windowKey: "appointments.policyWindow10" };
  if (hours < 48) return { pct: 50, windowKey: "appointments.policyWindow50" };
  return { pct: 100, windowKey: "appointments.policyWindowFull" };
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
