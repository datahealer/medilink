import {
  OMAN_DIAL_CODE,
  normalizeDigits,
  omanPhoneDigits,
  omanPhoneE164,
  omanPhoneInput,
  omanPhoneLocal,
} from "@medilink/shared/mobile";

import { extractOmanLocalPhone, isValidOmanPhone, signUpSchema } from "../validation";

/**
 * Oman phone contract (QA MED-007).
 *
 * The column held three competing formats — E.164 from signup, raw local digits from the
 * mobile profile screens, and spaced free text from the web form — while Edit Profile
 * validated against /^[0-9]{8}$/. That combination made the screen unsaveable for anyone
 * who registered through the app. These tests pin the single contract:
 *
 *   editable  91234567         (8 ASCII digits, what the field holds)
 *   canonical +96891234567     (E.164, what the column holds)
 *
 * and prove both conversions are idempotent, which is what makes `+968+96891234567`
 * unreachable.
 */

const t = ((key: string) => key) as unknown as Parameters<typeof signUpSchema>[0];

describe("normalizeDigits — Arabic-Indic folding", () => {
  it("folds Eastern-Arabic-Indic digits to ASCII instead of discarding them", () => {
    // The bug: /\D/ is ASCII-only, so this used to return "" and the field silently emptied.
    expect(normalizeDigits("٩١٢٣٤٥٦٧")).toBe("91234567");
  });

  it("folds Extended/Persian digits", () => {
    expect(normalizeDigits("۹۱۲۳۴۵۶۷")).toBe("91234567");
  });

  it("folds a mixed ASCII/Arabic string", () => {
    expect(normalizeDigits("9١2٣4٥6٧")).toBe("91234567");
  });

  it("still strips separators and letters", () => {
    expect(normalizeDigits("+968 9123-4567")).toBe("96891234567");
    expect(normalizeDigits("abc123")).toBe("123");
  });

  it("returns '' for non-strings and empty input", () => {
    expect(normalizeDigits(null)).toBe("");
    expect(normalizeDigits(undefined)).toBe("");
    expect(normalizeDigits("")).toBe("");
  });
});

describe("omanPhoneLocal — stored value → editable 8 digits", () => {
  it.each([
    ["already local", "91234567", "91234567"],
    ["E.164", "+96891234567", "91234567"],
    ["E.164 without plus", "96891234567", "91234567"],
    ["spaced E.164 (what the web form writes)", "+968 9123 4567", "91234567"],
    ["dashed", "+968-9123-4567", "91234567"],
    ["padded", "  +96891234567  ", "91234567"],
    ["mock-style spacing", "+968 9000 0000", "90000000"],
    ["legacy emergency-contact string", "Name · +968 9111 1111", "91111111"],
    ["Arabic-Indic local", "٩١٢٣٤٥٦٧", "91234567"],
    ["local number that happens to start 968", "96812345", "96812345"],
  ])("%s → %s", (_label, stored, expected) => {
    expect(omanPhoneLocal(stored)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["too few digits", "123"],
    ["letters only", "abcdefgh"],
    ["null", null],
  ])("returns '' for %s", (_label, stored) => {
    expect(omanPhoneLocal(stored)).toBe("");
  });

  it("is idempotent", () => {
    const once = omanPhoneLocal("+96891234567");
    expect(omanPhoneLocal(once)).toBe(once);
  });

  it("extractOmanLocalPhone is the same function (one conversion in the codebase)", () => {
    expect(extractOmanLocalPhone).toBe(omanPhoneLocal);
  });
});

describe("omanPhoneInput — progressive typing sanitiser", () => {
  it("keeps a partial number while typing", () => {
    expect(omanPhoneInput("9")).toBe("9");
    expect(omanPhoneInput("912")).toBe("912");
    expect(omanPhoneInput("91234567")).toBe("91234567");
  });

  it("blocks a 9th digit", () => {
    expect(omanPhoneInput("912345678")).toBe("91234567");
    expect(omanPhoneInput("9123456789999")).toBe("91234567");
  });

  // Expected values are the surviving DIGITS in order — the separator simply disappears,
  // it is not treated as a digit. (QA reported #, ; and * reaching the field.)
  it.each([
    ["hash", "9123#567", "9123567"],
    ["semicolon", "9123;567", "9123567"],
    ["asterisk", "9123*567", "9123567"],
    ["plus", "+9123567", "9123567"],
    ["parens, spaces and dash", "(912) 345-67", "91234567"],
    ["slash", "9123/4567", "91234567"],
    ["dot", "9123.4567", "91234567"],
  ])("strips %s", (_label, typed, expected) => {
    expect(omanPhoneInput(typed)).toBe(expected);
  });

  it("strips letters and emoji entirely", () => {
    expect(omanPhoneInput("abcdefgh")).toBe("");
    expect(omanPhoneInput("😀😀")).toBe("");
    expect(omanPhoneInput("9a1b2c3d")).toBe("9123");
  });

  it("folds Arabic-Indic digits so an Arabic keyboard works", () => {
    expect(omanPhoneInput("٩١٢٣٤٥٦٧")).toBe("91234567");
  });

  it("removes a PASTED country code rather than clipping the number", () => {
    // Naive slice(0,8) would have produced "96891234" — a wrong number, silently.
    expect(omanPhoneInput("+96891234567")).toBe("91234567");
    expect(omanPhoneInput("96891234567")).toBe("91234567");
    expect(omanPhoneInput("+968 9123 4567")).toBe("91234567");
  });

  it("drops whitespace so it can never become stored data", () => {
    expect(omanPhoneInput("  9123 4567  ")).toBe("91234567");
    expect(omanPhoneInput("        ")).toBe("");
  });

  it("is idempotent", () => {
    const once = omanPhoneInput("+96891234567");
    expect(omanPhoneInput(once)).toBe(once);
  });
});

describe("omanPhoneDigits — validator input, deliberately NOT truncated", () => {
  it("keeps 9 digits as 9 so a validator can reject the typo", () => {
    // The whole reason this exists separately from omanPhoneInput: truncating here would
    // turn a mistyped number into a valid-looking WRONG number.
    expect(omanPhoneDigits("912345678")).toBe("912345678");
    expect(omanPhoneInput("912345678")).toBe("91234567"); // input cap, by contrast
  });

  it("still drops a pasted country code", () => {
    expect(omanPhoneDigits("+96891234567")).toBe("91234567");
  });

  it("still folds Arabic-Indic digits", () => {
    expect(omanPhoneDigits("٩١٢٣٤٥٦٧")).toBe("91234567");
  });

  it("preserves a local number that legitimately begins 968", () => {
    expect(omanPhoneDigits("96812345")).toBe("96812345");
  });
});

describe("omanPhoneE164 — editable → canonical storage", () => {
  it("attaches the dial code to 8 local digits", () => {
    expect(omanPhoneE164("91234567")).toBe("+96891234567");
  });

  it("accepts an already-canonical value WITHOUT doubling the prefix", () => {
    // The failure this guards: "+968" + "+96891234567" = "+968+96891234567".
    expect(omanPhoneE164("+96891234567")).toBe("+96891234567");
    expect(omanPhoneE164(omanPhoneE164("91234567"))).toBe("+96891234567");
  });

  it("is idempotent across repeated application", () => {
    let v: string | null = "91234567";
    for (let i = 0; i < 5; i += 1) v = omanPhoneE164(v);
    expect(v).toBe("+96891234567");
  });

  it("normalizes legacy shapes to the same canonical value", () => {
    const canonical = "+96891234567";
    for (const shape of ["91234567", "96891234567", "+968 9123 4567", "٩١٢٣٤٥٦٧"]) {
      expect(omanPhoneE164(shape)).toBe(canonical);
    }
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["too short", "123"],
    ["letters", "abcdefgh"],
    ["null", null],
  ])("returns null for %s (nullable column wants null, not '')", (_label, input) => {
    expect(omanPhoneE164(input)).toBeNull();
  });

  it("uses the exported dial code constant", () => {
    expect(OMAN_DIAL_CODE).toBe("+968");
    expect(omanPhoneE164("91234567")).toBe(`${OMAN_DIAL_CODE}91234567`);
  });
});

describe("isValidOmanPhone — validates the EDITABLE representation", () => {
  it("accepts 8 digits and empty (the field is optional)", () => {
    expect(isValidOmanPhone("91234567")).toBe(true);
    expect(isValidOmanPhone("")).toBe(true);
  });

  it.each([["7 digits", "9123456"], ["9 digits", "912345678"], ["symbols", "9123#567"]])(
    "rejects %s",
    (_label, value) => {
      expect(isValidOmanPhone(value)).toBe(false);
    }
  );
});

describe("MED-007 SAVE BLOCKER — regression", () => {
  /**
   * Reproduces the exact production path:
   *   signup writes E.164 → Edit Profile seeds the field → validation runs → save is gated.
   */
  const STORED_BY_SIGNUP = "+96891234567"; // authService.signUp -> e164(dialCode, phone)

  it("PROVES the old behaviour was broken: the raw column value fails validation", () => {
    // What the screen used to do: seed the field with the column verbatim.
    expect(isValidOmanPhone(STORED_BY_SIGNUP)).toBe(false);
  });

  it("the fixed seed passes validation, so save is not blocked", () => {
    const seeded = extractOmanLocalPhone(STORED_BY_SIGNUP);
    expect(seeded).toBe("91234567");
    expect(isValidOmanPhone(seeded)).toBe(true);
  });

  it("round-trips unchanged when the user edits another field and saves", () => {
    // Load, touch nothing, save.
    const seeded = extractOmanLocalPhone(STORED_BY_SIGNUP);
    expect(omanPhoneE164(seeded)).toBe(STORED_BY_SIGNUP);
  });

  it("survives repeated open/save cycles without drifting or doubling", () => {
    let stored: string | null = STORED_BY_SIGNUP;
    for (let i = 0; i < 5; i += 1) {
      const editable = extractOmanLocalPhone(stored);
      expect(isValidOmanPhone(editable)).toBe(true);
      stored = omanPhoneE164(editable);
    }
    expect(stored).toBe(STORED_BY_SIGNUP);
  });

  it("heals every legacy shape to canonical on the next save", () => {
    for (const legacy of ["91234567", "96891234567", "+968 9123 4567"]) {
      const editable = extractOmanLocalPhone(legacy);
      expect(omanPhoneE164(editable)).toBe(STORED_BY_SIGNUP);
    }
  });
});

describe("signUpSchema.phone — stays E.164-compatible", () => {
  const parse = (phone: string) =>
    signUpSchema(t).safeParse({
      fullName: "Satyam Kumar",
      email: "a@b.com",
      phone,
      password: "Passw0rd!",
      acceptTerms: true,
    });

  it("accepts 8 digits and yields the local digits (authService adds +968)", () => {
    const res = parse("91234567");
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.phone).toBe("91234567");
  });

  it("accepts Arabic-Indic digits", () => {
    const res = parse("٩١٢٣٤٥٦٧");
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.phone).toBe("91234567");
  });

  it("accepts a pasted full number by stripping the country code", () => {
    const res = parse("+968 9123 4567");
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.phone).toBe("91234567");
  });

  it.each([["too short", "123"], ["letters", "abcdefgh"], ["whitespace", "        "]])(
    "rejects %s",
    (_label, phone) => {
      const res = parse(phone);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message === "validation.phone")).toBe(true);
      }
    }
  );
});
