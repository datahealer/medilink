/**
 * Account deletion / restore lifecycle (QA MED-016, NEW-001).
 *
 * THE DEFECT THIS SUITE DEFENDS AGAINST: requesting deletion used to set
 * `profiles.status = 'deletion_pending'` and nothing else. Nothing consumed that status, so
 * the account kept a valid session, could sign in again, and kept reading PHI for the whole
 * 30-day grace period.
 *
 * The real fix is a RESTRICTIVE RLS policy (migration 20260811020000) — a database boundary
 * these tests cannot reach, and deliberately so: it holds even with the app bypassed
 * entirely. What IS testable here is the contract the UI depends on to route a pending
 * account to the restore-only screen instead of the app, and the state machine behind it.
 *
 * The old mock signed the user OUT on deleteAccount(), which made the restore flow
 * unreachable in mock mode and silently contradicted the real backend. Several assertions
 * below exist to keep those two in step.
 */
import { mockRepositories } from "../mock";

const auth = mockRepositories.auth;

const SIGN_IN = { email: "demo@medilink.test", password: "Demo1234!" };

beforeEach(async () => {
  // Reset to a clean signed-in, active account.
  await auth.signIn(SIGN_IN);
  await auth.cancelDeletion();
});

describe("status reporting", () => {
  it("reports active for a normal signed-in account", async () => {
    await expect(auth.getAccountStatus()).resolves.toBe("active");
  });

  it("reports null when there is no session, so the gate cannot act on a stale status", async () => {
    await auth.signOut();
    await expect(auth.getAccountStatus()).resolves.toBeNull();
  });
});

describe("requesting deletion", () => {
  it("moves the account into the grace window", async () => {
    await auth.deleteAccount();
    await expect(auth.getAccountStatus()).resolves.toBe("deletion_pending");
  });

  it("KEEPS the session — the restore screen is unreachable without one", async () => {
    // The previous mock nulled the session here. That contradicted the backend (which
    // leaves this device signed in so the account can still be restored) and made the
    // restore-only screen impossible to reach in mock mode.
    await auth.deleteAccount();
    await expect(auth.restoreSession()).resolves.not.toBeNull();
  });

  it("is idempotent — asking twice stays pending rather than erroring", async () => {
    await auth.deleteAccount();
    const second = await auth.deleteAccount();
    expect(second.ok).toBe(true);
    await expect(auth.getAccountStatus()).resolves.toBe("deletion_pending");
  });
});

describe("restoring", () => {
  it("returns the account to active", async () => {
    await auth.deleteAccount();
    const res = await auth.cancelDeletion();
    expect(res.ok).toBe(true);
    await expect(auth.getAccountStatus()).resolves.toBe("active");
  });

  it("survives a full delete → restore → delete cycle", async () => {
    // A user who changes their mind twice must not end up wedged in either state.
    await auth.deleteAccount();
    await auth.cancelDeletion();
    await expect(auth.getAccountStatus()).resolves.toBe("active");
    await auth.deleteAccount();
    await expect(auth.getAccountStatus()).resolves.toBe("deletion_pending");
  });

  it("keeps the session intact throughout, so no re-login is needed after restoring", async () => {
    await auth.deleteAccount();
    await auth.cancelDeletion();
    await expect(auth.restoreSession()).resolves.not.toBeNull();
  });
});

describe("the routing signal the (app) gate reads", () => {
  // The gate diverts to /restore-account on exactly one value. Pinning it here means a
  // rename of the enum member cannot silently disable the redirect.
  it("uses the literal 'deletion_pending', matching the account_status DB enum", async () => {
    await auth.deleteAccount();
    const status = await auth.getAccountStatus();
    expect(status).toBe("deletion_pending");
  });

  it("never reports deletion_pending for an account that did not request deletion", async () => {
    await expect(auth.getAccountStatus()).resolves.not.toBe("deletion_pending");
  });
});
