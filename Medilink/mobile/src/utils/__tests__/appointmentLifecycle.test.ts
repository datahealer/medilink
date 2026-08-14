/**
 * Appointment lifecycle — regression suite for the Upcoming/Past classification bug.
 *
 * THE BUG: `app/(app)/appointments/index.tsx` decided the tab from the STATUS CATEGORY
 * alone, with no date or time comparison, and fetched the `"all"` tab so the server's date
 * filter never applied either. Because nothing in the backend ever writes `completed` or
 * `no_show` to `appointments`, a booked visit stays `confirmed` forever — so an appointment
 * from 24 July was still listed under Upcoming on 14 August.
 *
 * Every case below pins an exact instant rather than reading the wall clock, so the suite
 * behaves identically in CI, in Muscat and in a UTC container. Oman is UTC+4 with no DST.
 *
 * The module under test lives in `shared/` so mobile AND web consume one implementation;
 * mobile is the only workspace with a Jest runner, so its tests live here (same convention
 * as omanTime.test.ts and safeNext.test.ts).
 */
import {
  MISSED_GRACE_MINUTES,
  appointmentEndInstant,
  appointmentOutcome,
  appointmentPhase,
  canBookAgain,
  canCancelAppointment,
  canCheckInAppointment,
  canRescheduleAppointment,
  hasAppointmentElapsed,
  isUpcomingAppointment,
} from "@medilink/shared/mobile";

/** 2026-08-14 12:00 Oman = 08:00 UTC. The "now" for most cases below. */
const NOW = new Date("2026-08-14T08:00:00Z");

const appt = (over: Partial<Record<string, string | null>> = {}) => ({
  status: "confirmed",
  slot_date: "2026-08-14",
  slot_start: "09:00",
  slot_end: "09:30",
  ...over,
});

describe("THE REPORTED BUG — a confirmed appointment from 24 July", () => {
  const july24 = appt({ slot_date: "2026-07-24", slot_start: "10:00", slot_end: "10:30" });

  it("is PAST, not Upcoming", () => {
    expect(appointmentPhase(july24, NOW)).toBe("past");
    expect(isUpcomingAppointment(july24, NOW)).toBe(false);
  });

  it("reads as MISSED even though its stored status is still `confirmed`", () => {
    expect(july24.status).toBe("confirmed");
    expect(appointmentOutcome(july24, NOW)).toBe("missed");
  });

  it("offers Book again, and NOT Reschedule/Cancel/Check-in", () => {
    expect(canBookAgain(july24, NOW)).toBe(true);
    expect(canRescheduleAppointment(july24, NOW)).toBe(false);
    expect(canCancelAppointment(july24, NOW)).toBe(false);
    expect(canCheckInAppointment(july24, NOW)).toBe(false);
  });

  it("stays missed for `pending` and `approved` too — any unresolved active status", () => {
    for (const status of ["pending", "approved", "confirmed"]) {
      expect(appointmentOutcome({ ...july24, status }, NOW)).toBe("missed");
    }
  });
});

describe("future appointments are Upcoming", () => {
  it("a confirmed appointment next week", () => {
    const a = appt({ slot_date: "2026-08-21" });
    expect(appointmentPhase(a, NOW)).toBe("upcoming");
    expect(appointmentOutcome(a, NOW)).toBe("scheduled");
  });

  it("later TODAY is upcoming", () => {
    const a = appt({ slot_start: "18:00", slot_end: "18:30" }); // 14:00 UTC, 6h out
    expect(isUpcomingAppointment(a, NOW)).toBe(true);
  });

  it("`approved` is upcoming — it used to fall through to `muted` and land in Past", () => {
    const a = appt({ status: "approved", slot_date: "2026-08-21" });
    expect(appointmentPhase(a, NOW)).toBe("upcoming");
    expect(appointmentOutcome(a, NOW)).toBe("scheduled");
  });

  it("an unrecognised status is treated as active rather than silently hidden", () => {
    const a = appt({ status: "some_future_status", slot_date: "2026-08-21" });
    expect(isUpcomingAppointment(a, NOW)).toBe(true);
  });
});

describe("the grace period is measured from slot_end, in Oman time", () => {
  // Slot ends 09:30 Oman = 05:30 UTC. Grace is 60 min → missed from 06:30 UTC.
  const a = appt();

  it("is still upcoming DURING the appointment", () => {
    expect(hasAppointmentElapsed(a, new Date("2026-08-14T05:15:00Z"))).toBe(false);
    expect(isUpcomingAppointment(a, new Date("2026-08-14T05:15:00Z"))).toBe(true);
  });

  it("is still upcoming just before the grace period ends", () => {
    expect(hasAppointmentElapsed(a, new Date("2026-08-14T06:29:00Z"))).toBe(false);
  });

  it("has elapsed just after the grace period ends", () => {
    expect(hasAppointmentElapsed(a, new Date("2026-08-14T06:31:00Z"))).toBe(true);
    expect(appointmentOutcome(a, new Date("2026-08-14T06:31:00Z"))).toBe("missed");
  });

  it("the grace period is exactly MISSED_GRACE_MINUTES after slot_end", () => {
    const end = appointmentEndInstant(a)!;
    const boundary = new Date(end.getTime() + MISSED_GRACE_MINUTES * 60_000);
    expect(hasAppointmentElapsed(a, new Date(boundary.getTime() - 1_000))).toBe(false);
    expect(hasAppointmentElapsed(a, new Date(boundary.getTime() + 1_000))).toBe(true);
  });

  it("uses OMAN wall clock, not the device zone (the 4-hour trap)", () => {
    // 09:30 Oman is 05:30 UTC. A naive device-local read on a UTC box would treat
    // 09:30 as 09:30 UTC and call this NOT elapsed at 08:00 UTC. It has elapsed.
    expect(appointmentEndInstant(a)!.toISOString()).toBe("2026-08-14T05:30:00.000Z");
    expect(hasAppointmentElapsed(a, NOW)).toBe(true);
  });

  it("falls back to slot_start when slot_end is absent", () => {
    const noEnd = appt({ slot_end: null });
    expect(appointmentEndInstant(noEnd)!.toISOString()).toBe("2026-08-14T05:00:00.000Z");
  });
});

describe("backend-resolved statuses always win over the clock", () => {
  it("cancelled is Past even when the slot is in the FUTURE", () => {
    const a = appt({ status: "cancelled", slot_date: "2026-09-01" });
    expect(appointmentPhase(a, NOW)).toBe("past");
    expect(appointmentOutcome(a, NOW)).toBe("cancelled");
  });

  it("completed is Past and stays `completed`, never re-derived as missed", () => {
    const a = appt({ status: "completed", slot_date: "2026-07-24" });
    expect(appointmentOutcome(a, NOW)).toBe("completed");
  });

  it("an explicit no_show maps to missed", () => {
    expect(appointmentOutcome(appt({ status: "no_show" }), NOW)).toBe("missed");
  });

  it("a cancelled FUTURE appointment appears in Past — it used to appear in neither tab", () => {
    const a = appt({ status: "cancelled", slot_date: "2026-09-01" });
    expect(isUpcomingAppointment(a, NOW)).toBe(false);
    expect(appointmentPhase(a, NOW)).toBe("past");
  });
});

describe("checked-in appointments are never called missed", () => {
  it("during the slot it is in_progress and Upcoming", () => {
    const a = appt({ status: "checked_in" });
    const during = new Date("2026-08-14T05:15:00Z");
    expect(appointmentOutcome(a, during)).toBe("in_progress");
    expect(appointmentPhase(a, during)).toBe("upcoming");
  });

  it("after the slot it is ATTENDED and Past — not missed, not completed", () => {
    const a = appt({ status: "checked_in" });
    const outcome = appointmentOutcome(a, NOW);
    expect(outcome).toBe("attended");
    expect(outcome).not.toBe("missed");
    // Asserting the clinical fact we do NOT have: nothing closes a visit, so claiming
    // "completed" here would fabricate an outcome.
    expect(outcome).not.toBe("completed");
    expect(appointmentPhase(a, NOW)).toBe("past");
  });

  it("an attended appointment does not offer Book again", () => {
    expect(canBookAgain(appt({ status: "checked_in" }), NOW)).toBe(false);
  });
});

describe("action gating is time-aware", () => {
  const future = appt({ slot_date: "2026-08-21" });

  it("a future confirmed appointment allows check-in, reschedule and cancel", () => {
    expect(canCheckInAppointment(future, NOW)).toBe(true);
    expect(canRescheduleAppointment(future, NOW)).toBe(true);
    expect(canCancelAppointment(future, NOW)).toBe(true);
  });

  it("`approved` and `pending` may be moved or cancelled, but not checked in", () => {
    for (const status of ["pending", "approved"]) {
      const a = { ...future, status };
      expect(canRescheduleAppointment(a, NOW)).toBe(true);
      expect(canCancelAppointment(a, NOW)).toBe(true);
      expect(canCheckInAppointment(a, NOW)).toBe(false);
    }
  });

  it("an elapsed appointment allows none of them — this is what let a July row be moved", () => {
    const elapsed = appt({ slot_date: "2026-07-24" });
    expect(canCheckInAppointment(elapsed, NOW)).toBe(false);
    expect(canRescheduleAppointment(elapsed, NOW)).toBe(false);
    expect(canCancelAppointment(elapsed, NOW)).toBe(false);
  });

  it("a cancelled appointment cannot be rescheduled back to life", () => {
    const a = appt({ status: "cancelled", slot_date: "2026-09-01" });
    expect(canRescheduleAppointment(a, NOW)).toBe(false);
    expect(canBookAgain(a, NOW)).toBe(false);
  });
});

describe("unparseable dates never move a real appointment to Past", () => {
  it("mock display-string rows stay upcoming", () => {
    // The mock data layer uses "Wed 18 Jun" rather than ISO.
    const a = appt({ slot_date: "Wed 18 Jun", slot_start: "10:30 AM", slot_end: null });
    expect(appointmentEndInstant(a)).toBeNull();
    expect(hasAppointmentElapsed(a, NOW)).toBe(false);
    expect(isUpcomingAppointment(a, NOW)).toBe(true);
  });

  it("a missing date is not elapsed", () => {
    expect(hasAppointmentElapsed(appt({ slot_date: null }), NOW)).toBe(false);
  });

  it("a missing time is not elapsed", () => {
    expect(hasAppointmentElapsed(appt({ slot_start: null, slot_end: null }), NOW)).toBe(false);
  });

  it("but an unparseable date does NOT override a resolved backend status", () => {
    const a = appt({ slot_date: "Wed 18 Jun", status: "cancelled" });
    expect(appointmentOutcome(a, NOW)).toBe("cancelled");
  });
});

/**
 * The contract between the nightly server sweep and this UI rule.
 *
 * `sweep_missed_appointments()` (migration 20260814000000) transitions
 * confirmed/approved → `no_show` once the slot ended more than p_threshold_minutes ago in
 * Asia/Muscat. These cases pin the two properties that make that safe to switch on:
 *
 *   1. backend `no_show` → UI "Missed" (the DB becomes authoritative, nothing regresses);
 *   2. the DB threshold is never SHORTER than the UI's 60-minute grace, so the two can
 *      never disagree — the UI says Missed first, the DB confirms later.
 */
describe("backend no_show → shared lifecycle → Missed", () => {
  const MIN = 60_000;
  /** Slot ends 2026-08-14 09:30 Oman = 05:30 UTC. */
  const slot = { slot_date: "2026-08-14", slot_start: "09:00", slot_end: "09:30" };
  const END_UTC = new Date("2026-08-14T05:30:00Z").getTime();

  it("a swept row (status no_show) renders as Missed and sits in Past", () => {
    const swept = { ...slot, status: "no_show" };
    expect(appointmentOutcome(swept, NOW)).toBe("missed");
    expect(appointmentPhase(swept, NOW)).toBe("past");
  });

  it("the backend answer is authoritative even before the UI grace elapses", () => {
    // 10 minutes after the slot ends — well inside the 60-minute UI grace. If the DB has
    // already said no_show, the UI must not argue with it and show "Upcoming".
    const justAfter = new Date(END_UTC + 10 * MIN);
    expect(appointmentOutcome({ ...slot, status: "no_show" }, justAfter)).toBe("missed");
    expect(isUpcomingAppointment({ ...slot, status: "no_show" }, justAfter)).toBe(false);
  });

  it("the two rules agree at every point once the DB threshold is >= the UI grace", () => {
    // Before the sweep runs the row is still `confirmed`; after it runs it is `no_show`.
    // The nightly sweep uses 360 minutes, so at every instant PAST the UI grace BOTH the
    // pre-sweep and post-sweep views must read "missed" — the transition is invisible.
    //
    // The grace boundary is EXCLUSIVE (`end + grace < now`), so T+60 exactly is still
    // "scheduled" and "missed" starts at T+60+ε. The first sample is therefore 61, not 60;
    // the boundary instant itself is pinned by the ±1s case in the grace-period block above.
    for (const offset of [61, 120, 359, 360, 361, 1440]) {
      const at = new Date(END_UTC + offset * MIN);
      const preSweep = appointmentOutcome({ ...slot, status: "confirmed" }, at);
      const postSweep = appointmentOutcome({ ...slot, status: "no_show" }, at);
      expect({ offset, preSweep, postSweep }).toEqual({
        offset,
        preSweep: "missed",
        postSweep: "missed",
      });
    }
  });

  it("a sweep threshold shorter than the UI grace would contradict — which the DB refuses", () => {
    // Documents WHY sweep_missed_appointments() raises on p_threshold_minutes < 60.
    // At T+30 the UI still says Upcoming, so a 30-minute DB threshold would produce a row
    // the clinic has written off while the patient still sees it as upcoming.
    const at = new Date(END_UTC + 30 * MIN);
    expect(appointmentOutcome({ ...slot, status: "confirmed" }, at)).toBe("scheduled");
    expect(isUpcomingAppointment({ ...slot, status: "confirmed" }, at)).toBe(true);
  });

  it("the sweep never touches checked_in, so Attended survives it", () => {
    // The sweeper's predicate is status IN ('confirmed','approved'). A checked-in row keeps
    // its status, and the UI keeps calling it Attended rather than Missed.
    expect(appointmentOutcome({ ...slot, status: "checked_in" }, NOW)).toBe("attended");
  });

  it("the sweep never touches pending, so an unpaid booking is not shown as Missed by the DB", () => {
    // Hold/payment expiry owns `pending`. The UI still derives "missed" for display once the
    // slot elapses, but the stored status must remain `pending` for that lifecycle to work.
    const pending = { ...slot, status: "pending" };
    expect(appointmentOutcome(pending, NOW)).toBe("missed"); // display only
    expect(pending.status).toBe("pending"); // stored status untouched by us
  });
});

describe("upcoming and past are exhaustive and mutually exclusive", () => {
  const rows = [
    appt(),
    appt({ status: "pending", slot_date: "2026-08-21" }),
    appt({ status: "approved", slot_date: "2026-08-21" }),
    appt({ status: "checked_in" }),
    appt({ status: "cancelled" }),
    appt({ status: "completed" }),
    appt({ status: "no_show" }),
    appt({ slot_date: "2026-07-24" }),
    appt({ slot_date: "Wed 18 Jun" }),
  ];

  it("every row lands in exactly one tab", () => {
    for (const r of rows) {
      const upcoming = isUpcomingAppointment(r, NOW);
      const past = appointmentPhase(r, NOW) === "past";
      expect(upcoming).toBe(!past);
    }
  });

  it("splitting a list loses nothing", () => {
    const up = rows.filter((r) => isUpcomingAppointment(r, NOW));
    const past = rows.filter((r) => !isUpcomingAppointment(r, NOW));
    expect(up.length + past.length).toBe(rows.length);
  });
});
