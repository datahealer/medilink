import fs from "fs";
import path from "path";
import {
  CIVIL_NUMBER_LENGTH,
  civilNumberProblem,
  extractOmanLocalPhone,
  isTrivialDigitSequence,
  isValidCivilNumber,
  isValidDob,
  isValidName,
  isValidOmanPhone,
  omanPhoneProblem,
  phoneProblem,
  signInSchema,
  signUpSchema,
} from "../validation";
import { PHONE_COUNTRIES } from "@medilink/shared/mobile";

/** Zod messages are injected from i18n; echo the key so assertions stay readable. */
const t = ((key: string) => key) as unknown as Parameters<typeof signInSchema>[0];

describe("isValidCivilNumber", () => {
  it("accepts exactly 8 digits", () => {
    // Sample changed from "12345678" to a non-sequential number: the length rule is what
    // this case asserts, and 12345678 is now separately rejected as placeholder input
    // (QA MED-012, covered below). The assertion itself is unchanged.
    expect(CIVIL_NUMBER_LENGTH).toBe(8);
    expect(isValidCivilNumber("50219384")).toBe(true);
  });

  it("treats empty as valid (the field is optional)", () => {
    expect(isValidCivilNumber("")).toBe(true);
    expect(isValidCivilNumber("   ")).toBe(true);
  });

  it("rejects wrong length or non-digits", () => {
    expect(isValidCivilNumber("1234567")).toBe(false);
    expect(isValidCivilNumber("123456789")).toBe(false);
    expect(isValidCivilNumber("1234567a")).toBe(false);
    expect(isValidCivilNumber("1234 5678")).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidCivilNumber("  50219384  ")).toBe(true);
  });
});

describe("isValidOmanPhone", () => {
  it("accepts an 8-digit local number", () => {
    // Fixture changed from "91111111" (QA G3): a run of seven identical digits is now
    // rejected as placeholder input, so it no longer represents an ordinary number here.
    expect(isValidOmanPhone("50219384")).toBe(true);
  });

  it("rejects a long single-digit run, which the fixture above used to be (QA G3)", () => {
    expect(isValidOmanPhone("91111111")).toBe(false);
  });

  it("treats empty as valid (optional field)", () => {
    expect(isValidOmanPhone("")).toBe(true);
  });

  it("rejects a number carrying the country code (shown separately in the UI)", () => {
    expect(isValidOmanPhone("+96891111111")).toBe(false);
    expect(isValidOmanPhone("96891111111")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidOmanPhone("9111111")).toBe(false);
    expect(isValidOmanPhone("911111111")).toBe(false);
  });
});

describe("extractOmanLocalPhone", () => {
  it("pulls the local number out of a legacy combined string", () => {
    // QA #3 backward-compat: emergency contacts were stored as "Name · +968 …".
    expect(extractOmanLocalPhone("Aisha · +968 9111 1111")).toBe("91111111");
  });

  it("strips a leading 968 country code", () => {
    expect(extractOmanLocalPhone("+968 91111111")).toBe("91111111");
    expect(extractOmanLocalPhone("96891111111")).toBe("91111111");
  });

  it("passes a bare 8-digit number through", () => {
    expect(extractOmanLocalPhone("91111111")).toBe("91111111");
  });

  it("returns empty when no plausible number exists (never junk)", () => {
    expect(extractOmanLocalPhone("Aisha Al Harthy")).toBe("");
    expect(extractOmanLocalPhone("")).toBe("");
    expect(extractOmanLocalPhone("12345")).toBe("");
  });

  it("keeps the last 8 digits of an over-long string", () => {
    expect(extractOmanLocalPhone("00968912345678")).toBe("12345678");
  });
});

describe("isValidDob", () => {
  const NOW = new Date("2026-07-28T10:00:00Z").getTime();
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("accepts a real past date", () => {
    expect(isValidDob("1990-05-14")).toBe(true);
  });

  it("treats empty as valid (optional field)", () => {
    expect(isValidDob("")).toBe(true);
  });

  it("rejects a future date", () => {
    expect(isValidDob("2027-01-01")).toBe(false);
  });

  it("rejects a calendar-invalid date that matches the pattern", () => {
    // The regex alone would pass these; the round-trip check is what rejects them.
    expect(isValidDob("2026-02-31")).toBe(false);
    expect(isValidDob("2026-13-01")).toBe(false);
    expect(isValidDob("2025-02-29")).toBe(false); // 2025 is not a leap year
  });

  it("accepts a real leap day", () => {
    expect(isValidDob("2024-02-29")).toBe(true);
  });

  it("rejects a wrongly formatted date", () => {
    expect(isValidDob("14/05/1990")).toBe(false);
    expect(isValidDob("1990-5-14")).toBe(false);
  });
});

describe("isValidName", () => {
  it("requires at least 2 non-space characters", () => {
    expect(isValidName("Al")).toBe(true);
    expect(isValidName("A")).toBe(false);
    expect(isValidName(" ")).toBe(false);
    expect(isValidName("  A  ")).toBe(false);
  });

  it("accepts an Arabic name", () => {
    expect(isValidName("عائشة")).toBe(true);
  });
});

describe("signInSchema", () => {
  it("accepts a valid credential pair", () => {
    const r = signInSchema(t).safeParse({
      email: "a@b.com",
      password: "Abcdef1!",
      remember: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const r = signInSchema(t).safeParse({
      email: "not-an-email",
      password: "Abcdef1!",
      remember: false,
    });
    expect(r.success).toBe(false);
  });

  it("does not apply the signup password policy to sign-in", () => {
    // Existing accounts may predate the policy; sign-in must only require non-empty.
    const r = signInSchema(t).safeParse({ email: "a@b.com", password: "old", remember: false });
    expect(r.success).toBe(true);
  });
});

describe("signUpSchema — password policy mirrors the backend", () => {
  const base = {
    fullName: "Aisha Al Harthy",
    email: "a@b.com",
    phone: "91111111",
    acceptTerms: true as const,
  };

  it("accepts a submission meeting every rule", () => {
    const r = signUpSchema(t).safeParse({ ...base, password: "Abcdef1!" });
    expect(r.success).toBe(true);
  });

  it.each([
    ["too short", "Ab1!"],
    ["no uppercase", "abcdef1!"],
    ["no lowercase", "ABCDEF1!"],
    ["no number", "Abcdefg!"],
    ["no special character", "Abcdefg1"],
  ])("rejects a password with %s", (_label, password) => {
    // Client policy must match the backend's `validatePassword`, otherwise signup
    // fails server-side after the user has already submitted.
    const r = signUpSchema(t).safeParse({ ...base, password });
    expect(r.success).toBe(false);
  });

  it("requires the terms checkbox to be explicitly true", () => {
    expect(signUpSchema(t).safeParse({ ...base, acceptTerms: false, password: "Abcdef1!" }).success).toBe(false);
  });

  it("applies a COARSE length gate — the per-country rule lives in the screen", () => {
    // BEHAVIOUR SPLIT (multi-country phone entry). The schema is built once at mount and
    // cannot see the country the user picks at runtime, so it now enforces only the bounds
    // spanning every supported country (8 … 11 digits). The EXACT per-country length is
    // enforced by `phoneProblem(value, country)` in sign-up.tsx — the same function
    // edit-profile has always used, not a second validator.
    //
    // Below the floor and above the ceiling are still rejected here.
    expect(signUpSchema(t).safeParse({ ...base, phone: "9123456", password: "Abcdef1!" }).success).toBe(false);
    expect(signUpSchema(t).safeParse({ ...base, phone: "123456789012", password: "Abcdef1!" }).success).toBe(false);
    // 9 digits is now in-range for the schema (Australia is 9) …
    expect(signUpSchema(t).safeParse({ ...base, phone: "912345678", password: "Abcdef1!" }).success).toBe(true);
  });

  it("…and 9 digits is STILL rejected for Oman by the rule that now owns it", () => {
    // The guarantee did not weaken, it moved. This is the check sign-up.tsx runs and gates
    // submit on, so a 9-digit Oman number cannot be submitted.
    expect(phoneProblem("912345678", PHONE_COUNTRIES.OM)).toBe("format");
    expect(phoneProblem("91234567", PHONE_COUNTRIES.OM)).toBeNull();
    // …and the screen genuinely wires it, rather than merely colouring the field.
    const signUp = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "app", "auth", "sign-up.tsx"),
      "utf8"
    );
    expect(signUp).toMatch(/phoneProblem\(phoneValue, country\)/);
    expect(signUp).toMatch(/if \(phoneProblem\(values\.phone, country\)\) return;/);
  });

  it("ACCEPTS a pasted full E.164 number by dropping its country code (QA MED-007)", () => {
    // BEHAVIOUR CHANGE: this used to be rejected, because the old `\D`-strip transform left
    // "96891111111" (11 digits). Rejecting a correct number purely for including its own
    // country code was user-hostile, and PhoneField now renders +968 as a visible prefix —
    // so a paste is normalised to the local digits instead of erroring.
    const r = signUpSchema(t).safeParse({ ...base, phone: "+96891111111", password: "Abcdef1!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("91111111");
  });
});

/**
 * Trivial/dummy numeric identifiers (QA MED-012 + MED-013).
 *
 * `00000000` satisfied both the civil-number and the phone rule because each only asked
 * for "exactly 8 digits". One shared rule now rejects placeholder input, and the two call
 * sites report it with their own message.
 */
describe("isTrivialDigitSequence", () => {
  it("rejects every all-identical run", () => {
    for (let d = 0; d <= 9; d++) {
      expect(isTrivialDigitSequence(String(d).repeat(8))).toBe(true);
    }
  });

  it("rejects strict ascending and descending runs", () => {
    expect(isTrivialDigitSequence("12345678")).toBe(true);
    expect(isTrivialDigitSequence("87654321")).toBe(true);
    expect(isTrivialDigitSequence("23456789")).toBe(true);
  });

  it("accepts ordinary numbers, including ones that merely start in sequence", () => {
    expect(isTrivialDigitSequence("91234567")).toBe(false);
    expect(isTrivialDigitSequence("12345679")).toBe(false); // breaks at the last digit
    expect(isTrivialDigitSequence("50219384")).toBe(false);
  });

  it("now rejects a long single-digit run — the 00000007 class (QA G3)", () => {
    // "11111112" was previously asserted to be acceptable ("nearly-uniform, still real").
    // That judgement is superseded: seven identical digits is the same shape as the
    // 00000007 value QA reported, and both are now rejected by the approved run rule.
    expect(isTrivialDigitSequence("11111112")).toBe(true);
    expect(isTrivialDigitSequence("00000007")).toBe(true);
  });
});

describe("civilNumberProblem — MED-012", () => {
  it("rejects 00000000 and every other repeated digit", () => {
    expect(civilNumberProblem("00000000")).toBe("trivial");
    expect(civilNumberProblem("11111111")).toBe("trivial");
    expect(civilNumberProblem("99999999")).toBe("trivial");
    expect(isValidCivilNumber("00000000")).toBe(false);
  });

  it("rejects obvious sequences", () => {
    expect(civilNumberProblem("12345678")).toBe("trivial");
    expect(civilNumberProblem("87654321")).toBe("trivial");
  });

  it("still accepts a real 8-digit civil number", () => {
    expect(civilNumberProblem("12345679")).toBeNull();
    expect(civilNumberProblem("50219384")).toBeNull();
    expect(isValidCivilNumber("50219384")).toBe(true);
  });

  it("keeps the field optional and still reports wrong shapes as 'format'", () => {
    expect(civilNumberProblem("")).toBeNull();
    expect(civilNumberProblem("   ")).toBeNull();
    expect(civilNumberProblem("1234567")).toBe("format");
    expect(civilNumberProblem("1234567a")).toBe("format");
  });

  it("distinguishes the two problems so the message can differ", () => {
    // "Enter 8 digits" is useless advice to someone who typed exactly 8 digits.
    expect(civilNumberProblem("1234567")).not.toBe(civilNumberProblem("00000000"));
  });
});

describe("omanPhoneProblem — MED-013", () => {
  it("rejects 00000000 and other repeated-digit dummies", () => {
    expect(omanPhoneProblem("00000000")).toBe("trivial");
    expect(omanPhoneProblem("99999999")).toBe("trivial");
    expect(isValidOmanPhone("00000000")).toBe(false);
  });

  it("rejects obvious sequences", () => {
    expect(omanPhoneProblem("12345678")).toBe("trivial");
  });

  it("accepts real Oman numbers, including the non-9 prefixes present in live data", () => {
    // Deliberately NOT restricted to /^[79]/ — production rows carry leading 2 (landline),
    // 5 and 8, and this field also backs the emergency contact. See the rationale block
    // on omanPhoneProblem: enforcing a prefix would reproduce the MED-007 save blocker.
    expect(omanPhoneProblem("91234567")).toBeNull();
    expect(omanPhoneProblem("71234567")).toBeNull();
    expect(omanPhoneProblem("24567890")).toBeNull();
    expect(omanPhoneProblem("87654322")).toBeNull();
  });

  it("keeps the MED-007 shape rules: optional, exactly 8 digits, no symbols", () => {
    expect(omanPhoneProblem("")).toBeNull();
    expect(omanPhoneProblem("9123456")).toBe("format");
    expect(omanPhoneProblem("912345678")).toBe("format");
    expect(omanPhoneProblem("9123-456")).toBe("format");
    expect(omanPhoneProblem("9123456#")).toBe("format");
  });
});
