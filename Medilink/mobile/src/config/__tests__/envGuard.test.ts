import {
  assertProductionEnv,
  checkProductionEnv,
  readEnvSnapshot,
} from "../envGuard.js";

/**
 * This guard exists to stop the single worst outcome the project can produce: a release
 * build that serves seeded fake patient data as if it were real. It fails silently
 * without the guard, so the guard itself is worth testing exactly.
 */
describe("checkProductionEnv", () => {
  it("allows the intended production combination", () => {
    expect(
      checkProductionEnv({ APP_ENV: "production", DATA_MODE: "production" })
    ).toBeNull();
  });

  it("allows the intended staging combination", () => {
    expect(checkProductionEnv({ APP_ENV: "staging", DATA_MODE: "staging" })).toBeNull();
  });

  it("allows local development on mock data", () => {
    // The everyday default must stay frictionless.
    expect(checkProductionEnv({ APP_ENV: "development", DATA_MODE: "mock" })).toBeNull();
    expect(checkProductionEnv({})).toBeNull();
  });

  it("allows a developer pointing local at staging or production", () => {
    expect(checkProductionEnv({ APP_ENV: "development", DATA_MODE: "staging" })).toBeNull();
    expect(checkProductionEnv({ APP_ENV: "development", DATA_MODE: "production" })).toBeNull();
  });

  it("REJECTS a production build left on mock data (blocker B1)", () => {
    const msg = checkProductionEnv({ APP_ENV: "production", DATA_MODE: "mock" });
    expect(msg).toContain("Refusing to build");
    expect(msg).toContain("mock");
  });

  it("REJECTS a production build pointed at staging", () => {
    // Release users must not silently hit the staging backend.
    expect(checkProductionEnv({ APP_ENV: "production", DATA_MODE: "staging" })).toContain(
      "Refusing to build"
    );
  });

  it("REJECTS a production build with DATA_MODE unset", () => {
    // The exact silent-failure case: unset collapses to "mock" in env.ts.
    expect(checkProductionEnv({ APP_ENV: "production" })).toContain("Refusing to build");
  });

  it("REJECTS any tester-facing build on mock data", () => {
    expect(checkProductionEnv({ APP_ENV: "staging", DATA_MODE: "mock" })).toContain(
      "Refusing to build"
    );
    expect(checkProductionEnv({ APP_ENV: "preview", DATA_MODE: "mock" })).toContain(
      "Refusing to build"
    );
  });

  it("treats an unrecognised DATA_MODE as mock, exactly like env.ts", () => {
    // env.ts collapses anything unknown to "mock"; the guard must agree or a typo
    // like DATA_MODE=prod would slip through as mock data in a release build.
    expect(checkProductionEnv({ APP_ENV: "production", DATA_MODE: "prod" })).toContain(
      "Refusing to build"
    );
  });

  it("is case- and whitespace-insensitive", () => {
    expect(checkProductionEnv({ APP_ENV: " PRODUCTION ", DATA_MODE: " Production " })).toBeNull();
    expect(checkProductionEnv({ APP_ENV: "Production", DATA_MODE: "MOCK" })).toContain(
      "Refusing to build"
    );
  });
});

describe("readEnvSnapshot", () => {
  it("picks only the two variables the guard depends on", () => {
    expect(
      readEnvSnapshot({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_DATA_MODE: "production",
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      })
    ).toEqual({ APP_ENV: "production", DATA_MODE: "production" });
  });
});

describe("assertProductionEnv", () => {
  it("throws on an unsafe combination", () => {
    expect(() =>
      assertProductionEnv({ EXPO_PUBLIC_APP_ENV: "production", EXPO_PUBLIC_DATA_MODE: "mock" })
    ).toThrow(/Refusing to build/);
  });

  it("does not throw on a safe combination", () => {
    expect(() =>
      assertProductionEnv({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_DATA_MODE: "production",
      })
    ).not.toThrow();
  });
});
