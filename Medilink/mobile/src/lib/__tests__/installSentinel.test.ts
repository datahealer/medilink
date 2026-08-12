import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  getRememberSession,
  isFreshInstall,
  markInstalled,
  setRememberedEmail,
  getRememberedEmail,
} from "../authPersistence";

/**
 * QA MED-010 — a reinstall must land on the Sign In / Create Account wall.
 *
 * The mechanism under test is the ASYMMETRY between the two stores: AsyncStorage is cleared
 * when the app is uninstalled, the keychain (SecureStore) is not. So "sentinel missing while
 * keychain state survives" is what identifies a reinstall. These tests model each store's
 * real uninstall behaviour explicitly.
 */

/** Uninstall: the app container goes, the keychain stays. */
function simulateUninstall() {
  (AsyncStorage as unknown as { __store: Map<string, string> }).__store.clear();
}

/** Wipe both stores — a device that has never seen the app. */
function simulateFactoryDevice() {
  (AsyncStorage as unknown as { __store: Map<string, string> }).__store.clear();
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
}

beforeEach(() => {
  simulateFactoryDevice();
});

describe("fresh-install sentinel — MED-010", () => {
  it("reports a fresh install on a device that has never launched the app", async () => {
    await expect(isFreshInstall()).resolves.toBe(true);
  });

  it("stops reporting a fresh install once marked", async () => {
    await markInstalled();
    await expect(isFreshInstall()).resolves.toBe(false);
  });

  it("still reports NOT-fresh across repeated cold launches (no false sign-outs)", async () => {
    await markInstalled();
    for (let launch = 0; launch < 5; launch++) {
      await expect(isFreshInstall()).resolves.toBe(false);
    }
  });

  it("THE BUG: reports fresh again after an uninstall, even though the keychain survived", async () => {
    // First install: user signs in and is remembered.
    await markInstalled();
    await setRememberedEmail("patient@example.com");
    expect(await isFreshInstall()).toBe(false);

    simulateUninstall();

    // The keychain still holds the previous user's data — this is the real iOS behaviour
    // that caused MED-010 — but the sentinel is gone, so we detect the reinstall.
    expect(await getRememberedEmail()).toBe("patient@example.com");
    await expect(isFreshInstall()).resolves.toBe(true);
  });

  it("remember-me alone could NOT have caught this — it defaults to 'remember' when unset", async () => {
    // Why the fresh-install check has to run BEFORE the remember-me branch in AuthProvider:
    // after an uninstall the preference is either absent (→ remember) or a surviving "1",
    // so remember-me would restore the inherited session in both cases.
    simulateUninstall();
    await expect(getRememberSession()).resolves.toBe(true);
    await expect(isFreshInstall()).resolves.toBe(true);
  });

  it("uses a key in AsyncStorage and NOT in SecureStore (or it would survive uninstall)", async () => {
    await markInstalled();

    const asyncKeys = [...(AsyncStorage as unknown as { __store: Map<string, string> }).__store.keys()];
    const secureKeys = [...(SecureStore as unknown as { __store: Map<string, string> }).__store.keys()];

    expect(asyncKeys).toContain("medilink.installSentinel");
    expect(secureKeys).not.toContain("medilink.installSentinel");
  });

  it("fails CLOSED — an unreadable store reports fresh, costing a sign-in not a data leak", async () => {
    const spy = jest
      .spyOn(AsyncStorage, "getItem")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(isFreshInstall()).resolves.toBe(true);
    spy.mockRestore();
  });

  it("markInstalled never throws, so a cold start cannot crash on a failed write", async () => {
    const spy = jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(markInstalled()).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("does not disturb the remember-me flag it sits next to", async () => {
    await markInstalled();
    // markInstalled must not write the remember preference; unset still means "remember".
    await expect(getRememberSession()).resolves.toBe(true);
    await expect(getRememberedEmail()).resolves.toBeNull();
  });
});
