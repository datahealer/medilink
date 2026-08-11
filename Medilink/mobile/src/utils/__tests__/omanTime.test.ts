/**
 * Oman (Asia/Muscat) business-date handling — regression suite for the booking
 * timezone bug (audit 2026-08-11, BUG 3).
 *
 * THE BUG: the booking grid keyed days with `toISOString()` (UTC) but LABELLED them
 * with `getDate()` (device local), and the database derived "today" from
 * `CURRENT_DATE` (UTC). Oman is UTC+4, so between 00:00 and 04:00 Oman time all
 * three disagreed: the chip rendered one date and the availability query asked for
 * the previous one.
 *
 * Every case below pins an exact instant rather than reading the wall clock, so the
 * suite behaves identically in CI, in Muscat and in a UTC container. The four
 * required boundary times (23:30 / 00:30 / 03:30 / 04:30 Oman) are covered
 * explicitly because 00:30 and 03:30 are the two that were broken.
 *
 * The module under test lives in `shared/` so mobile AND web consume one
 * implementation; mobile is the only workspace with a Jest runner, so its tests
 * live here (same convention as safeNext.test.ts).
 */
import {
  OMAN_TIME_ZONE,
  OMAN_UTC_OFFSET_MINUTES,
  isSlotInPast,
  omanBookingDays,
  omanMinutesNow,
  omanToday,
  omanTodayParts,
  omanWallClockToInstant,
  slotStartMinutes,
} from "@medilink/shared/mobile";

/** Build the UTC instant that corresponds to a given Oman wall-clock time (UTC+4). */
function atOman(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 4, minute));
}

describe("Oman timezone constants", () => {
  it("targets Asia/Muscat at UTC+4, matching the database's AT TIME ZONE", () => {
    expect(OMAN_TIME_ZONE).toBe("Asia/Muscat");
    expect(OMAN_UTC_OFFSET_MINUTES).toBe(240);
  });
});

describe("omanToday — the midnight boundary that was broken", () => {
  // 23:30 Oman on the 11th === 19:30 UTC on the 11th. UTC and Oman agree here.
  it("23:30 Oman is still the same day (UTC agrees)", () => {
    const now = atOman(2026, 8, 11, 23, 30);
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-11"); // UTC
    expect(omanToday(now)).toBe("2026-08-11");
  });

  // 00:30 Oman on the 12th === 20:30 UTC on the 11th. THIS is the bug window.
  it("00:30 Oman is the NEW day even though UTC still says yesterday", () => {
    const now = atOman(2026, 8, 12, 0, 30);
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-11"); // UTC: yesterday
    expect(omanToday(now)).toBe("2026-08-12"); // Oman: today
  });

  // 03:30 Oman on the 12th === 23:30 UTC on the 11th. Last minute of the bug window.
  it("03:30 Oman is the new day; UTC only catches up at 04:00 Oman", () => {
    const now = atOman(2026, 8, 12, 3, 30);
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-11");
    expect(omanToday(now)).toBe("2026-08-12");
  });

  // 04:30 Oman on the 12th === 00:30 UTC on the 12th. Both agree again.
  it("04:30 Oman is the new day and UTC has caught up", () => {
    const now = atOman(2026, 8, 12, 4, 30);
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(omanToday(now)).toBe("2026-08-12");
  });

  it("rolls the month and the year at Oman midnight, not UTC midnight", () => {
    expect(omanToday(atOman(2026, 9, 1, 0, 15))).toBe("2026-09-01");
    expect(omanToday(atOman(2027, 1, 1, 2, 0))).toBe("2027-01-01");
    // …and the instant 30 minutes earlier is still the old year in Oman.
    expect(omanToday(atOman(2026, 12, 31, 23, 30))).toBe("2026-12-31");
  });

  it("reads the frozen system clock when no instant is passed (the real call site)", () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(atOman(2026, 8, 12, 1, 0)); // inside the bug window
      expect(omanToday()).toBe("2026-08-12");
      expect(omanTodayParts().dayOfMonth).toBe(12);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("omanMinutesNow", () => {
  it("counts minutes from Oman midnight, not UTC midnight", () => {
    expect(omanMinutesNow(atOman(2026, 8, 12, 0, 30))).toBe(30);
    expect(omanMinutesNow(atOman(2026, 8, 12, 3, 30))).toBe(3 * 60 + 30);
    expect(omanMinutesNow(atOman(2026, 8, 11, 23, 30))).toBe(23 * 60 + 30);
    expect(omanMinutesNow(atOman(2026, 8, 11, 15, 0))).toBe(15 * 60);
  });
});

describe("omanBookingDays — the day strip", () => {
  it("starts at the OMAN today, not the UTC one, inside the bug window", () => {
    const days = omanBookingDays(7, atOman(2026, 8, 12, 0, 30));
    expect(days).toHaveLength(7);
    expect(days[0]!.key).toBe("2026-08-12"); // was "2026-08-11" before the fix
    expect(days[6]!.key).toBe("2026-08-18");
  });

  it("keeps the key and the label parts on the SAME date — the actual defect", () => {
    // The old code produced key=toISOString() (UTC) and label=getDate() (local), so a
    // chip could read "12" while querying "…-11". Here both come from one clock.
    for (const now of [
      atOman(2026, 8, 11, 23, 30),
      atOman(2026, 8, 12, 0, 30),
      atOman(2026, 8, 12, 3, 30),
      atOman(2026, 8, 12, 4, 30),
    ]) {
      for (const day of omanBookingDays(7, now)) {
        const fromKey = new Date(`${day.key}T00:00:00Z`);
        expect(day.dayOfMonth).toBe(fromKey.getUTCDate());
        expect(day.monthIndex).toBe(fromKey.getUTCMonth());
        expect(day.year).toBe(fromKey.getUTCFullYear());
        expect(day.weekday).toBe(fromKey.getUTCDay());
      }
    }
  });

  it("produces consecutive days across a month boundary", () => {
    const days = omanBookingDays(3, atOman(2026, 8, 30, 12, 0));
    expect(days.map((d) => d.key)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  it("today vs tomorrow are distinct and ordered", () => {
    const days = omanBookingDays(2, atOman(2026, 8, 11, 15, 0));
    expect(days[0]!.key).toBe("2026-08-11");
    expect(days[1]!.key).toBe("2026-08-12");
    expect(days[0]!.key < days[1]!.key).toBe(true);
  });
});

describe("slotStartMinutes", () => {
  it("parses HH:mm and HH:mm:ss", () => {
    expect(slotStartMinutes("09:00")).toBe(540);
    expect(slotStartMinutes("09:30:00")).toBe(570);
    expect(slotStartMinutes("00:00")).toBe(0);
    expect(slotStartMinutes("23:59")).toBe(1439);
  });

  it("returns NaN for junk rather than a misleading 0", () => {
    // Regression: `Number("")` is 0, so a naive split-and-Number parse reported an
    // empty slot as 00:00 — i.e. always elapsed — silently hiding it from the picker.
    expect(Number.isNaN(slotStartMinutes("not-a-time"))).toBe(true);
    expect(Number.isNaN(slotStartMinutes(""))).toBe(true);
    expect(Number.isNaN(slotStartMinutes("   "))).toBe(true);
    expect(Number.isNaN(slotStartMinutes("24:00"))).toBe(true);
    expect(Number.isNaN(slotStartMinutes("09:70"))).toBe(true);
    expect(Number.isNaN(slotStartMinutes("09"))).toBe(true);
  });
});

describe("isSlotInPast — BUG 1 slot eligibility (client mirror of the server rule)", () => {
  // "Now" is 15:00 Oman on 2026-08-11 for this block.
  const now = atOman(2026, 8, 11, 15, 0);

  it("today's already-elapsed slot is past", () => {
    expect(isSlotInPast("2026-08-11", "09:00", now)).toBe(true);
    expect(isSlotInPast("2026-08-11", "14:59", now)).toBe(true);
  });

  it("today's future slot is NOT past", () => {
    expect(isSlotInPast("2026-08-11", "15:01", now)).toBe(false);
    expect(isSlotInPast("2026-08-11", "18:30", now)).toBe(false);
  });

  it("a slot starting exactly now counts as past (matches the server's <=)", () => {
    expect(isSlotInPast("2026-08-11", "15:00", now)).toBe(true);
  });

  it("tomorrow's slot is never past, even at an early hour", () => {
    expect(isSlotInPast("2026-08-12", "00:30", now)).toBe(false);
    expect(isSlotInPast("2026-08-12", "09:00", now)).toBe(false);
  });

  it("a slot on a previous date is past regardless of time of day", () => {
    expect(isSlotInPast("2026-08-10", "23:30", now)).toBe(true);
  });

  it("uses OMAN today inside the bug window, so early-morning slots survive", () => {
    // 00:30 Oman on the 12th. UTC still says the 11th; under the old UTC rule a
    // 09:00 slot on the 12th would have been compared against the 11th.
    const early = atOman(2026, 8, 12, 0, 30);
    expect(isSlotInPast("2026-08-12", "09:00", early)).toBe(false);
    expect(isSlotInPast("2026-08-12", "00:15", early)).toBe(true);
    expect(isSlotInPast("2026-08-11", "23:00", early)).toBe(true);
  });

  it("defers to the server on an unparseable time rather than hiding the slot", () => {
    expect(isSlotInPast("2026-08-11", "garbage", now)).toBe(false);
  });
});

describe('omanWallClockToInstant — slot wall clock to a real instant', () => {
  it('resolves an Oman wall clock to the correct UTC instant', () => {
    // 09:00 Oman == 05:00 UTC (UTC+4, no DST).
    expect(omanWallClockToInstant('2026-08-13', '09:00')!.toISOString())
      .toBe('2026-08-13T05:00:00.000Z');
    expect(omanWallClockToInstant('2026-08-13', '16:30')!.toISOString())
      .toBe('2026-08-13T12:30:00.000Z');
  });

  it('rolls back across the date boundary for an early-morning Oman slot', () => {
    // 02:00 Oman on the 14th is 22:00 UTC on the 13th — the case a naive parse got wrong.
    expect(omanWallClockToInstant('2026-08-14', '02:00')!.toISOString())
      .toBe('2026-08-13T22:00:00.000Z');
    expect(omanWallClockToInstant('2026-01-01', '00:00')!.toISOString())
      .toBe('2025-12-31T20:00:00.000Z');
  });

  it('accepts HH:mm:ss as stored by Postgres TIME', () => {
    expect(omanWallClockToInstant('2026-08-13', '09:30:00')!.toISOString())
      .toBe('2026-08-13T05:30:00.000Z');
  });

  it('round-trips: the instant maps back to the same Oman calendar date', () => {
    for (const t of ['00:00', '03:59', '04:00', '12:00', '23:59']) {
      const inst = omanWallClockToInstant('2026-08-14', t)!;
      expect(omanToday(inst)).toBe('2026-08-14');
    }
  });

  it('returns null rather than a plausible-but-wrong instant', () => {
    expect(omanWallClockToInstant('14-08-2026', '09:00')).toBeNull();
    expect(omanWallClockToInstant('2026-08-14', 'nope')).toBeNull();
    expect(omanWallClockToInstant('', '09:00')).toBeNull();
  });
});
