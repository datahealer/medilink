/**
 * MediLink business time — Asia/Muscat.
 *
 * ── Why this module exists ──
 *
 * MediLink operates in Oman, but three different notions of "today" were in play:
 *   • the database used `CURRENT_DATE` (UTC),
 *   • mobile built day keys with `toISOString()` (UTC) while LABELLING them with
 *     `getDate()` (device local),
 *   • web used browser-local `getFullYear()/getMonth()/getDate()`.
 *
 * Between 00:00 and 04:00 Oman time all three disagree, so the booking grid showed
 * one date and requested another, and the 7-day window was off by one. This module
 * is the single client-side definition of an Oman calendar date, consumed by BOTH
 * `mobile/` and `frontend/` so a second, subtly-different implementation cannot
 * appear. See `supabase/migrations/20260811000000_booking_oman_time_and_slot_occupancy.sql`
 * for the server-side counterpart.
 *
 * ── The database is still the source of truth ──
 *
 * Nothing here authorises anything. `get_available_slots` decides what is bookable
 * and `book_appointment_atomic` decides what may be booked, both using
 * `public.oman_today()` / `public.oman_time_now()`. These helpers exist so the UI
 * ASKS the right question (correct date key) and LABELS it consistently — never to
 * substitute for the server's checks. `isSlotInPast` in particular is a display
 * convenience; the server rejects a past slot with `SLOT_IN_PAST` regardless.
 *
 * ── Why a fixed offset rather than Intl ──
 *
 * Oman is UTC+4 year-round and has not observed DST since 1977, so a fixed offset is
 * exact. It is also deterministic under a frozen test clock and free of any ICU/Intl
 * dependency, which matters on Hermes where time-zone-aware `Intl.DateTimeFormat`
 * support varies by build. The DATABASE uses the named zone `Asia/Muscat`, so if
 * Oman ever adopts DST the server stays correct on its own and only this constant
 * needs revisiting — the failure mode is a wrong label, never a wrong authorisation.
 */

/** IANA zone used by the database (`AT TIME ZONE 'Asia/Muscat'`). */
export const OMAN_TIME_ZONE = "Asia/Muscat";

/** Oman is UTC+4 with no daylight saving. See the note above before changing this. */
export const OMAN_UTC_OFFSET_MINUTES = 4 * 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** One day of the booking strip, entirely in Oman local terms. */
export interface OmanDay {
  /** `YYYY-MM-DD` in Oman local time — the key sent to availability/booking APIs. */
  key: string;
  /** 0 = Sunday … 6 = Saturday, Oman local. */
  weekday: number;
  /** Day of month, Oman local. */
  dayOfMonth: number;
  /** 0 = January … 11 = December, Oman local. */
  monthIndex: number;
  /** Full year, Oman local. */
  year: number;
}

/**
 * A `Date` shifted so that its **UTC** getters read as the Oman wall clock.
 * Only ever read via `getUTC*` — its epoch value is deliberately meaningless.
 */
function omanClock(now: Date): Date {
  return new Date(now.getTime() + OMAN_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
}

const pad = (n: number): string => String(n).padStart(2, "0");

function keyOf(clock: Date): string {
  return `${clock.getUTCFullYear()}-${pad(clock.getUTCMonth() + 1)}-${pad(clock.getUTCDate())}`;
}

function dayOf(clock: Date): OmanDay {
  return {
    key: keyOf(clock),
    weekday: clock.getUTCDay(),
    dayOfMonth: clock.getUTCDate(),
    monthIndex: clock.getUTCMonth(),
    year: clock.getUTCFullYear(),
  };
}

/** Today's Oman calendar date as `YYYY-MM-DD`. The client mirror of `oman_today()`. */
export function omanToday(now: Date = new Date()): string {
  return keyOf(omanClock(now));
}

/** Today's Oman calendar date with its label parts, so key and label cannot disagree. */
export function omanTodayParts(now: Date = new Date()): OmanDay {
  return dayOf(omanClock(now));
}

/** Minutes since Oman midnight. The client mirror of `oman_time_now()`. */
export function omanMinutesNow(now: Date = new Date()): number {
  const clock = omanClock(now);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

/**
 * `count` consecutive Oman days starting today — the booking-window strip.
 *
 * Both the `key` (sent to the API) and the label parts (`weekday`, `dayOfMonth`)
 * come from the same Oman-shifted clock, which is what removes the class of bug
 * where the grid rendered "12" but requested `…-11`.
 */
export function omanBookingDays(count: number, now: Date = new Date()): OmanDay[] {
  const base = omanClock(now);
  const days: OmanDay[] = [];
  for (let i = 0; i < count; i++) {
    // Oman has no DST, so a fixed 24h step is exactly one Oman calendar day.
    days.push(dayOf(new Date(base.getTime() + i * MS_PER_DAY)));
  }
  return days;
}

/**
 * Minutes since midnight for an `HH:mm` / `HH:mm:ss` slot start; `NaN` if unparseable.
 *
 * Matched with a regex rather than `Number(split(":"))`: `Number("")` is 0, so an
 * empty or malformed string would otherwise parse as 00:00 and be reported as
 * "already past" — silently hiding a slot instead of deferring to the server.
 */
const HHMM = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

export function slotStartMinutes(slotStart: string): number {
  const match = HHMM.exec(String(slotStart).trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23) return Number.NaN;
  return hours * 60 + minutes;
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Turn an Oman wall clock (`YYYY-MM-DD` + `HH:mm`) into a real instant.
 *
 * `appointments.slot_date` + `slot_start` are stored as a LOCAL wall-clock pair with
 * no zone, so `new Date(\`${date}T${time}\`)` interprets them in whatever timezone the
 * device or server happens to be in. For anything that measures elapsed time — the
 * refund tier, a cancellation cutoff, a calendar event — that silently shifts the
 * appointment by the difference between the local zone and Oman: 4 hours on a UTC
 * server, 1.5 hours on an Indian phone.
 *
 * Returns `null` for an unparseable date or time so callers can choose their own
 * fallback rather than receiving a plausible-but-wrong instant.
 */
export function omanWallClockToInstant(dateKey: string, timeOfDay: string): Date | null {
  const ymd = YMD.exec(String(dateKey).trim());
  if (!ymd) return null;
  const minutes = slotStartMinutes(timeOfDay);
  if (Number.isNaN(minutes)) return null;
  // Subtracting the offset inside Date.UTC lets it normalise a negative minute count
  // across the date boundary — an 02:00 Oman slot is 22:00 UTC the previous day.
  return new Date(
    Date.UTC(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      minutes - OMAN_UTC_OFFSET_MINUTES
    )
  );
}

/**
 * Has this slot already elapsed in Oman time?
 *
 * Display convenience only — the server is authoritative and answers `SLOT_IN_PAST`
 * for the same condition. An unparseable time is reported as NOT past so the server
 * gets to make the call rather than the UI silently hiding a slot.
 */
export function isSlotInPast(
  dateKey: string,
  slotStart: string,
  now: Date = new Date()
): boolean {
  const today = omanToday(now);
  // ISO `YYYY-MM-DD` is lexicographically ordered, so string compare is safe here.
  if (dateKey < today) return true;
  if (dateKey > today) return false;
  const minutes = slotStartMinutes(slotStart);
  if (Number.isNaN(minutes)) return false;
  return minutes <= omanMinutesNow(now);
}
