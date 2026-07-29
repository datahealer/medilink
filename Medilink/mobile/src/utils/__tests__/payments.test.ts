import { consultationTotal, feeForType, round3, VAT_RATE } from "@medilink/shared/mobile";

import { payCategory } from "../payments";

/**
 * Money math. This is the highest-consequence pure logic in the app: a rounding
 * regression here changes what a patient is charged, and OMR is quoted to 3 dp
 * (baisa), so half-baisa errors are real money.
 *
 * NOTE the authoritative charge is always server-derived at checkout (BP-4); these
 * helpers drive display and must agree with the server's arithmetic.
 */
describe("round3", () => {
  it("rounds to 3 decimals (baisa precision)", () => {
    expect(round3(12.3456)).toBe(12.346);
    expect(round3(12.3444)).toBe(12.344);
    expect(round3(12)).toBe(12);
  });

  it("resolves binary float drift rather than propagating it", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754.
    expect(round3(0.1 + 0.2)).toBe(0.3);
    // 12.6 * 3 drifts to 37.800000000000004.
    expect(round3(12.6 * 3)).toBe(37.8);
  });

  it("rounds half away from zero at the 4th decimal", () => {
    expect(round3(1.0005)).toBe(1.001);
  });
});

describe("feeForType", () => {
  const fees = { in_person: 12, online: 8 };

  it("selects the fee matching the appointment type", () => {
    expect(feeForType(fees, "in_person")).toBe(12);
    expect(feeForType(fees, "online")).toBe(8);
  });

  it("falls back to in_person for an unknown or missing type", () => {
    expect(feeForType(fees, "walk_in")).toBe(12);
    expect(feeForType(fees, null)).toBe(12);
    expect(feeForType(fees, undefined)).toBe(12);
  });

  it("falls back to online when in_person is absent", () => {
    expect(feeForType({ online: 8 }, "in_person")).toBe(8);
  });

  it("accepts a scalar fees value", () => {
    expect(feeForType(15, "in_person")).toBe(15);
    expect(feeForType("15", "online")).toBe(15);
  });

  it("returns 0 for unusable input instead of NaN", () => {
    // NaN would render as "OMR NaN" and could reach a payment amount.
    expect(feeForType(null)).toBe(0);
    expect(feeForType(undefined)).toBe(0);
    expect(feeForType("abc")).toBe(0);
    expect(feeForType({})).toBe(0);
  });
});

describe("consultationTotal", () => {
  it("applies 5% Oman VAT", () => {
    expect(VAT_RATE).toBe(0.05);
    expect(consultationTotal(12)).toEqual({ fee: 12, vat: 0.6, total: 12.6 });
  });

  it("rounds each component to 3 dp", () => {
    // 12.345 * 0.05 = 0.61725 → 0.617
    expect(consultationTotal(12.345)).toEqual({ fee: 12.345, vat: 0.617, total: 12.962 });
  });

  it("keeps total consistent with fee + vat after rounding", () => {
    for (const fee of [0, 1, 7.777, 12, 12.345, 99.999, 250]) {
      const { fee: f, vat, total } = consultationTotal(fee);
      expect(total).toBe(round3(f + vat));
    }
  });

  it("handles a zero fee", () => {
    expect(consultationTotal(0)).toEqual({ fee: 0, vat: 0, total: 0 });
  });
});

describe("payCategory", () => {
  it("maps a settled payment to success", () => {
    expect(payCategory("paid")).toBe("success");
  });

  it("maps both awaiting states to warning", () => {
    // `unpaid` and `pending` must not look different to a patient — both mean
    // "we don't have your money yet".
    expect(payCategory("pending")).toBe("warning");
    expect(payCategory("unpaid")).toBe("warning");
  });

  it("maps a failure to danger", () => {
    expect(payCategory("failed")).toBe("danger");
  });

  it("maps refunds to a neutral tone (not success, not failure)", () => {
    expect(payCategory("refunded")).toBe("muted");
    expect(payCategory("partial_refund")).toBe("muted");
  });

  it("degrades an unknown or absent status to muted rather than throwing", () => {
    // A new HAMS status must never crash a payments list.
    expect(payCategory("some_future_status")).toBe("muted");
    expect(payCategory(null)).toBe("muted");
    expect(payCategory(undefined)).toBe("muted");
  });
});
