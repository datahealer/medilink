/**
 * Input normalization (shared/src/utils/normalize.ts).
 *
 * Lives in the mobile suite because that is the only workspace with a test runner, and it
 * is the established pattern for shared logic (see payments.test.ts, which tests
 * shared/src/config/payments.ts the same way).
 *
 * Worth testing because the failure mode is silent and permanent: a padded name is stored
 * once and then shown on every appointment, prescription and clinic record forever. The
 * Arabic cases matter most — a normalizer that "cleans" Arabic by stripping the format
 * characters shaping depends on would corrupt names while looking fine in a Latin test.
 */
import {
  isBlank,
  normalizeDigits,
  normalizeEmail,
  normalizeFreeText,
  normalizeHumanText,
  normalizeOptionalText,
  normalizeSearchQuery,
} from "@medilink/shared/mobile";

describe("normalizeHumanText", () => {
  it("strips leading and trailing whitespace", () => {
    expect(normalizeHumanText("    Satyam")).toBe("Satyam");
    expect(normalizeHumanText("Satyam    ")).toBe("Satyam");
    expect(normalizeHumanText("   Satyam   ")).toBe("Satyam");
  });

  it("leaves an already-clean value byte-identical", () => {
    expect(normalizeHumanText("Satyam Kumar")).toBe("Satyam Kumar");
    expect(normalizeHumanText("Al Noor Medical Center")).toBe("Al Noor Medical Center");
  });

  it("preserves single internal spaces while trimming the ends", () => {
    expect(normalizeHumanText("  Satyam Kumar  ")).toBe("Satyam Kumar");
  });

  it("collapses accidental runs between words", () => {
    expect(normalizeHumanText("Satyam    Kumar")).toBe("Satyam Kumar");
    expect(normalizeHumanText("Al  Noor   Medical  Center")).toBe("Al Noor Medical Center");
  });

  it("returns empty for whitespace-only input", () => {
    expect(normalizeHumanText("     ")).toBe("");
    expect(normalizeHumanText("")).toBe("");
    expect(normalizeHumanText("\t\n  ")).toBe("");
  });

  it("collapses tabs, newlines and non-breaking spaces (all copy-paste artefacts)", () => {
    expect(normalizeHumanText("Satyam\tKumar")).toBe("Satyam Kumar");
    expect(normalizeHumanText("Satyam\nKumar")).toBe("Satyam Kumar");
    expect(normalizeHumanText("Satyam Kumar")).toBe("Satyam Kumar");
  });

  it("treats null/undefined as empty rather than throwing", () => {
    expect(normalizeHumanText(null)).toBe("");
    expect(normalizeHumanText(undefined)).toBe("");
  });
});

describe("normalizeHumanText — Arabic", () => {
  it("trims a multi-word Arabic name without touching the script", () => {
    expect(normalizeHumanText("   عائشة الحارثي   ")).toBe("عائشة الحارثي");
  });

  it("preserves internal spacing in a multi-word Arabic clinic name", () => {
    expect(normalizeHumanText("عيادة أستر — الخوير")).toBe("عيادة أستر — الخوير");
  });

  it("collapses accidental runs in Arabic too", () => {
    expect(normalizeHumanText("عائشة    الحارثي")).toBe("عائشة الحارثي");
  });

  it("preserves diacritics/harakat (combining marks are not whitespace)", () => {
    const withHarakat = "مُحَمَّد";
    expect(normalizeHumanText(`  ${withHarakat}  `)).toBe(withHarakat);
  });

  it("preserves ZWJ/ZWNJ and tatweel, which Arabic shaping depends on", () => {
    // If \s ever matched these, names would silently change shape on screen.
    expect(normalizeHumanText("ا‍ب")).toBe("ا‍ب"); // ZWJ
    expect(normalizeHumanText("ا‌ب")).toBe("ا‌ب"); // ZWNJ
    expect(normalizeHumanText("مـــحمد")).toBe("مـــحمد"); // tatweel U+0640
  });

  it("preserves Arabic-Indic digits", () => {
    expect(normalizeHumanText("  عيادة ٢٤ ساعة  ")).toBe("عيادة ٢٤ ساعة");
  });

  it("does not transliterate or reorder", () => {
    const arabic = "د. صباح";
    expect(normalizeHumanText(arabic)).toBe(arabic);
  });
});

describe("normalizeOptionalText", () => {
  it("returns null for empty and whitespace-only, so nullable columns stay null", () => {
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText("")).toBeNull();
    expect(normalizeOptionalText(null)).toBeNull();
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it("normalizes a real value", () => {
    expect(normalizeOptionalText("  Muscat, Al Khuwair ")).toBe("Muscat, Al Khuwair");
  });
});

describe("normalizeFreeText", () => {
  it("preserves newlines — a three-line note meant three lines", () => {
    expect(normalizeFreeText("line one\nline two\nline three")).toBe(
      "line one\nline two\nline three"
    );
  });

  it("trims the ends and strips per-line trailing/leading spaces", () => {
    expect(normalizeFreeText("  first   \n   second  ")).toBe("first\nsecond");
  });

  it("collapses runs of spaces within a line but not the line breaks", () => {
    expect(normalizeFreeText("a    b\n\nc")).toBe("a b\n\nc");
  });

  it("returns null for whitespace-only", () => {
    expect(normalizeFreeText("   \n  \t ")).toBeNull();
    expect(normalizeFreeText("")).toBeNull();
    expect(normalizeFreeText(null)).toBeNull();
  });
});

describe("normalizeSearchQuery", () => {
  it("makes a padded query behave like the clean one", () => {
    // The bug: ilike('%  Ahmed  %') requires that padding inside the stored name, so
    // search returned nothing at all.
    expect(normalizeSearchQuery("  Ahmed  ")).toBe("Ahmed");
  });

  it("returns empty for a whitespace-only query, which callers treat as no search", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
    expect(normalizeSearchQuery("")).toBe("");
  });

  it("keeps multi-word queries intact", () => {
    expect(normalizeSearchQuery(" Al Noor ")).toBe("Al Noor");
  });
});

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("lowercases so padded/cased input cannot become a second account", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
  });

  it("does not strip internal characters", () => {
    expect(normalizeEmail("first.last+tag@example.co.uk")).toBe("first.last+tag@example.co.uk");
  });
});

describe("normalizeDigits", () => {
  it("removes formatting from phone numbers", () => {
    expect(normalizeDigits(" 9111 1111 ")).toBe("91111111");
    // The country code is kept here — dropping it is extractOmanLocalPhone's job, not this
    // helper's. This only removes non-digits.
    expect(normalizeDigits("+968 9111-1111")).toBe("96891111111");
  });

  it("strips spaces from a civil number", () => {
    expect(normalizeDigits(" 1234 5678 ")).toBe("12345678");
  });

  it("returns empty for whitespace-only", () => {
    expect(normalizeDigits("   ")).toBe("");
    expect(normalizeDigits(null)).toBe("");
  });
});

describe("isBlank", () => {
  it("is true for empty and whitespace-only required values", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("     ")).toBe(true);
    expect(isBlank("\t\n")).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
  });

  it("is false for real content, including a single Arabic character", () => {
    expect(isBlank("a")).toBe(false);
    expect(isBlank("  a  ")).toBe(false);
    expect(isBlank("ع")).toBe(false);
  });
});

describe("passwords are never normalized", () => {
  it("has no password helper — leading/trailing spaces can be deliberate", () => {
    // This is an assertion about the module's SHAPE, not its behaviour: adding a
    // normalizePassword() would lock out anyone whose password starts or ends with a
    // space. The test exists so that addition has to be a conscious decision.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shared = require("@medilink/shared/mobile") as Record<string, unknown>;
    const passwordHelpers = Object.keys(shared).filter((k) => /password/i.test(k) && /normal|trim/i.test(k));
    expect(passwordHelpers).toEqual([]);
  });
});
