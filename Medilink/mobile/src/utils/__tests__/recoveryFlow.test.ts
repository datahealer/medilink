/**
 * Unified password-recovery flow — web AND mobile (P1, discovered while fixing MED-019).
 *
 * THE DEFECT. Supabase allows exactly ONE "Reset Password" template per project, but the
 * two platforms wanted incompatible emails:
 *
 *   mobile  resetPasswordForEmail(email)                  → needs {{ .Token }}  (a code)
 *   web     resetPasswordForEmail(email, { redirectTo })  → needs {{ .ConfirmationURL }}
 *
 * Whichever was configured, the other platform's recovery was dead — and no
 * [auth.email.template.recovery] existed at all, so the hosted project was on Supabase's
 * default LINK. Mobile has no deep-link handling, so mobile password recovery could not
 * complete: the user received a link and the app demanded 6 digits.
 *
 * THE RESOLUTION. One flow for both: enter email → receive a 6-digit code → verify it with
 * verifyOtp({ type: "recovery" }) → set a new password on the recovery session.
 *
 * These assertions read the real source and config, because the failure mode is a single
 * argument (`redirectTo`) or a missing template file reappearing — neither of which any
 * unit test of application logic would catch. Cheap, deterministic, and they fail loudly
 * if someone reintroduces link-based recovery on either platform.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.join(__dirname, "..", "..", "..", "..");
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(REPO, ...segments), "utf8");

const recoveryTemplate = "supabase/templates/recovery.html".split("/");
const configToml = "supabase/config.toml".split("/");
const webForgot = "frontend/src/app/(auth)/forgot-password/page.tsx".split("/");
const webOtp = "frontend/src/app/(auth)/otp/page.tsx".split("/");
const webReset = "frontend/src/app/(auth)/reset-password/page.tsx".split("/");
const mobileForgot = "mobile/app/auth/forgot-password.tsx".split("/");
const mobileOtp = "mobile/app/auth/otp.tsx".split("/");

describe("recovery email template — a code, never a link", () => {
  it("exists in the repo, so the hosted template has a source of truth", () => {
    expect(() => read(...recoveryTemplate)).not.toThrow();
  });

  it("renders {{ .Token }} and NOT {{ .ConfirmationURL }}", () => {
    const template = read(...recoveryTemplate);
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("ConfirmationURL");
  });

  it("is wired up in config.toml", () => {
    const config = read(...configToml);
    expect(config).toContain("[auth.email.template.recovery]");
    expect(config).toContain("./supabase/templates/recovery.html");
  });

  it("keeps the 6-digit OTP length the flow depends on", () => {
    expect(read(...configToml)).toContain("otp_length = 6");
  });
});

describe("web recovery — code-based, same as mobile", () => {
  it("does NOT pass redirectTo, which is what makes Supabase send the code", () => {
    const source = read(...webForgot);
    // Only the explanatory comments may mention it; no live argument.
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("redirectTo");
  });

  it("sends the user to the OTP screen in recovery mode", () => {
    expect(read(...webForgot)).toContain("/otp?flow=recovery");
  });

  it("verifies with type 'recovery' and then goes to set a new password", () => {
    const source = read(...webOtp);
    expect(source).toContain('flow") === "recovery"');
    expect(source).toContain('isRecovery ? "recovery" : "signup"');
    expect(source).toContain('router.push("/reset-password")');
  });

  it("guards /reset-password against arrival with no recovery session", () => {
    // It used to be reachable only from an emailed link; now it is just a URL, and
    // updateUser would fail with a raw "Auth session missing".
    expect(read(...webReset)).toContain("getSession");
  });

  it("no longer tells the user to follow a link", () => {
    const source = read(...webForgot);
    expect(source).not.toContain("Send reset link");
    expect(source).not.toContain("Follow the link");
    expect(source).not.toContain("رابط إعادة التعيين");
  });

  it("tells the user to expect a 6-digit code, in EN and AR", () => {
    const source = read(...webForgot);
    expect(source).toContain("6-digit code");
    expect(source).toContain("Send code");
    expect(source).toContain("6 أرقام");
  });
});

describe("mobile recovery — unchanged, still code-based", () => {
  it("routes to the OTP screen in recovery mode", () => {
    expect(read(...mobileForgot)).toContain('flow: "recovery"');
  });

  it("verifies the code with the recovery type", () => {
    expect(read(...mobileOtp)).toContain('isRecovery ? "recovery" : "signup"');
  });

  it("never passes a redirectTo, so the same code template serves it", () => {
    const source = read(...mobileForgot);
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("redirectTo");
  });
});

describe("both platforms agree", () => {
  it("neither forgot-password screen can drift back to a link", () => {
    for (const screen of [webForgot, mobileForgot]) {
      const code = read(...screen)
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("redirectTo");
      expect(code).not.toContain("ConfirmationURL");
    }
  });

  it("signup confirmation and OAuth callback are untouched by this change", () => {
    // The callback route still serves Google OAuth and signup email confirmation — only
    // RECOVERY stopped using links. Breaking those would be a silent regression.
    expect(() => read("frontend", "src", "app", "auth", "callback", "route.ts")).not.toThrow();
    expect(read("frontend", "src", "app", "(auth)", "sign-up", "page.tsx")).toContain(
      "emailRedirectTo"
    );
  });
});
