/**
 * Medical tag rule — allergies, conditions, medications, surgeries (QA MED-011).
 *
 * These lists are CLINICAL SAFETY DATA. The editor previously did nothing but `trim()`
 * plus a case-sensitive duplicate check, so a 5,000-character paste or a row of emoji
 * became a permanent chip that overflowed its container.
 *
 * The bias of this suite is deliberate and asymmetric: a wrongly-REJECTED allergy is more
 * dangerous than an ugly one, because the patient shrugs and leaves it out and the
 * clinician never sees it. So most of what follows asserts that REAL terminology is
 * ACCEPTED; only clearly-broken input is rejected.
 */
import {
  MEDICAL_TAG_MAX,
  medicalTagErrorKey,
  medicalTagProblem,
  normalizeMedicalTag,
} from "../validation";

describe("medicalTagProblem — accepts real medical terminology", () => {
  it.each([
    ["a plain term", "Penicillin"],
    ["two words", "Sulfa drugs"],
    ["an apostrophe", "Cow's milk"],
    ["a curly apostrophe (what iOS types)", "Cow’s milk"],
    ["a hyphen", "Iodine-based contrast"],
    ["parentheses", "Peanut (raw)"],
    ["a slash", "Bee/wasp venom"],
    ["a comma", "NSAIDs, aspirin"],
    ["digits", "Vitamin B12"],
    ["a dose", "Amoxicillin 500mg"],
    ["a percentage and a decimal point", "0.9% saline"],
    ["an ampersand", "Dust & pollen"],
    ["Arabic", "حساسية البنسلين"],
    ["Arabic with harakat", "مُحَمَّد"],
    ["mixed script", "حساسية Penicillin"],
    ["exactly the max length", "A".repeat(MEDICAL_TAG_MAX)],
  ])("accepts %s", (_label, value) => {
    expect(medicalTagProblem(value)).toBeNull();
  });
});

describe("medicalTagProblem — rejects what breaks the field", () => {
  it("rejects empty and whitespace-only input", () => {
    expect(medicalTagProblem("")).toBe("required");
    expect(medicalTagProblem("   ")).toBe("required");
    expect(medicalTagProblem("\t\n")).toBe("required");
  });

  it("rejects a value one character over the limit", () => {
    expect(medicalTagProblem("A".repeat(MEDICAL_TAG_MAX + 1))).toBe("max");
  });

  it("rejects a runaway paste", () => {
    // The exact shape QA reported: a long value became a chip that overflowed the row.
    expect(medicalTagProblem("Penicillin ".repeat(500))).toBe("max");
  });

  it("rejects emoji and symbol blocks", () => {
    expect(medicalTagProblem("🥜")).toBe("invalid");
    expect(medicalTagProblem("Peanut 🥜")).toBe("invalid");
    expect(medicalTagProblem("███")).toBe("invalid");
  });

  it("rejects punctuation with no actual content", () => {
    expect(medicalTagProblem("...")).toBe("invalid");
    expect(medicalTagProblem("---")).toBe("invalid");
    expect(medicalTagProblem("()")).toBe("invalid");
  });
});

describe("medicalTagProblem — duplicates", () => {
  it("rejects an exact duplicate", () => {
    expect(medicalTagProblem("Penicillin", ["Penicillin"])).toBe("duplicate");
  });

  it("rejects a case-different duplicate — the same allergy, not two", () => {
    // Was case-SENSITIVE, so a medication list could show "Aspirin" and "aspirin" as
    // two separate entries.
    expect(medicalTagProblem("penicillin", ["Penicillin"])).toBe("duplicate");
    expect(medicalTagProblem("PENICILLIN", ["Penicillin"])).toBe("duplicate");
  });

  it("rejects a duplicate that differs only in surrounding or internal whitespace", () => {
    expect(medicalTagProblem("  Penicillin  ", ["Penicillin"])).toBe("duplicate");
    expect(medicalTagProblem("Sulfa   drugs", ["Sulfa drugs"])).toBe("duplicate");
  });

  it("allows a genuinely different term", () => {
    expect(medicalTagProblem("Aspirin", ["Penicillin"])).toBeNull();
  });
});

describe("normalizeMedicalTag — what actually gets stored", () => {
  it("trims the ends and collapses internal whitespace runs", () => {
    expect(normalizeMedicalTag("  Sulfa   drugs  ")).toBe("Sulfa drugs");
  });

  it("is idempotent, so re-saving a record cannot drift", () => {
    const once = normalizeMedicalTag("  Cow's   milk ");
    expect(normalizeMedicalTag(once)).toBe(once);
  });

  it("validates the value that will be stored, not the raw draft", () => {
    // A value that is only over the limit because of padding must still be accepted.
    const padded = `   ${"A".repeat(MEDICAL_TAG_MAX)}   `;
    expect(normalizeMedicalTag(padded).length).toBe(MEDICAL_TAG_MAX);
    expect(medicalTagProblem(padded)).toBeNull();
  });
});

describe("medicalTagErrorKey", () => {
  it("maps each problem to a distinct message", () => {
    expect(medicalTagErrorKey("A".repeat(MEDICAL_TAG_MAX + 1))).toBe("validation.tagMax");
    expect(medicalTagErrorKey("🥜")).toBe("validation.tagInvalid");
    expect(medicalTagErrorKey("Penicillin", ["Penicillin"])).toBe("validation.tagDuplicate");
  });

  it("returns null for an acceptable tag", () => {
    expect(medicalTagErrorKey("Penicillin")).toBeNull();
  });

  it("treats a blank submit as 'required' so the editor can silently ignore it", () => {
    expect(medicalTagErrorKey("")).toBe("validation.required");
  });
});
