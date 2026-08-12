/**
 * QA MED-022 — Settings must show the app version.
 *
 * The product decision is the MARKETING VERSION ONLY ("1.0.0" on both platforms), with no
 * build number. The last assertion locks that in, because "helpfully" appending a build
 * number later would silently violate the agreed spec.
 *
 * `expo-constants` exposes `expoConfig` as a non-configurable getter, so it cannot be
 * redefined on the real module — the module is mocked instead and the mock's value swapped
 * per case.
 */
import Constants from "expo-constants";

import appJson from "../../../app.json";
import { getAppVersion } from "../appVersion";

// Hoisted above the imports by babel-plugin-jest-hoist, so `getAppVersion` sees the mock.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.0.0-placeholder" } },
}));

const setConfig = (config: unknown) => {
  (Constants as unknown as { expoConfig: unknown }).expoConfig = config;
};

describe("getAppVersion — MED-022", () => {
  it("returns the version declared in the Expo config", () => {
    setConfig({ version: "1.0.0" });
    expect(getAppVersion()).toBe("1.0.0");
  });

  it("reads whatever app.json actually ships, so the label cannot drift from the build", () => {
    setConfig({ version: appJson.expo.version });
    expect(getAppVersion()).toBe(appJson.expo.version);
    // Guards the product decision at the source: app.json must carry a plain semver.
    expect(appJson.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("returns null rather than inventing a version when config is unavailable", () => {
    setConfig(null);
    expect(getAppVersion()).toBeNull();
    setConfig(undefined);
    expect(getAppVersion()).toBeNull();
  });

  it("treats a missing or blank version as absent", () => {
    setConfig({});
    expect(getAppVersion()).toBeNull();
    setConfig({ version: "   " });
    expect(getAppVersion()).toBeNull();
  });

  it("ignores a non-string version instead of rendering '[object Object]'", () => {
    setConfig({ version: 1 });
    expect(getAppVersion()).toBeNull();
  });

  it("trims incidental whitespace", () => {
    setConfig({ version: " 1.2.3 " });
    expect(getAppVersion()).toBe("1.2.3");
  });

  it("exposes ONLY the marketing version — never a build number", () => {
    // Even with native build numbers present on the config, they must not leak into the
    // user-facing string (product decision: iOS 1.0.0 / Android 1.0.0).
    setConfig({ version: "1.0.0", ios: { buildNumber: "12" }, android: { versionCode: 12 } });
    const shown = getAppVersion();
    expect(shown).toBe("1.0.0");
    expect(shown).not.toMatch(/12/);
    expect(shown).not.toMatch(/[()]/);
  });
});
