/**
 * Native Google sign-in (src/services/googleAuth.ts).
 *
 * These tests exist because every failure mode here is silent-by-default in QA: a
 * cancelled sheet that shows an error box, a DEVELOPER_ERROR from an unregistered
 * SHA-1, or an ID token that never reaches Supabase all look like "the button doesn't
 * work". They assert the CONTRACT (what the caller sees), not the SDK's internals.
 *
 * The Google SDK and the Supabase client are both mocked — no network, no native module.
 */

const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn();
const mockSignIn = jest.fn();
const mockGoogleSignOut = jest.fn();
const mockSignInWithIdToken = jest.fn();

/** Mirrors the real `statusCodes` shape closely enough for the switch under test. */
const mockStatusCodes = {
  SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
  IN_PROGRESS: "IN_PROGRESS",
  PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
};

class MockCodedError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    hasPlayServices: (...a: unknown[]) => mockHasPlayServices(...a),
    signIn: (...a: unknown[]) => mockSignIn(...a),
    signOut: (...a: unknown[]) => mockGoogleSignOut(...a),
  },
  isErrorWithCode: (e: unknown) => e instanceof MockCodedError,
  statusCodes: mockStatusCodes,
}));

jest.mock("@medilink/shared/mobile", () => ({
  api: { auth: { signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}));

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

/** Swapped per-test to exercise the configured / not-configured branches. */
let mockGoogleConfigured = true;
jest.mock("@/config/env", () => ({
  get isGoogleConfigured() {
    return mockGoogleConfigured;
  },
  env: {
    GOOGLE_WEB_CLIENT_ID: "web-client-id.apps.googleusercontent.com",
    GOOGLE_IOS_CLIENT_ID: undefined,
  },
}));

/** Fresh module registry each test — googleAuth memoises `configure()` in a closure. */
function loadModule() {
  let mod!: typeof import("../googleAuth");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../googleAuth");
  });
  return mod;
}

beforeEach(() => {
  mockGoogleConfigured = true;
  mockHasPlayServices.mockResolvedValue(true);
  mockSignInWithIdToken.mockResolvedValue({ user: { id: "u1" }, session: {} });
});

describe("signInWithGoogle", () => {
  it("exchanges the ID token for a Supabase session on success", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "id-token-abc" } });

    const result = await loadModule().signInWithGoogle();

    expect(result).toEqual({ status: "success" });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith(
      {},
      { provider: "google", token: "id-token-abc" }
    );
  });

  it("configures the SDK with the WEB client id (the Android token audience)", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });

    await loadModule().signInWithGoogle();

    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        webClientId: "web-client-id.apps.googleusercontent.com",
        offlineAccess: false,
      })
    );
  });

  it("requests only identity scopes — never Calendar", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });

    await loadModule().signInWithGoogle();

    const { scopes } = mockConfigure.mock.calls[0][0] as { scopes: string[] };
    expect(scopes).toEqual(["openid", "email", "profile"]);
    expect(scopes.some((s) => s.includes("calendar"))).toBe(false);
  });

  it("only configures the SDK once across repeated sign-ins", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });
    const mod = loadModule();

    await mod.signInWithGoogle();
    await mod.signInWithGoogle();

    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it("treats the v13+ cancelled response as a silent cancel", async () => {
    mockSignIn.mockResolvedValue({ type: "cancelled" });

    expect(await loadModule().signInWithGoogle()).toEqual({ status: "cancelled" });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("treats a thrown SIGN_IN_CANCELLED as a silent cancel", async () => {
    mockSignIn.mockRejectedValue(new MockCodedError(mockStatusCodes.SIGN_IN_CANCELLED));

    expect(await loadModule().signInWithGoogle()).toEqual({ status: "cancelled" });
  });

  it("treats IN_PROGRESS (double-tap) as a cancel, not an error", async () => {
    mockSignIn.mockRejectedValue(new MockCodedError(mockStatusCodes.IN_PROGRESS));

    expect(await loadModule().signInWithGoogle()).toEqual({ status: "cancelled" });
  });

  it("reports a dedicated message when Play Services is unavailable", async () => {
    mockSignIn.mockRejectedValue(
      new MockCodedError(mockStatusCodes.PLAY_SERVICES_NOT_AVAILABLE)
    );

    expect(await loadModule().signInWithGoogle()).toEqual({
      status: "error",
      messageKey: "errors.googlePlayServices",
    });
  });

  it("reports a generic failure for DEVELOPER_ERROR (unregistered SHA-1)", async () => {
    mockSignIn.mockRejectedValue(new MockCodedError("DEVELOPER_ERROR"));

    expect(await loadModule().signInWithGoogle()).toEqual({
      status: "error",
      messageKey: "errors.googleSignInFailed",
    });
  });

  it("distinguishes a missing ID token from a generic failure", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: null } });

    expect(await loadModule().signInWithGoogle()).toEqual({
      status: "error",
      messageKey: "errors.googleNoToken",
    });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase rejection (bad audience / expired token) as an error", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });
    mockSignInWithIdToken.mockRejectedValue(new Error("Invalid audience"));

    expect(await loadModule().signInWithGoogle()).toEqual({
      status: "error",
      messageKey: "errors.googleSignInFailed",
    });
  });

  it("never touches the SDK when the platform is unconfigured", async () => {
    mockGoogleConfigured = false;

    expect(await loadModule().signInWithGoogle()).toEqual({
      status: "error",
      messageKey: "errors.googleNotConfigured",
    });
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("does not throw out of the button handler when the SDK misbehaves", async () => {
    mockSignIn.mockRejectedValue("a bare string, not an Error");

    await expect(loadModule().signInWithGoogle()).resolves.toEqual({
      status: "error",
      messageKey: "errors.googleSignInFailed",
    });
  });
});

describe("signOutGoogle", () => {
  it("clears the cached Google account so the chooser reappears", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });
    const mod = loadModule();
    await mod.signInWithGoogle();

    await mod.signOutGoogle();

    expect(mockGoogleSignOut).toHaveBeenCalled();
  });

  it("is a no-op before any sign-in (SDK never configured)", async () => {
    await loadModule().signOutGoogle();

    expect(mockGoogleSignOut).not.toHaveBeenCalled();
  });

  it("swallows SDK errors so Supabase sign-out is never blocked", async () => {
    mockSignIn.mockResolvedValue({ type: "success", data: { idToken: "t" } });
    const mod = loadModule();
    await mod.signInWithGoogle();
    mockGoogleSignOut.mockRejectedValue(new Error("boom"));

    await expect(mod.signOutGoogle()).resolves.toBeUndefined();
  });
});
