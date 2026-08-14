import { omanWallClockToInstant, type AppointmentOutcome } from "@medilink/shared/mobile";

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

/**
 * Day + month (e.g. "2 May"), optionally with year ("18 Apr 2026") — the compact date
 * form used by lab reports (design p29–30). Accepts an ISO date or timestamp; slices to
 * the date part. Non-ISO input passes through unchanged (mock display strings).
 */
export function formatDayMonth(
  value: string | null | undefined,
  t: T,
  num: Num,
  opts: { year?: boolean } = {}
): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  const month = t(`common.month${d.getMonth()}` as Parameters<T>[0]);
  const base = `${num(String(d.getDate()))} ${month}`;
  return opts.year ? `${base} ${num(String(d.getFullYear()))}` : base;
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

/**
 * Map a backend status to a semantic tone category (no blue — per design).
 *
 * `approved` was missing until now and fell through to `default → "muted"`. Because the
 * appointments screen used this to decide the tab, a future staff-approved emergency
 * appointment was classified as PAST. It is a live status, so it tones like `confirmed`.
 *
 * NOTE: this is a COLOUR decision only. It used to double as the Upcoming/Past rule, which
 * is what made an appointment from three weeks ago read as upcoming forever. Classification
 * now belongs to `appointmentPhase` in `@medilink/shared` — do not reintroduce it here.
 */
export function apptStatusCategory(status: string | null | undefined): ApptStatusCategory {
  switch (status) {
    case "confirmed":
    case "approved":
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

/** Tone for a derived lifecycle outcome — what the Past list actually labels a row with. */
export function apptOutcomeCategory(outcome: AppointmentOutcome): ApptStatusCategory {
  switch (outcome) {
    case "scheduled":
    case "in_progress":
      return "success";
    case "missed":
    case "cancelled":
      return "danger";
    case "attended":
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
  // The slot is an OMAN wall clock. `new Date(\`${date}T${hh}:${mm}\`)` read it in the
  // DEVICE's timezone, so a patient travelling — or simply on a phone set to another
  // zone — got an appointment shifted by the offset difference. That lands on the
  // refund tier: a 3-hour error can cross the 24h or 48h boundary, so the app promised
  // a refund the server (which measures in Asia/Muscat) would not grant.
  const when = omanWallClockToInstant(date, `${hh}:${mm}`);
  if (!when) return Number.POSITIVE_INFINITY;
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
  // `approved` (migration 20260430000001) had no key, so it rendered as the raw enum value.
  approved: "appointments.status_approved",
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

const OUTCOME_KEYS: Record<AppointmentOutcome, Parameters<T>[0]> = {
  scheduled: "appointments.status_confirmed",
  in_progress: "appointments.status_checked_in",
  completed: "appointments.status_completed",
  cancelled: "appointments.status_cancelled",
  missed: "appointments.outcome_missed",
  attended: "appointments.outcome_attended",
};

/**
 * Localized label for a DERIVED outcome — what the Past list shows.
 *
 * Distinct from `apptStatusLabel` because two of these have no backend status behind them:
 * `missed` covers an appointment whose slot elapsed with nobody resolving it, and `attended`
 * covers a checked-in visit the clinic never closed. Labelling the latter "Completed" would
 * assert a clinical outcome the system does not know.
 */
export function apptOutcomeLabel(outcome: AppointmentOutcome, t: T): string {
  return t(OUTCOME_KEYS[outcome]);
}

/**
 * Business error codes returned by the booking / reschedule RPCs.
 *
 * The repository deliberately surfaces the backend's own code verbatim (see
 * data/real/index.ts and bookingFlow.integration.test.ts) so nothing is swallowed;
 * this is the PRESENTATION layer that turns those codes into something a patient can
 * read. `SLOT_IN_PAST` is raised by `book_appointment_atomic` /
 * `reschedule_appointment_atomic` when the chosen slot has already elapsed in Oman
 * time — the server-side half of the past-slot fix.
 */
const BOOKING_ERROR_KEYS: Record<string, Parameters<T>[0]> = {
  SLOT_IN_PAST: "booking.errSlotInPast",
  SLOT_ALREADY_BOOKED: "booking.errSlotTaken",
  SLOT_ALREADY_TAKEN: "booking.errSlotTaken",
  OUTSIDE_BOOKING_WINDOW: "booking.errOutsideWindow",
  INVALID_SLOT: "booking.errInvalidSlot",
};

/**
 * Readable message for a booking failure.
 *
 * Falls back to the raw backend reason for any unmapped code, so adding a new server
 * error can never leave the patient staring at an empty alert — and so a code we have
 * not localized yet is still visible in a bug report.
 */
export function bookingErrorMessage(reason: string | null | undefined, t: T): string {
  const raw = (reason ?? "").trim();
  if (!raw) return t("errors.unknown");
  // Codes arrive bare from the RPC, but a thrown Error may prefix/wrap them.
  const code = Object.keys(BOOKING_ERROR_KEYS).find(
    (c) => raw === c || raw.includes(c)
  );
  return code ? t(BOOKING_ERROR_KEYS[code]!) : raw;
}
