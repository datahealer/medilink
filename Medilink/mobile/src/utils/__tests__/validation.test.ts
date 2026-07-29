import {
  CIVIL_NUMBER_LENGTH,
  extractOmanLocalPhone,
  isValidCivilNumber,
  isValidDob,
  isValidName,
  isValidOmanPhone,
  signInSchema,
  signUpSchema,
} from "../validation";

/** Zod messages are injected from i18n; echo the key so assertions stay readable. */
const t = ((key: string) => key) as unknown as Parameters<typeof signInSchema>[0];

describe("isValidCivilNumber", () => {
  it("accepts exactly 8 digits", () => {
    expect(CIVIL_NUMBER_LENGTH).toBe(8);
    expect(isValidCivilNumber("12345678")).toBe(true);
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
    expect(isValidCivilNumber("  12345678  ")).toBe(true);
  });
});

describe("isValidOmanPhone", () => {
  it("accepts an 8-digit local number", () => {
    expect(isValidOmanPhone("91111111")).toBe(true);
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

  it("requires an 8-digit Oman phone", () => {
    expect(signUpSchema(t).safeParse({ ...base, phone: "+96891111111", password: "Abcdef1!" }).success).toBe(false);
  });
});
