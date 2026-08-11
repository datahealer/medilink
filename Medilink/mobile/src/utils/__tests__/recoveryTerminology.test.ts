/**
 * Password-recovery terminology (QA MED-019).
 *
 * The Forgot Password screen promised a "reset link", but mobile recovery is CODE-based:
 * `resetPasswordForEmail` is called with NO `redirectTo`, the screen routes to
 * /auth/otp?flow=recovery, and the user types a 6-digit code that
 * `verifyOtp(type:"recovery")` exchanges for a recovery session. Mobile has no deep-link
 * handling at all, so there is no link for the user to open — the copy described a flow
 * that does not exist on this platform.
 *
 * These assertions are deliberately about MOBILE only. The WEB forgot-password flow is
 * genuinely link-based (`resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`
 * plus the /auth/callback route), so "reset link" is CORRECT there and must not be
 * "fixed" to match mobile.
 */
import { en } from "../../i18n/en";
import { ar } from "../../i18n/ar";

/** Every mobile string that describes how the user receives their recovery credential. */
const recoveryCopy = {
  en: [en.forgot.subtitle, en.forgot.submit, en.forgot.emailSent, en.errors.recoverySession],
  ar: [ar.forgot.subtitle, ar.forgot.submit, ar.forgot.emailSent, ar.errors.recoverySession],
};

describe("MED-019 — mobile recovery copy describes a code, not a link", () => {
  it("no English recovery string still promises a link", () => {
    for (const line of recoveryCopy.en) {
      expect(line.toLowerCase()).not.toContain("link");
    }
  });

  it("no Arabic recovery string still promises a link", () => {
    for (const line of recoveryCopy.ar) {
      // "رابط" = link
      expect(line).not.toContain("رابط");
    }
  });

  it("English copy tells the user to expect a code", () => {
    expect(en.forgot.subtitle.toLowerCase()).toContain("code");
    expect(en.forgot.submit.toLowerCase()).toContain("code");
    expect(en.forgot.emailSent.toLowerCase()).toContain("code");
    expect(en.errors.recoverySession.toLowerCase()).toContain("code");
  });

  it("Arabic copy tells the user to expect a code", () => {
    // "رمز" = code — the same term the otp block already uses.
    for (const line of recoveryCopy.ar) {
      expect(line).toContain("رمز");
    }
  });

  it("states the code length, matching the OTP screen the user lands on", () => {
    // The OTP screen says "Enter the 6-digit code"; the screen that sends it must agree,
    // or the user does not know what they are waiting for.
    expect(en.forgot.subtitle).toContain("6-digit");
    expect(en.forgot.emailSent).toContain("6-digit");
    expect(ar.forgot.subtitle).toContain("6");
    expect(ar.forgot.emailSent).toContain("6");
  });

  it("keeps EN and AR structurally in step — both mention a code in the same four places", () => {
    expect(recoveryCopy.en).toHaveLength(recoveryCopy.ar.length);
    for (const line of [...recoveryCopy.en, ...recoveryCopy.ar]) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
});
