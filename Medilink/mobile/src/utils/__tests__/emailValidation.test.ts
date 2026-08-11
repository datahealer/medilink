/**
 * Email validation across the auth forms (QA MED-017 + MED-020).
 *
 * MED-020: `forgotSchema.identifier` used to be `min(1)` with NO `.email()` check, so a
 * value like "abc" passed validation, fired a real `resetPasswordForEmail("abc")` request
 * and surfaced whatever generic error came back — the "incorrect/unclear message for an
 * invalid email" report, and an obviously-invalid value reaching the network. All three
 * email entry points now share ONE rule, so they cannot drift apart again.
 *
 * MED-017 (the stale error) is a form-CONFIG defect rather than a schema one — it lives in
 * `mode: "onTouched"` on each `useForm`. It is covered by the guard at the bottom of this
 * file, because the schema itself was always correct.
 */
import fs from "node:fs";
import path from "node:path";

import { forgotSchema, signInSchema, signUpSchema } from "../validation";

/** Zod messages are injected from i18n; echo the key so assertions read as intent. */
const t = ((key: string) => key) as unknown as Parameters<typeof signInSchema>[0];

/** Every screen that accepts an email address, so none can be fixed in isolation. */
const emailEntryPoints = [
  {
    name: "sign-in",
    parse: (value: string) =>
      signInSchema(t).safeParse({ email: value, password: "Passw0rd!", remember: false }),
    field: "email",
  },
  {
    name: "sign-up",
    parse: (value: string) =>
      signUpSchema(t).safeParse({
        fullName: "Aisha Al Harthy",
        email: value,
        phone: "91234567",
        password: "Passw0rd!",
        acceptTerms: true,
      }),
    field: "email",
  },
  {
    name: "forgot-password",
    parse: (value: string) => forgotSchema(t).safeParse({ identifier: value }),
    field: "identifier",
  },
] as const;

/** The message the schema produced for the email field, or null when it accepted. */
function emailError(entry: (typeof emailEntryPoints)[number], value: string): string | null {
  const result = entry.parse(value);
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path[0] === entry.field);
  return issue?.message ?? null;
}

describe.each(emailEntryPoints)("$name — email rule", (entry) => {
  it("rejects a malformed address with the FORMAT message, not a generic one", () => {
    // The MED-020 regression: forgot-password used to return null here (accepted!).
    expect(emailError(entry, "abc")).toBe("validation.email");
    expect(emailError(entry, "abc@")).toBe("validation.email");
    expect(emailError(entry, "@example.com")).toBe("validation.email");
    expect(emailError(entry, "a b@example.com")).toBe("validation.email");
  });

  it("rejects an empty or whitespace-only address as REQUIRED, not as malformed", () => {
    // Different problem, different correction — the user needs to be told which.
    expect(emailError(entry, "")).toBe("validation.required");
    expect(emailError(entry, "   ")).toBe("validation.required");
  });

  it("accepts a valid address", () => {
    expect(emailError(entry, "patient@medilink.om")).toBeNull();
    expect(emailError(entry, "a.b-c+tag@sub.example.co.uk")).toBeNull();
  });

  it("normalises before validating, so padding and case never cause a false rejection", () => {
    expect(emailError(entry, "  Patient@MediLink.OM  ")).toBeNull();
  });

  it("blocks submission for an invalid address, so no network request can fire", () => {
    // handleSubmit only calls the submit handler when the schema succeeds, so "did the
    // schema reject it" IS "did we avoid the request".
    expect(entry.parse("abc").success).toBe(false);
  });
});

describe("MED-020 — the three entry points agree", () => {
  it("returns the same message for the same bad input everywhere", () => {
    const messages = emailEntryPoints.map((e) => emailError(e, "abc"));
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe("validation.email");
  });

  it("forgot-password normalises the address it hands to Supabase", () => {
    const parsed = forgotSchema(t).safeParse({ identifier: "  Me@Example.COM " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.identifier).toBe("me@example.com");
  });
});

/**
 * MED-017 guard.
 *
 * The stale-error bug was one word in each `useForm` config, and it cannot be asserted
 * from the schema — a full screen render would need the expo-router + navigation stack
 * mocked, which is far more fragile than reading the four files. This locks the config so
 * a future edit cannot silently reintroduce it.
 *
 * Why "onTouched" specifically: RHF's `reValidateMode` only takes effect AFTER the first
 * submit, so "onBlur" leaves a corrected field showing its previous error until the user
 * blurs again. "onTouched" validates on the first blur, then on every change.
 */
describe("MED-017 — auth forms re-validate while the user is correcting a field", () => {
  const authDir = path.join(__dirname, "..", "..", "..", "app", "auth");
  const forms = ["sign-in", "sign-up", "forgot-password", "reset-password"];

  it.each(forms)("%s uses mode: onTouched", (form) => {
    const source = fs.readFileSync(path.join(authDir, `${form}.tsx`), "utf8");
    expect(source).toContain('mode: "onTouched"');
    expect(source).not.toContain('mode: "onBlur"');
  });

  it("covers every form in the auth directory — none added later can be missed", () => {
    const found = fs
      .readdirSync(authDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => fs.readFileSync(path.join(authDir, f), "utf8").includes("useForm"))
      .map((f) => f.replace(/\.tsx$/, ""))
      .sort();
    expect(found).toEqual([...forms].sort());
  });
});
