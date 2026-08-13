import fs from "fs";
import path from "path";

import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  phoneCountryForDialCode,
  phoneE164,
} from "@medilink/shared/mobile";

/**
 * Phone OTP — architecture and safety contract.
 *
 * ── THE PROPERTY THAT MATTERS MOST ──
 *
 * Linking a phone MUST NOT go through `supabase.auth.updateUser({ phone })` +
 * `verifyOtp({ type: "phone_change" })`. That client-side pair stages the number in
 * `auth.users.phone_change`, a column with NO uniqueness constraint, and GoTrue resolves
 * the user at verification by SEARCHING that column rather than by the session — so an
 * attempt abandoned by one account can capture the number when its real owner verifies.
 * Supabase documents this as "Phone linked to incorrect user ID" and states there is no
 * client-side workaround.
 *
 * These tests read the SOURCE, because the defect is an absence — you cannot observe
 * "we didn't call the dangerous API" by running the safe one.
 */

const root = path.join(__dirname, "..", "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");
/** Comments stripped — these files discuss the forbidden APIs at length by design. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sharedAuth = code(
  fs.readFileSync(path.join(root, "..", "shared", "src", "api", "auth.ts"), "utf8")
);
const authService = code(read("src", "services", "authService.ts"));
const signIn = code(read("app", "auth", "sign-in.tsx"));
const otp = code(read("app", "auth", "otp.tsx"));
const phoneScreen = code(read("app", "(app)", "settings", "phone.tsx"));

describe("the dangerous APIs are never used", () => {
  const clientFiles = { sharedAuth, authService, signIn, otp, phoneScreen };

  it("REGRESSION: no client file calls updateUser({ phone }) or phone_change", () => {
    for (const [name, src] of Object.entries(clientFiles)) {
      expect({ name, hit: /updateUser\(\s*\{\s*phone/.test(src) }).toEqual({ name, hit: false });
      expect({ name, hit: /phone_change/.test(src) }).toEqual({ name, hit: false });
    }
  });

  it("linkIdentity is never used — it links OAUTH identities and cannot attach a phone", () => {
    for (const [name, src] of Object.entries(clientFiles)) {
      expect({ name, hit: /linkIdentity|unlinkIdentity/.test(src) }).toEqual({ name, hit: false });
    }
  });

  it("linking goes to the BACKEND, not to Supabase", () => {
    expect(authService).toMatch(/apiFetch\("\/api\/auth\/phone\/start"/);
    expect(authService).toMatch(/apiFetch\("\/api\/auth\/phone\/check"/);
  });
});

describe("no Twilio credential can reach the client", () => {
  it("no mobile or shared file mentions a Twilio secret", () => {
    for (const [name, src] of Object.entries({ sharedAuth, authService, signIn, otp, phoneScreen })) {
      expect({ name, hit: /TWILIO_AUTH_TOKEN|TWILIO_ACCOUNT_SID/.test(src) }).toEqual({
        name,
        hit: false,
      });
    }
  });

  it("no EXPO_PUBLIC_ Twilio variable exists anywhere in the mobile config", () => {
    const env = read("src", "config", "env.ts");
    expect(env).not.toMatch(/TWILIO/i);
  });

  it("the twilio SDK is not a mobile or shared dependency", () => {
    const mobilePkg = JSON.parse(read("package.json")) as Record<string, Record<string, string>>;
    expect(Object.keys(mobilePkg.dependencies ?? {})).not.toContain("twilio");
    expect(Object.keys(mobilePkg.devDependencies ?? {})).not.toContain("twilio");
  });
});

describe("phone LOGIN stays pure Supabase Auth", () => {
  it("uses signInWithOtp({ phone }) and verifyOtp({ type: 'sms' })", () => {
    expect(sharedAuth).toMatch(/signInWithOtp\(\{\s*\n?\s*phone:/);
    expect(sharedAuth).toMatch(/type:\s*"sms"/);
  });

  it("REGRESSION: login can never create a phone-only account", () => {
    // profiles.email is NOT NULL and the provisioning trigger inserts NEW.email, so a
    // phone-only signup raises 23502 and rolls back. Enforced in CODE, not only by the
    // dashboard toggle, because a toggle can be flipped by accident.
    const fn = /export async function signInWithPhoneOtp[\s\S]*?\n}/.exec(sharedAuth)?.[0] ?? "";
    expect(fn).toMatch(/shouldCreateUser:\s*false/);
  });

  it("rejects a non-E.164 number before it reaches GoTrue", () => {
    expect(sharedAuth).toMatch(/function assertE164/);
    expect(sharedAuth).toMatch(/\^\\\+\[1-9\]\\d\{7,14\}\$/);
  });
});

describe("E.164 for BOTH supported countries", () => {
  it("Oman is +968 with exactly 8 local digits", () => {
    expect(phoneE164("91234567", PHONE_COUNTRIES.OM)).toBe("+96891234567");
    expect(phoneE164("9123456", PHONE_COUNTRIES.OM)).toBeNull(); // 7 — too short
    expect(phoneE164("912345678", PHONE_COUNTRIES.OM)).toBeNull(); // 9 — too long
  });

  it("India is +91 with exactly 10 local digits", () => {
    expect(phoneE164("9845367812", PHONE_COUNTRIES.IN)).toBe("+919845367812");
    expect(phoneE164("984536781", PHONE_COUNTRIES.IN)).toBeNull();
    expect(phoneE164("98453678123", PHONE_COUNTRIES.IN)).toBeNull();
  });

  it("REGRESSION: an Indian number is never truncated into an Oman number", () => {
    // The G2 corruption: `digits.slice(-8)` turned +919845367812 into +96845367812 and
    // silently rewrote 12 production patient records.
    expect(phoneE164("9845367812", PHONE_COUNTRIES.OM)).toBeNull();
  });

  it("REGRESSION: an already-prefixed value cannot be double-prefixed", () => {
    // The old naive concat produced "+91+919845367812".
    const out = phoneE164("+919845367812", PHONE_COUNTRIES.IN);
    expect(out).toBe("+919845367812");
    expect(out?.match(/\+/g)).toHaveLength(1);
  });

  it("a dial code resolves to its country, and an unknown one falls back to Oman", () => {
    expect(phoneCountryForDialCode("+968")?.iso).toBe("OM");
    expect(phoneCountryForDialCode("+91")?.iso).toBe("IN");
    expect(phoneCountryForDialCode("+1")).toBeNull();
    expect(DEFAULT_PHONE_COUNTRY.iso).toBe("OM");
  });

  it("both screens normalise BEFORE spending an SMS", () => {
    expect(signIn).toMatch(/phoneE164\(phoneLocal, phoneCountry\)/);
    expect(phoneScreen).toMatch(/phoneE164\(local, country\)/);
    // …and refuse rather than sending a malformed number.
    expect(signIn).toMatch(/if \(!e164\)/);
    expect(phoneScreen).toMatch(/if \(!e164\)/);
  });

  it("only Oman and India are offered", () => {
    expect(signIn).toMatch(/PHONE_COUNTRIES\.OM,\s*PHONE_COUNTRIES\.IN/);
    expect(phoneScreen).toMatch(/PHONE_COUNTRIES\.OM,\s*PHONE_COUNTRIES\.IN/);
  });
});

describe("the OTP screen routes each flow correctly", () => {
  it("phone login verifies with the login method; linking with the link method", () => {
    expect(otp).toMatch(/isPhoneLink\s*\?\s*await repositories\.auth\.verifyPhoneLink/);
    expect(otp).toMatch(/isPhoneLogin[\s\S]{0,80}verifyPhoneLoginOtp/);
  });

  it("linking returns the user where they were — they were already signed in", () => {
    expect(otp).toMatch(/if \(isPhoneLink\)/);
    expect(otp).toMatch(/router\.replace\("\/settings\/phone"\)/);
  });

  it("resend re-POSTs the same start endpoint for both phone flows", () => {
    expect(otp).toMatch(/isPhoneLink[\s\S]{0,80}startPhoneLink/);
    expect(otp).toMatch(/isPhoneLogin[\s\S]{0,80}sendPhoneLoginOtp/);
  });

  it("existing email flows are untouched", () => {
    expect(otp).toMatch(/verifyLoginOtp\(code, email/);
    expect(otp).toMatch(/isRecovery \? "recovery" : "signup"/);
  });
});

describe("enumeration safety", () => {
  it("phone LOGIN swallows unknown-account errors, like the email path", () => {
    const fn = /async sendPhoneLoginOtp[\s\S]*?\n  \},/.exec(authService)?.[0] ?? "";
    expect(fn).toMatch(/errors\.otpTooMany" \|\| key === "errors\.network"/);
    expect(fn).toMatch(/return \{ ok: true \};/);
  });

  it("LINKING does not swallow — the caller is already authenticated", () => {
    // "That number is already linked" is information an authenticated user needs and can
    // act on; hiding it would leave them retrying forever.
    const fn = /async startPhoneLink[\s\S]*?\n  \},/.exec(authService)?.[0] ?? "";
    expect(fn).toMatch(/phoneLinkMessageKey/);
    expect(fn).not.toMatch(/return \{ ok: true \};[\s\S]*catch/);
  });

  it("the already-linked message never names the other account", () => {
    const en = read("src", "i18n", "en.ts");
    expect(en).toMatch(/errorAlreadyLinked: "That number is already linked to another account\."/);
  });
});

describe("verification state is read from Supabase, not the mirror", () => {
  it("the badge reads the backend status route, not profiles.phone_verified", () => {
    expect(authService).toMatch(/apiFetch<\{ phone: string \| null; confirmed: boolean \}>\("\/api\/auth\/phone"\)/);
    expect(phoneScreen).toMatch(/getPhoneConfirmation\(\)/);
    expect(phoneScreen).not.toMatch(/phone_verified/);
  });

  it("the client never writes profiles.phone_verified itself", () => {
    // The server does it under the service role, after Twilio approved. A client write
    // would race the server's and could set the mirror for a link the server rejected.
    expect(authService).not.toMatch(/phone_verified/);
  });
});

describe("localization", () => {
  const en = read("src", "i18n", "en.ts");
  const ar = read("src", "i18n", "ar.ts");

  it.each([
    "title",
    "subtitle",
    "current",
    "notAdded",
    "verified",
    "unverified",
    "send",
    "successTitle",
    "errorAlreadyLinked",
    "errorUnsupportedCountry",
  ])("phone.%s exists in both catalogs", (key) => {
    expect(en).toContain(`${key}:`);
    expect(ar).toContain(`${key}:`);
  });

  it("the Arabic strings are Arabic, not an English fallback", () => {
    for (const key of ["errorAlreadyLinked", "errorUnsupportedCountry", "successTitle"]) {
      const line = ar.split(/\r?\n/).find((l) => l.includes(`${key}:`)) ?? "";
      expect(line).toMatch(/[؀-ۿ]/);
    }
  });

  it("both new screens mirror for RTL", () => {
    expect(phoneScreen).toMatch(/isRTL \? "row-reverse" : "row"/);
    expect(signIn).toMatch(/isRTL \? "row-reverse" : "row"/);
  });
});

describe("privacy", () => {
  it("NO PHONE NUMBER OR OTP CODE reaches a log line", () => {
    // Scoped to the property that matters, not to logging in general: sign-in.tsx has a
    // pre-existing __DEV__ "button pressed" breadcrumb that carries no personal data, and
    // banning every console call would fail on that while proving nothing.
    //
    // A phone number is personal data AND, now, a login credential; an OTP code is a
    // bearer secret. Neither may ever be an argument to a log call.
    const LOGGED_PHONE_OR_CODE =
      /console\.(log|warn|error)\([^)]*\b(phone|phoneLocal|e164|code|otp|token)\b/i;
    for (const [name, src] of Object.entries({ authService, phoneScreen, signIn, otp })) {
      expect({ name, hit: LOGGED_PHONE_OR_CODE.test(src) }).toEqual({ name, hit: false });
    }
  });

  it("the client never persists a phone number or code to device storage", () => {
    for (const [name, src] of Object.entries({ authService, phoneScreen, otp })) {
      expect({ name, hit: /AsyncStorage/.test(src) }).toEqual({ name, hit: false });
    }
    // authService DOES use SecureStore — for the remembered EMAIL (MED-018) and the
    // Supabase session. Neither is a phone number or a code, and no phone write exists.
    expect(authService).not.toMatch(/setRemembered(Phone|Number)/);
  });

  it("reporting/analytics never receives the number", () => {
    for (const [name, src] of Object.entries({ authService, phoneScreen, signIn, otp })) {
      expect({ name, hit: /reportError\([^)]*\b(phone|e164|code)\b/i.test(src) }).toEqual({
        name,
        hit: false,
      });
    }
  });
});
