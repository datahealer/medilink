import {
  NAME_MAX,
  NAME_MIN,
  isValidName,
  nameErrorKey,
  nameProblem,
  signInSchema,
  signUpSchema,
} from "../validation";

/**
 * Shared person-name rule (QA MED-001) and the sign-in password rule (QA MED-005).
 *
 * The Arabic cases are the point of this file. A name rule built from ASCII ranges is the
 * classic way to ship a product that silently cannot register its own primary market, so
 * every script/diacritic case below is a guard against someone "simplifying" the regex to
 * `[A-Za-z ]` later.
 *
 * `t` returns the key itself, so assertions read as the i18n key rather than English copy.
 */
const t = ((key: string) => key) as unknown as Parameters<typeof signUpSchema>[0];

describe("nameProblem — accepts legitimate names", () => {
  it.each([
    ["plain Latin", "Satyam Kumar"],
    ["single word", "Satyam"],
    ["exactly NAME_MIN", "Al"],
    ["hyphenated", "Al-Harthy"],
    ["straight apostrophe", "O'Brien"],
    ["curly apostrophe (what iOS types)", "O’Brien"],
    ["suffix with a period", "Robert Downey Jr."],
    ["three parts", "Ahmed bin Saif"],
    ["Arabic", "محمد بن عبدالله"],
    ["Arabic with harakat", "مُحَمَّد"],
    ["Arabic hyphenated", "عبد-الله"],
    ["mixed script (legitimate in Oman)", "محمد Ali"],
    ["accented Latin", "José Álvarez"],
    ["CJK", "李明"],
    ["Cyrillic", "Иван Петров"],
    ["padded — normalized before checking", "   Satyam   Kumar   "],
    ["internal run — collapsed before checking", "Satyam    Kumar"],
    ["exactly NAME_MAX", "A".repeat(NAME_MAX)],
  ])("accepts %s", (_label, name) => {
    expect(nameProblem(name)).toBeNull();
    expect(isValidName(name)).toBe(true);
    expect(nameErrorKey(name)).toBeNull();
  });
});

describe("nameProblem — rejects invalid names", () => {
  it.each([
    ["empty", "", "required"],
    ["whitespace only", "     ", "required"],
    ["tabs and newlines only", "\t\n ", "required"],
    ["single character", "A", "min"],
    ["single Arabic character", "م", "min"],
    ["one char after normalization", "  A  ", "min"],
    ["over NAME_MAX", "A".repeat(NAME_MAX + 1), "max"],
    ["digits", "Satyam123", "invalid"],
    ["digits only", "12345", "invalid"],
    ["Arabic-Indic digits", "محمد٣", "invalid"],
    ["symbols", "Satyam@#$", "invalid"],
    ["emoji", "Satyam 😀", "invalid"],
    ["emoji only", "😀😀", "invalid"],
    ["leading hyphen", "-Ali", "invalid"],
    ["leading period", ".Ali", "invalid"],
    ["punctuation only", "'''", "invalid"],
    ["angle brackets (injection-shaped)", "<script>", "invalid"],
    ["underscore", "Satyam_Kumar", "invalid"],
    ["slash", "Satyam/Kumar", "invalid"],
    ["parentheses", "Satyam (Sam)", "invalid"],
  ] as const)("rejects %s", (_label, name, problem) => {
    expect(nameProblem(name)).toBe(problem);
    expect(isValidName(name)).toBe(false);
  });

  it("maps each problem to a distinct message key", () => {
    expect(nameErrorKey("")).toBe("validation.nameMin");
    expect(nameErrorKey("A")).toBe("validation.nameMin");
    expect(nameErrorKey("A".repeat(NAME_MAX + 1))).toBe("validation.nameMax");
    expect(nameErrorKey("Satyam123")).toBe("validation.nameInvalid");
  });
});

describe("grandfathering — an existing record must never become unsaveable", () => {
  it("allows a stored name that breaks the charset rule", () => {
    // e.g. a HAMS row, or a Google display name with an emoji.
    expect(nameProblem("Satyam 😀", { grandfathered: true })).toBeNull();
  });

  it("allows a stored name that breaks the length rule", () => {
    expect(nameProblem("A".repeat(500), { grandfathered: true })).toBeNull();
  });

  it("still rejects blank and too-short, which were ALWAYS enforced", () => {
    expect(nameProblem("", { grandfathered: true })).toBe("required");
    expect(nameProblem("   ", { grandfathered: true })).toBe("required");
    expect(nameProblem("A", { grandfathered: true })).toBe("min");
  });

  it("applies the full rule as soon as the caller stops grandfathering", () => {
    expect(nameProblem("Satyam 😀", { grandfathered: false })).toBe("invalid");
    expect(nameProblem("Satyam 😀")).toBe("invalid");
  });
});

describe("signUpSchema.fullName", () => {
  const parse = (fullName: string) =>
    signUpSchema(t).safeParse({
      fullName,
      email: "a@b.com",
      phone: "91234567",
      password: "Passw0rd!",
      acceptTerms: true,
    });

  it("normalizes the stored value, not just the validated one", () => {
    const res = parse("   Satyam   Kumar   ");
    expect(res.success).toBe(true);
    // What authService receives — padding gone, internal run collapsed.
    if (res.success) expect(res.data.fullName).toBe("Satyam Kumar");
  });

  it("accepts an Arabic name", () => {
    expect(parse("محمد بن عبدالله").success).toBe(true);
  });

  it.each([
    ["whitespace only", "   ", "validation.nameMin"],
    ["digits", "Satyam123", "validation.nameInvalid"],
    ["symbols", "!!!!", "validation.nameInvalid"],
    ["over max", "A".repeat(NAME_MAX + 1), "validation.nameMax"],
  ])("rejects %s with the right message", (_label, name, message) => {
    const res = parse(name);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === message)).toBe(true);
    }
  });
});

describe("signInSchema.password — MED-005", () => {
  const parse = (password: string) =>
    signInSchema(t).safeParse({ email: "a@b.com", password, remember: false });

  it("rejects a whitespace-only password", () => {
    const res = parse("   ");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message === "validation.required")).toBe(true);
    }
  });

  it.each([["spaces", "   "], ["tabs", "\t\t"], ["newlines", "\n"], ["empty", ""]])(
    "rejects %s",
    (_label, password) => {
      expect(parse(password).success).toBe(false);
    }
  );

  it("PRESERVES a password whose padding is part of the credential", () => {
    // The critical non-regression: trimming here would send a different credential and
    // permanently lock out anyone who registered with surrounding spaces.
    const padded = "  Passw0rd!  ";
    const res = parse(padded);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.password).toBe(padded);
  });

  it("preserves internal spaces verbatim", () => {
    const passphrase = "correct horse battery staple";
    const res = parse(passphrase);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.password).toBe(passphrase);
  });

  it("does not impose the signup complexity policy on sign-in", () => {
    // An existing account may predate the current policy; sign-in must not pre-reject it.
    expect(parse("a").success).toBe(true);
  });
});

describe("exported bounds", () => {
  it("are the documented values", () => {
    expect(NAME_MIN).toBe(2);
    expect(NAME_MAX).toBe(100);
  });
});
