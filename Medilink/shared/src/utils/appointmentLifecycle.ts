/**
 * Appointment lifecycle — the ONE definition of "is this upcoming or past", and of what
 * a patient is allowed to do with it.
 *
 * ── THE BUG THIS REPLACES ──
 *
 * `mobile/app/(app)/appointments/index.tsx` classified appointments by STATUS ALONE:
 *
 *     function isUpcoming(a) {
 *       const c = apptStatusCategory(a.status);
 *       return c === "success" || c === "warning";   // confirmed | checked_in | pending
 *     }
 *
 * There was no date or time comparison anywhere in it, and the screen fetched the `"all"`
 * tab, so the server's date filter never applied either. An appointment from 24 July was
 * still listed under Upcoming three weeks later.
 *
 * It never self-corrects, because NOTHING in the system ends an appointment. Verified
 * across all 168 migrations, the edge functions and the backend routes:
 *
 *   • `appointments.status = 'completed'`  — written by nothing. It appears only in
 *     analytics READS (`analytics_summary`, `staff_metrics`). There is no completion RPC;
 *     the queue's staff operations are enqueue / call_next / skip / recall / no_show.
 *   • `appointments.status = 'no_show'`    — written by nothing. The only `no_show` write
 *     in the schema targets `queue_items.status` (`queue_no_show`), a different table.
 *   • pg_cron                              — auto-unavailable-doctors, sweep_expired_holds,
 *     GDPR purge, audit-log cleanup, invoice-recovery. None touch appointment status.
 *
 * So `confirmed` is terminal in practice, and a status-only rule can only ever answer
 * "upcoming".
 *
 * ── WHY "MISSED" IS DERIVED AND NOT STORED ──
 *
 * The honest position is that the backend has no authoritative terminal status for
 * "the slot passed and nobody resolved it". Inventing one here would mean writing to
 * `appointments`, a table shared live with HAMS's own staff UI, on a schedule they did not
 * agree to. That is a data-ownership decision, not a display bug fix.
 *
 * So this module DERIVES the missed state for presentation and writes nothing. Where the
 * backend DOES have an authoritative answer — `cancelled`, `completed`, `no_show` — that
 * answer always wins and is never second-guessed by a clock.
 *
 * The cost is that the clinic's no-show analytics stay undercounted, because they read
 * `appointments.status`. Fixing that properly needs a server-side sweeper agreed with HAMS;
 * it is deliberately out of scope here and should be proposed to them separately.
 *
 * ── TIME IS ALWAYS OMAN WALL CLOCK ──
 *
 * `slot_date` + `slot_end` are a zone-less local pair. Comparing them with `new Date()` on
 * the device reads them in the DEVICE's zone, which shifts every appointment by the offset
 * difference — 4 hours on a UTC server, 1.5 hours on an Indian phone. Every comparison here
 * goes through `omanWallClockToInstant`, the same helper the refund tier already uses.
 */
import { omanWallClockToInstant } from "../config/time";

/**
 * Grace period after the slot ENDS before an unresolved appointment reads as missed.
 *
 * Clinics run late. Without this, a patient sitting in the waiting room at their scheduled
 * end time watches their live appointment flip to "Missed", which is both wrong and
 * alarming. One hour is generous enough to cover ordinary overrun and short enough that a
 * genuinely missed morning appointment has settled by the afternoon.
 *
 * Single constant on purpose — this is the number most likely to need tuning once the
 * clinic reports real overrun figures.
 */
export const MISSED_GRACE_MINUTES = 60;

/** Statuses that mean the visit is still live. `approved` = emergency cleared by staff. */
export const ACTIVE_APPOINTMENT_STATUSES = [
  "pending",
  "approved",
  "confirmed",
  "checked_in",
] as const;

/**
 * Statuses the BACKEND has already resolved. These always win over any time comparison —
 * a cancelled appointment is cancelled whether its slot is next week or last month.
 */
export const ENDED_APPOINTMENT_STATUSES = ["cancelled", "completed", "no_show"] as const;

/** Which tab an appointment belongs in. */
export type AppointmentPhase = "upcoming" | "past";

/**
 * What actually happened, as far as we can honestly tell.
 *
 * `attended` is deliberately NOT `completed`. A patient who checked in demonstrably turned
 * up, but nothing closes the visit, so we do not know the clinical outcome. Labelling it
 * "Completed" would fabricate a clinical fact — the same class of problem as the fabricated
 * vitals chart that was removed from AI Insights.
 */
export type AppointmentOutcome =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "missed"
  | "attended";

/** The subset of an appointment row this module needs. Works on DB rows and domain models. */
export interface AppointmentLifecycleInput {
  status?: string | null;
  slot_date?: string | null;
  slot_start?: string | null;
  slot_end?: string | null;
}

/**
 * The instant this appointment finishes, in real time.
 *
 * Prefers `slot_end` (`NOT NULL` in the schema) and falls back to `slot_start` so a row
 * from an older path, or a domain model that omits it, still resolves.
 *
 * Returns `null` when the date is not ISO `YYYY-MM-DD` — the mock data layer uses display
 * strings ("Wed 18 Jun"), and every caller below treats `null` as NOT elapsed. Guessing at
 * an unparseable date would move real appointments to Past on the strength of a parse
 * failure, which is worse than leaving them where they are.
 */
export function appointmentEndInstant(appt: AppointmentLifecycleInput): Date | null {
  const date = appt.slot_date;
  if (!date) return null;
  const time = appt.slot_end ?? appt.slot_start;
  if (!time) return null;
  return omanWallClockToInstant(date, time);
}

/**
 * Has the slot finished, allowing for the grace period?
 *
 * `now` is injectable so tests pin an exact instant instead of reading the wall clock.
 */
export function hasAppointmentElapsed(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  const end = appointmentEndInstant(appt);
  if (!end) return false;
  return end.getTime() + MISSED_GRACE_MINUTES * 60_000 < now.getTime();
}

/**
 * The single classification rule.
 *
 * Backend-resolved statuses are checked FIRST and never overridden by the clock; only the
 * genuinely unresolved cases fall through to a time comparison.
 */
export function appointmentOutcome(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): AppointmentOutcome {
  const status = (appt.status ?? "").trim();

  // ── Authoritative backend answers ──
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "no_show") return "missed";

  const elapsed = hasAppointmentElapsed(appt, now);

  // Checked in: the patient turned up. Never "missed", whatever the clock says.
  if (status === "checked_in") return elapsed ? "attended" : "in_progress";

  // pending / approved / confirmed — and any status we do not recognise, which is treated
  // as active so an unknown value can never silently hide a future appointment.
  return elapsed ? "missed" : "scheduled";
}

/** Which tab this belongs in. */
export function appointmentPhase(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): AppointmentPhase {
  const outcome = appointmentOutcome(appt, now);
  return outcome === "scheduled" || outcome === "in_progress" ? "upcoming" : "past";
}

/** Convenience predicate — the direct replacement for the old status-only `isUpcoming`. */
export function isUpcomingAppointment(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  return appointmentPhase(appt, now) === "upcoming";
}

/**
 * May the patient still move this appointment?
 *
 * Gated on time as well as status. Previously this was `status === "pending" || "confirmed"`
 * with no clock check, and `reschedule_appointment_atomic` only rejects `SLOT_IN_PAST` for
 * the NEW slot — so moving a three-week-old appointment to a future date SUCCEEDED, silently
 * rewriting a historical record and erasing the fact that the patient missed it.
 *
 * `approved` is included alongside `pending`/`confirmed`: the shared appointments API already
 * documents that the UI treats `approved` as equivalent to `confirmed`, and the UI simply
 * never implemented it.
 */
export function canRescheduleAppointment(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  const status = (appt.status ?? "").trim();
  const movable = status === "pending" || status === "confirmed" || status === "approved";
  return movable && !hasAppointmentElapsed(appt, now);
}

/** May the patient still cancel? Same window as reschedule; the RPC re-checks its own cutoff. */
export function canCancelAppointment(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  return canRescheduleAppointment(appt, now);
}

/** May the patient check in? Only a confirmed appointment that has not elapsed. */
export function canCheckInAppointment(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  return (appt.status ?? "").trim() === "confirmed" && !hasAppointmentElapsed(appt, now);
}

/**
 * Should we offer "Book again" instead of "Reschedule"?
 *
 * A missed appointment is not a visit that moved — it is a visit that did not happen, and a
 * new one the patient now wants. Rescheduling it in place would overwrite the historical row
 * (`reschedule_appointment_atomic` mutates `slot_date`/`slot_start`/`slot_end` directly,
 * keeping only a single `previous_slot_*` pair), destroying the record of the miss. Booking
 * again creates a new appointment and leaves the missed one intact as history.
 */
export function canBookAgain(
  appt: AppointmentLifecycleInput,
  now: Date = new Date()
): boolean {
  return appointmentOutcome(appt, now) === "missed";
}
