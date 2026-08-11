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
  const NOW = new Date("2026-07-28T10:00:00").getTime();

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
