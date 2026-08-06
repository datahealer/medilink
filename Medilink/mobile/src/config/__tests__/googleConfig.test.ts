/**
 * Platform gate for native Google sign-in (`isGoogleConfigured` in src/config/env.ts).
 *
 * Worth testing because both failure directions are damaging and neither is visible in
 * a simulator run:
 *   • too permissive on iOS  → an enabled button that throws inside GoogleSignin.configure(),
 *     and — worse — a social login shipping on iOS without Sign in with Apple, which is an
 *     App Store Guideline 4.8 rejection.
 *   • too strict on Android  → the button silently vanishes in production.
 *
 * env.ts asserts the production guard at module scope, so every case sets a valid
 * APP_ENV/DATA_MODE pair before importing.
 */

const ORIGINAL_ENV = process.env;

/** Load env.ts fresh with a given platform + Google client ID configuration. */
function loadIsGoogleConfigured(
  platform: "ios" | "android",
  vars: Partial<Record<"WEB" | "IOS" | "ANDROID", string>>
): boolean {
  let result!: boolean;
  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: platform } }));
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_DATA_MODE: "mock",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: vars.WEB,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: vars.IOS,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: vars.ANDROID,
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = require("../env").isGoogleConfigured;
  });
  return result;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("isGoogleConfigured", () => {
  describe("Android", () => {
    it("is enabled by the WEB client ID alone (it is the ID-token audience)", () => {
      expect(loadIsGoogleConfigured("android", { WEB: "web-id" })).toBe(true);
    });

    it("does NOT require the Android client ID — nothing in code reads it", () => {
      expect(loadIsGoogleConfigured("android", { WEB: "web-id", ANDROID: undefined })).toBe(
        true
      );
    });

    it("is disabled without the WEB client ID", () => {
      expect(loadIsGoogleConfigured("android", { ANDROID: "android-id" })).toBe(false);
    });
  });

  describe("iOS", () => {
    it("stays DISABLED with only the WEB client ID — the 4.8 safeguard", () => {
      // Regression guard for the old `WEB && (ANDROID || IOS)` rule, which reported
      // "configured" on iOS whenever the Android ID happened to be set.
      expect(loadIsGoogleConfigured("ios", { WEB: "web-id", ANDROID: "android-id" })).toBe(
        false
      );
    });

    it("is enabled only once the iOS client ID is also present", () => {
      expect(loadIsGoogleConfigured("ios", { WEB: "web-id", IOS: "ios-id" })).toBe(true);
    });

    it("is disabled with the iOS client ID but no WEB client ID", () => {
      expect(loadIsGoogleConfigured("ios", { IOS: "ios-id" })).toBe(false);
    });
  });

  it("treats blank-but-present values as absent", () => {
    expect(loadIsGoogleConfigured("android", { WEB: "   " })).toBe(false);
  });
});
