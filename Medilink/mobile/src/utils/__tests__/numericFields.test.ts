import {
  DEFAULT_PHONE_COUNTRY,
  detectPhoneCountry,
  normalizeDigits,
  PHONE_COUNTRIES,
  phoneCountryForDialCode,
  phoneE164,
  phoneInput,
  phoneLocal,
  omanPhoneLocal,
  omanPhoneE164,
} from "@medilink/shared/mobile";

import {
  civilNumberProblem,
  isTrivialDigitSequence,
  omanPhoneProblem,
  phoneProblem,
} from "../validation";

const OM = PHONE_COUNTRIES.OM;
const IN = PHONE_COUNTRIES.IN;

/** Arabic-Indic ٩١٢٣٤٥٦٧ */
const AR_OMAN_LOCAL = "٩١٢٣٤٥٦٧";
/** Arabic-Indic ٩٨٤٥٣٦٧٨١٢ */
const AR_INDIA_LOCAL = "٩٨٤٥٣٦٧٨١٢";

/* ════════════════════════════════════════════════════════════════════════════════════
 * DUMMY-VALUE MATRIX
 * The four values in the middle block are the gap QA reported: they are trivial in a way
 * the original all-identical / strict-run pair could not express.
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("isTrivialDigitSequence — dummy-value matrix", () => {
  const REJECT = [
    ["00000000", "all zeros"],
    ["11111111", "all ones"],
    ["99999999", "all nines"],
    ["12345678", "ascending run"],
    ["87654321", "descending run"],
    // ── the reported gap ──
    ["00000007", "six zeros + 7 (QA-reported)"],
    ["00000001", "six zeros + 1"],
    ["10000000", "1 + seven zeros"],
    ["90000000", "9 + seven zeros (the field's own placeholder)"],
    ["12121212", "period-2 alternation"],
  ] as const;

  it.each(REJECT)("rejects %s (%s)", (value) => {
    expect(isTrivialDigitSequence(value)).toBe(true);
  });

  const ACCEPT = [
    ["91234567", "real Oman mobile"],
    ["85182851", "real stored civil number"],
    ["85269842", "real stored civil number"],
    ["45454556", "real stored civil number — alternates then breaks"],
    ["12345487", "real stored civil number — starts like a run then breaks"],
    ["88521478", "real stored civil number"],
    ["9845367812", "real India mobile (10 digits)"],
    ["24001122", "Oman landline-prefixed number"],
    ["98765000", "five-zero run — under the 6 threshold"],
  ] as const;

  it.each(ACCEPT)("accepts %s (%s)", (value) => {
    expect(isTrivialDigitSequence(value)).toBe(false);
  });

  it("uses an ABSOLUTE run threshold of 6, so a 10-digit number is not over-rejected", () => {
    expect(isTrivialDigitSequence("9000000000")).toBe(true); // nine zeros
    expect(isTrivialDigitSequence("9876500000")).toBe(false); // five zeros
  });

  it("catches the mod-10 wrap that the original strict-step rule missed", () => {
    expect(isTrivialDigitSequence("1234567890")).toBe(true);
    expect(isTrivialDigitSequence("0987654321")).toBe(true);
  });

  it("needs two full periods before calling something alternating", () => {
    // "1212" is a pattern; "121" is too short to be one. (Neither length can reach a real
    // field anyway — the length rule rejects them first — but the helper must not guess.)
    expect(isTrivialDigitSequence("1212")).toBe(true);
    expect(isTrivialDigitSequence("132")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * CIVIL NUMBER — separate from phone, 8 digits, no invented checksum
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("civilNumberProblem", () => {
  it("accepts empty (optional field)", () => {
    expect(civilNumberProblem("")).toBeNull();
  });

  it.each(["85182851", "88521478"])("accepts the real stored value %s", (v) => {
    expect(civilNumberProblem(v)).toBeNull();
  });

  it.each(["00000000", "00000007", "00000001", "10000000", "12121212", "12345678", "87654321"])(
    "reports %s as trivial, not as a format error",
    (v) => {
      expect(civilNumberProblem(v)).toBe("trivial");
    }
  );

  it.each([
    ["8518285", "too short"],
    ["851828511", "too long"],
    ["8518285a", "letters"],
    ["85182#51", "symbols"],
    ["8518 2851", "spaces"],
  ])("reports %s (%s) as a format error", (v) => {
    expect(civilNumberProblem(v)).toBe("format");
  });

  it("grandfathers a stored dummy so an unrelated profile edit is not blocked", () => {
    expect(civilNumberProblem("00000007", { grandfathered: true })).toBeNull();
    // …but the length rule always applies, even grandfathered.
    expect(civilNumberProblem("123", { grandfathered: true })).toBe("format");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * COUNTRY REGISTRY + DETECTION
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("phone country registry", () => {
  it("defaults to Oman — production behaviour is unchanged", () => {
    expect(DEFAULT_PHONE_COUNTRY.iso).toBe("OM");
    expect(OM.localLength).toBe(8);
    expect(IN.localLength).toBe(10);
  });

  it("resolves a country from either dial-code spelling", () => {
    expect(phoneCountryForDialCode("+968")?.iso).toBe("OM");
    expect(phoneCountryForDialCode("968")?.iso).toBe("OM");
    expect(phoneCountryForDialCode("+91")?.iso).toBe("IN");
    expect(phoneCountryForDialCode("+1")).toBeNull();
  });

  it("detects by calling code AND total length, so the two cannot collide", () => {
    expect(detectPhoneCountry("+96891234567")?.iso).toBe("OM");
    expect(detectPhoneCountry("+919845367812")?.iso).toBe("IN");
    expect(detectPhoneCountry("96891234567")?.iso).toBe("OM"); // bare, no plus
  });

  it("returns null for a bare local number — it belongs to no country on its own", () => {
    expect(detectPhoneCountry("91234567")).toBeNull();
    expect(detectPhoneCountry("9845367812")).toBeNull();
  });

  it("returns null for the malformed +91 rows in production rather than guessing", () => {
    expect(detectPhoneCountry("+9198765432")).toBeNull(); // 91 + 9
    expect(detectPhoneCountry("+9198453678121")).toBeNull(); // 91 + 11
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * G2 — THE CORRUPTION BUG. An Indian number must never become an Oman number.
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("G2 — +91 must never be reinterpreted as +968", () => {
  const INDIA_E164 = "+919845367812";

  it("REGRESSION: omanPhoneLocal no longer truncates a foreign number to its last 8 digits", () => {
    // Was "76543210" — which then validated clean and saved as +96876543210.
    expect(omanPhoneLocal(INDIA_E164)).toBe("");
    expect(omanPhoneE164(INDIA_E164)).toBeNull();
  });

  it("loads an Indian number as its correct 10 local digits", () => {
    const detected = detectPhoneCountry(INDIA_E164);
    expect(detected?.iso).toBe("IN");
    expect(phoneLocal(INDIA_E164, detected!)).toBe("9845367812");
  });

  it("round-trips an Indian number byte-for-byte", () => {
    const detected = detectPhoneCountry(INDIA_E164)!;
    expect(phoneE164(phoneLocal(INDIA_E164, detected), detected)).toBe(INDIA_E164);
  });

  it("round-trips an Oman number byte-for-byte (unchanged behaviour)", () => {
    const stored = "+96891234567";
    const detected = detectPhoneCountry(stored)!;
    expect(detected.iso).toBe("OM");
    expect(phoneE164(phoneLocal(stored, detected), detected)).toBe(stored);
  });

  it("never yields a +968 value from any Indian input", () => {
    for (const input of ["+919845367812", "919845367812", "+91 98765 43210"]) {
      const detected = detectPhoneCountry(input);
      const written = detected ? phoneE164(phoneLocal(input, detected), detected) : null;
      expect(written ?? "").not.toContain("+968");
    }
  });

  it("phoneLocal NEVER truncates — a wrong-length value yields empty, not a plausible number", () => {
    expect(phoneLocal("+9198765432", OM)).toBe("");
    expect(phoneLocal("+919845367812", OM)).toBe("");
    expect(phoneLocal("+96891234567", IN)).toBe("");
  });

  it("refuses a MALFORMED foreign number instead of displaying it truncated", () => {
    // The 4 real +91 rows with the wrong digit count. detectPhoneCountry reports null for
    // them, so without the explicit guard these fell through to Oman's trailing-8 reader.
    expect(omanPhoneLocal("+9198765432")).toBe(""); // 91 + 9
    expect(omanPhoneLocal("+9198453678121")).toBe(""); // 91 + 11
  });

  it("but still accepts a bare Oman number that merely begins with 91", () => {
    // The guard must not misfire: no leading "+", and 8 digits is Oman-local-shaped.
    expect(omanPhoneLocal("91234567")).toBe("91234567");
    expect(omanPhoneProblem("91234567")).toBeNull();
  });

  it("preserves the legacy Oman emergency-contact shapes it always handled", () => {
    expect(omanPhoneLocal("Ali · +968 9111 1111")).toBe("91111111");
    expect(omanPhoneLocal("91234567")).toBe("91234567");
    expect(omanPhoneLocal("+96891234567")).toBe("91234567");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * COUNTRY-AWARE VALIDATION — Oman is not weakened to let India pass
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("phoneProblem — country-aware", () => {
  it("accepts a valid Oman number on Oman and a valid India number on India", () => {
    expect(phoneProblem("91234567", OM)).toBeNull();
    expect(phoneProblem("9845367812", IN)).toBeNull();
  });

  it("REJECTS a 10-digit Indian number while the field is on Oman — never truncates it", () => {
    expect(phoneProblem("9845367812", OM)).toBe("format");
  });

  it("REJECTS an 8-digit Oman number while the field is on India", () => {
    expect(phoneProblem("91234567", IN)).toBe("format");
  });

  it("keeps Oman at exactly 8 digits — supporting India loosened nothing", () => {
    expect(phoneProblem("9123456", OM)).toBe("format"); // 7
    expect(phoneProblem("912345678", OM)).toBe("format"); // 9
    expect(omanPhoneProblem("91234567")).toBeNull();
  });

  it.each(["00000000", "00000007", "00000001", "10000000", "90000000", "12121212", "12345678", "87654321"])(
    "rejects dummy %s on Oman",
    (v) => {
      expect(phoneProblem(v, OM)).toBe("trivial");
    }
  );

  it("applies dummy rules on India too", () => {
    expect(phoneProblem("0000000000", IN)).toBe("trivial");
    expect(phoneProblem("1234567890", IN)).toBe("trivial");
  });

  it.each([
    ["9123456a", "letters"],
    ["9123*567", "symbols"],
    ["9123 4567", "spaces"],
  ])("rejects %s (%s) as a format error", (v) => {
    expect(phoneProblem(v, OM)).toBe("format");
  });

  it("accepts empty — the field is optional", () => {
    expect(phoneProblem("", OM)).toBeNull();
    expect(phoneProblem("", IN)).toBeNull();
  });

  it("grandfathers a stored dummy (the five 90000000 rows) but never the length rule", () => {
    expect(phoneProblem("90000000", OM, { grandfathered: true })).toBeNull();
    expect(phoneProblem("900", OM, { grandfathered: true })).toBe("format");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * INPUT SANITISATION — cap follows the country; Arabic-Indic folded everywhere
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("phoneInput — keystroke sanitiser", () => {
  it("caps at the COUNTRY length, not Oman's 8 always", () => {
    expect(phoneInput("98453678129999", IN)).toBe("9845367812");
    expect(phoneInput("9123456789", OM)).toBe("91234567");
  });

  it("strips the country's own dial code from a paste", () => {
    expect(phoneInput("+96891234567", OM)).toBe("91234567");
    expect(phoneInput("+919845367812", IN)).toBe("9845367812");
  });

  it("drops every non-digit a soft keyboard or clipboard can offer", () => {
    expect(phoneInput("9#1;2*3+4a5 6 7", OM)).toBe("91234567");
  });

  it("folds Arabic-Indic digits rather than discarding them", () => {
    expect(phoneInput(AR_OMAN_LOCAL, OM)).toBe("91234567");
    expect(phoneInput(AR_INDIA_LOCAL, IN)).toBe("9845367812");
  });

  it("keeps a partial number while typing", () => {
    expect(phoneInput("9", OM)).toBe("9");
  });
});

describe("normalizeDigits — one folding rule for every numeric field (QA G5)", () => {
  it("folds Arabic-Indic digits for civil number and OTP, not just phone", () => {
    expect(normalizeDigits(AR_OMAN_LOCAL)).toBe("91234567");
    expect(normalizeDigits("٠٤٢٣١٨")).toBe("042318"); // OTP ٠٤٢٣١٨
  });

  it("strips non-digits", () => {
    expect(normalizeDigits("04-23 18")).toBe("042318");
    expect(normalizeDigits("abc")).toBe("");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * OTP — numeric + length ONLY. Dummy rules must never apply.
 * ══════════════════════════════════════════════════════════════════════════════════ */
describe("OTP validation policy", () => {
  const OTP_LENGTH = 6;
  const otpValid = (raw: string) => {
    const digits = normalizeDigits(raw);
    return digits.length === OTP_LENGTH;
  };

  it("accepts 000000 and 123456 — server-generated codes are legitimate", () => {
    expect(otpValid("000000")).toBe(true);
    expect(otpValid("123456")).toBe(true);
    // Proof the dummy rule WOULD have rejected them, so its absence here is deliberate.
    expect(isTrivialDigitSequence("000000")).toBe(true);
    expect(isTrivialDigitSequence("123456")).toBe(true);
  });

  it("accepts a normal code and folds Arabic-Indic input", () => {
    expect(otpValid("042318")).toBe(true);
    expect(otpValid("٠٤٢٣١٨")).toBe(true);
  });

  it("rejects wrong length and non-numeric", () => {
    expect(otpValid("04231")).toBe(false);
    expect(otpValid("0423188")).toBe(false);
    expect(otpValid("04231a")).toBe(false);
  });
});
