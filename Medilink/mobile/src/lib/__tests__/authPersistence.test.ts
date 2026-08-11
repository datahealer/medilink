/**
 * "Remember me" persistence (QA MED-018).
 *
 * The feature persisted a session but nothing the user could see: the Sign In form
 * hardcoded `remember: false` and never read the saved preference back, so the checkbox
 * reset to unchecked on every visit and signing in without re-ticking it silently turned
 * the feature off. The email field always started empty.
 *
 * THE SECURITY LINE THIS SUITE DEFENDS: only the EMAIL is stored. A password must never
 * be persisted, in SecureStore or anywhere else — that would turn "remember my email"
 * into a credential store, and a device compromise would yield the account rather than an
 * address. Several assertions below exist purely to make that regression loud.
 *
 * `expo-secure-store` is an in-memory Map under Jest (jest.setup.js), so these exercise
 * the real code paths.
 */
import * as SecureStore from "expo-secure-store";

import {
  getRememberSession,
  getRememberedEmail,
  setRememberSession,
  setRememberedEmail,
} from "../authPersistence";

/** The mock's backing Map, so we can inspect everything that was written. */
const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  store.clear();
});

describe("remembered email — the prefill", () => {
  it("returns null before the user has ever chosen to be remembered", async () => {
    // Fresh install: no prefill, checkbox unchecked — the previous default is preserved.
    await expect(getRememberedEmail()).resolves.toBeNull();
  });

  it("round-trips the address when the user opts in", async () => {
    await setRememberedEmail("patient@medilink.om");
    await expect(getRememberedEmail()).resolves.toBe("patient@medilink.om");
  });

  it("normalises the address, so the prefill matches what sign-in sends", async () => {
    await setRememberedEmail("  Patient@MediLink.OM  ");
    await expect(getRememberedEmail()).resolves.toBe("patient@medilink.om");
  });

  it("forgets the address when the user opts out", async () => {
    await setRememberedEmail("patient@medilink.om");
    await setRememberedEmail(null);
    await expect(getRememberedEmail()).resolves.toBeNull();
  });

  it("treats a blank value as forgetting, not as an empty prefill", async () => {
    await setRememberedEmail("patient@medilink.om");
    await setRememberedEmail("   ");
    await expect(getRememberedEmail()).resolves.toBeNull();
  });

  it("survives an app restart — the whole point of the feature", async () => {
    await setRememberedEmail("patient@medilink.om");
    // A cold launch re-reads SecureStore; nothing is held in module memory.
    await expect(getRememberedEmail()).resolves.toBe("patient@medilink.om");
  });

  it("survives sign-out, which is exactly when the prefill is needed", async () => {
    await setRememberedEmail("patient@medilink.om");
    await setRememberSession(false); // what a sign-out leaves behind
    await expect(getRememberedEmail()).resolves.toBe("patient@medilink.om");
  });
});

describe("remember-session flag — cold-launch behaviour is unchanged", () => {
  it("defaults to remembered when never set, so existing sessions are not dropped", async () => {
    await expect(getRememberSession()).resolves.toBe(true);
  });

  it("honours an explicit opt-out", async () => {
    await setRememberSession(false);
    await expect(getRememberSession()).resolves.toBe(false);
  });

  it("honours an explicit opt-in", async () => {
    await setRememberSession(true);
    await expect(getRememberSession()).resolves.toBe(true);
  });

  it("is independent of the remembered email", async () => {
    // Different jobs: this governs whether a SESSION survives a cold launch; the email
    // governs what the form prefills. Conflating them caused MED-018.
    await setRememberSession(false);
    await setRememberedEmail("patient@medilink.om");
    await expect(getRememberSession()).resolves.toBe(false);
    await expect(getRememberedEmail()).resolves.toBe("patient@medilink.om");
  });
});

describe("SECURITY — no password may ever be persisted", () => {
  const PASSWORD = "SuperSecret1!";

  it("stores nothing but the address for a remembered user", async () => {
    await setRememberSession(true);
    await setRememberedEmail("patient@medilink.om");

    const written = [...store.values()].join("|");
    expect(written).toContain("patient@medilink.om");
    expect(written).not.toContain(PASSWORD);
  });

  it("writes exactly two keys, both named for what they hold", async () => {
    await setRememberSession(true);
    await setRememberedEmail("patient@medilink.om");

    const keys = [...store.keys()].sort();
    expect(keys).toEqual(["medilink.rememberSession", "medilink.rememberedEmail"]);
    // No key may even hint at credential storage.
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain("password");
      expect(key.toLowerCase()).not.toContain("credential");
    }
  });

  it("exposes no setter that could accept a password", () => {
    // A future `setRememberedCredentials`-style helper would fail this.
    const api = require("../authPersistence");
    const names = Object.keys(api).join(" ").toLowerCase();
    expect(names).not.toContain("password");
    expect(names).not.toContain("credential");
  });
});
