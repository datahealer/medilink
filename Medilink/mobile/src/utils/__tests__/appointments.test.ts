import { apptStatusCategory, bookingErrorMessage, hoursUntilAppt, refundTier } from "../appointments";

/**
 * Refund tiers decide how much money a patient gets back on cancellation
 * (design p26). The boundaries are the whole rule, so they are tested exactly —
 * an off-by-one at 24h or 48h is a financial defect, not a cosmetic one.
 */
describe("refundTier", () => {
  it("gives a full refund at or beyond 48 hours", () => {
    expect(refundTier(48).pct).toBe(100);
    expect(refundTier(72).pct).toBe(100);
    expect(refundTier(Number.POSITIVE_INFINITY).pct).toBe(100);
  });

  it("gives 50% inside the 24–48 hour window", () => {
    expect(refundTier(47.9).pct).toBe(50);
    expect(refundTier(24).pct).toBe(50);
  });

  it("gives 10% under 24 hours", () => {
    expect(refundTier(23.9).pct).toBe(10);
    expect(refundTier(0.5).pct).toBe(10);
  });

  it("gives nothing once the appointment has started", () => {
    expect(refundTier(0).pct).toBe(0);
    expect(refundTier(-1).pct).toBe(0);
  });

  it("is exact at each boundary (no gap, no overlap)", () => {
    // Each boundary belongs to the MORE generous tier above it.
    expect(refundTier(48).pct).toBe(100);
    expect(refundTier(47.999).pct).toBe(50);
    expect(refundTier(24).pct).toBe(50);
    expect(refundTier(23.999).pct).toBe(10);
    expect(refundTier(0.001).pct).toBe(10);
    expect(refundTier(0).pct).toBe(0);
  });

  it("pairs every tier with its matching i18n window key", () => {
    // A mismatched key would show "full refund" next to a 10% amount.
    expect(refundTier(72).windowKey).toBe("appointments.policyWindowFull");
    expect(refundTier(30).windowKey).toBe("appointments.policyWindow50");
    expect(refundTier(2).windowKey).toBe("appointments.policyWindow10");
    expect(refundTier(-5).windowKey).toBe("appointments.policyWindowNone");
  });
});

describe("hoursUntilAppt", () => {
  // Fixed clock: this function reads Date.now(), so a real clock makes the test
  // time-of-day dependent and flaky near midnight.
  //
  // NOW is pinned to 10:00 OMAN (= 06:00 UTC, since Oman is UTC+4 with no DST), NOT
  // `new Date("2026-07-28T10:00:00")`. That literal is parsed in the RUNNER's timezone,
  // so the old version of this suite only produced the expected 6/24/-2 hour gaps on a
  // machine set to Oman time — it silently measured something else in CI. Pinning the
  // instant makes every assertion below mean "N hours before an Oman wall clock",
  // which is what the refund tier actually depends on.
  const NOW = Date.UTC(2026, 6, 28, 10 - 4, 0);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("computes hours until a future slot", () => {
    expect(hoursUntilAppt("2026-07-28", "16:00")).toBeCloseTo(6, 5);
    expect(hoursUntilAppt("2026-07-29", "10:00")).toBeCloseTo(24, 5);
  });

  it("returns a negative value once the slot has passed", () => {
    expect(hoursUntilAppt("2026-07-28", "08:00")).toBeCloseTo(-2, 5);
  });

  it("treats a missing date as infinitely far out", () => {
    // Guards the refund path: unknown timing must never imply "no refund".
    expect(hoursUntilAppt(null, "10:00")).toBe(Number.POSITIVE_INFINITY);
    expect(hoursUntilAppt(undefined, "10:00")).toBe(Number.POSITIVE_INFINITY);
  });

  it("treats a non-ISO date as infinitely far out", () => {
    expect(hoursUntilAppt("28/07/2026", "10:00")).toBe(Number.POSITIVE_INFINITY);
  });

  it("defaults a missing start time to midnight", () => {
    expect(hoursUntilAppt("2026-07-28", null)).toBeCloseTo(-10, 5);
  });

  it("accepts a single-digit hour", () => {
    expect(hoursUntilAppt("2026-07-28", "9:30")).toBeCloseTo(-0.5, 5);
  });

  it("composes with refundTier at the 48h boundary", () => {
    // End-to-end of the cancellation rule: slot exactly 48h out ⇒ full refund.
    const hours = hoursUntilAppt("2026-07-30", "10:00");
    expect(refundTier(hours).pct).toBe(100);
  });
});

describe("apptStatusCategory", () => {
  it("categorizes the lifecycle statuses", () => {
    // Only asserting it is stable and total — the concrete tone mapping is a
    // presentation detail covered by apptTone.
    for (const s of ["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show"]) {
      expect(typeof apptStatusCategory(s)).toBe("string");
    }
  });

  it("does not throw on an unknown, null or undefined status", () => {
    // HAMS added `approved` to the enum without MediLink consuming it.
    expect(() => apptStatusCategory("approved")).not.toThrow();
    expect(() => apptStatusCategory(null)).not.toThrow();
    expect(() => apptStatusCategory(undefined)).not.toThrow();
  });
});

/**
 * Booking failure messages (audit 2026-08-11, BUG 1 presentation half).
 *
 * The repository deliberately re-throws the backend's own error CODE verbatim so
 * nothing is swallowed (see bookingFlow.integration.test.ts). That contract is
 * unchanged — this maps those codes to patient-readable text at the very last
 * moment, and must never turn an unknown code into a blank or generic alert.
 */
/**
 * Stand-in for useI18n().t — echoes the key back so assertions read as intent.
 * Cast with `as never` at the call sites (the same escape hatch the push-routing
 * code uses) because the real `t` is typed against the MessageKey union.
 */
function tStub(key: string): string {
  return `t:${key}`;
}

describe("bookingErrorMessage", () => {
  const t = tStub as never;

  it("localizes SLOT_IN_PAST — the new server-side past-slot rejection", () => {
    expect(bookingErrorMessage("SLOT_IN_PAST", t)).toBe("t:booking.errSlotInPast");
  });

  it("localizes both slot-taken codes to the same message", () => {
    expect(bookingErrorMessage("SLOT_ALREADY_BOOKED", t)).toBe("t:booking.errSlotTaken");
    expect(bookingErrorMessage("SLOT_ALREADY_TAKEN", t)).toBe("t:booking.errSlotTaken");
  });

  it("localizes the window and invalid-slot codes", () => {
    expect(bookingErrorMessage("OUTSIDE_BOOKING_WINDOW", t)).toBe("t:booking.errOutsideWindow");
    expect(bookingErrorMessage("INVALID_SLOT", t)).toBe("t:booking.errInvalidSlot");
  });

  it("finds the code even when an Error wrapped it in other text", () => {
    expect(bookingErrorMessage("Error: SLOT_IN_PAST", t)).toBe("t:booking.errSlotInPast");
  });

  it("passes an unmapped backend reason through verbatim, never a generic string", () => {
    // A new server code must stay visible in a bug report rather than being hidden.
    expect(bookingErrorMessage("DOCTOR_UNAVAILABLE", t)).toBe("DOCTOR_UNAVAILABLE");
    expect(bookingErrorMessage("some postgres detail", t)).toBe("some postgres detail");
  });

  it("falls back to a generic message only when there is no reason at all", () => {
    expect(bookingErrorMessage("", t)).toBe("t:errors.unknown");
    expect(bookingErrorMessage(null, t)).toBe("t:errors.unknown");
    expect(bookingErrorMessage(undefined, t)).toBe("t:errors.unknown");
  });
});

/**
 * Oman-anchored appointment timing (audit 2026-08-11, BUG 3 residual).
 *
 * `hoursUntilAppt` feeds `refundTier`, so a timezone error here is a MONEY error: the
 * app previously parsed the slot in the device's zone, and a 1.5–4 hour shift can
 * cross the 24h or 48h refund boundary. The server measures the same cutoff in
 * Asia/Muscat (cancel_appointment_safe / reschedule_appointment_atomic), so a
 * device-local reading made the app promise refunds the server would refuse.
 */
describe("hoursUntilAppt is anchored to Oman, not the device", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /** Freeze the clock at a given Oman wall clock (UTC+4, no DST). */
  function freezeAtOman(y: number, mo: number, d: number, h: number, mi = 0): void {
    jest.useFakeTimers().setSystemTime(Date.UTC(y, mo - 1, d, h - 4, mi));
  }

  it("measures the gap in Oman time regardless of the runner's timezone", () => {
    freezeAtOman(2026, 8, 13, 10, 0);
    // 16:00 Oman on the same day is exactly 6 hours away, everywhere.
    expect(hoursUntilAppt("2026-08-13", "16:00")).toBeCloseTo(6, 5);
    expect(hoursUntilAppt("2026-08-14", "10:00")).toBeCloseTo(24, 5);
    expect(hoursUntilAppt("2026-08-15", "10:00")).toBeCloseTo(48, 5);
  });

  it("keeps the 48h full-refund boundary on the correct side", () => {
    // The defect: read in a UTC server/device the slot appears 4h later, so an
    // appointment 47h away looked like 51h and promised 100% instead of 50%.
    freezeAtOman(2026, 8, 13, 10, 0);
    expect(refundTier(hoursUntilAppt("2026-08-15", "09:00")).pct).toBe(50); // 47h
    expect(refundTier(hoursUntilAppt("2026-08-15", "10:00")).pct).toBe(100); // exactly 48h
  });

  it("keeps the 24h boundary on the correct side", () => {
    freezeAtOman(2026, 8, 13, 10, 0);
    expect(refundTier(hoursUntilAppt("2026-08-14", "09:00")).pct).toBe(10); // 23h
    expect(refundTier(hoursUntilAppt("2026-08-14", "10:00")).pct).toBe(50); // exactly 24h
  });

  it("handles an early-morning Oman slot, which is the PREVIOUS day in UTC", () => {
    // 02:00 Oman on the 14th is 22:00 UTC on the 13th. A naive parse in UTC would
    // place it 4 hours later and mis-tier it.
    freezeAtOman(2026, 8, 13, 23, 0);
    expect(hoursUntilAppt("2026-08-14", "02:00")).toBeCloseTo(3, 5);
  });

  it("still reports a passed slot as negative", () => {
    freezeAtOman(2026, 8, 13, 10, 0);
    expect(hoursUntilAppt("2026-08-13", "08:00")).toBeCloseTo(-2, 5);
  });

  it("falls back to infinity on an unusable DATE — never 'no refund'", () => {
    freezeAtOman(2026, 8, 13, 10, 0);
    expect(hoursUntilAppt("13-08-2026", "10:00")).toBe(Number.POSITIVE_INFINITY);
    expect(hoursUntilAppt(null, "10:00")).toBe(Number.POSITIVE_INFINITY);
    expect(refundTier(hoursUntilAppt(null, "10:00")).pct).toBe(100);
  });

  it("treats an unusable TIME as Oman midnight, matching the missing-time contract", () => {
    // Pre-existing behaviour (see the "defaults a missing start time to midnight"
    // case): an unparseable time is the same as no time. Asserted here so the Oman
    // rewrite is shown to preserve it — midnight is now Oman midnight, not device.
    freezeAtOman(2026, 8, 13, 10, 0);
    expect(hoursUntilAppt("2026-08-13", "not-a-time")).toBeCloseTo(-10, 5);
    expect(hoursUntilAppt("2026-08-13", null)).toBeCloseTo(-10, 5);
  });
});
