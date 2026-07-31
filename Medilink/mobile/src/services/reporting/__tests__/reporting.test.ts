/**
 * Error-reporting contract.
 *
 * Two properties matter enough to protect, and both are the kind of thing that breaks
 * silently — you only discover it when a production crash never arrives, or when a build
 * that predates the SDK refuses to start:
 *
 *   1. With no DSN configured the Sentry SDK must never be loaded at all. Not "loaded but
 *      inert" — never required. That is what makes adding a native dependency safe for
 *      builds that shipped before it existed.
 *   2. Console output must survive regardless, so a developer with no DSN (i.e. everyone,
 *      locally) never loses a stack trace to a reporter that quietly swallowed it.
 */
import path from "path";

import { initReporting, isReportingActive, reportError, resetReportingForTests } from "..";

describe("error reporting", () => {
  let consoleError: jest.SpyInstance;
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    resetReportingForTests();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // The test env sets no EXPO_PUBLIC_SENTRY_DSN, which is exactly the shipped default.
  it("stays inert when no DSN is configured", () => {
    initReporting();
    expect(isReportingActive()).toBe(false);
  });

  it("never loads the Sentry SDK without a DSN", () => {
    // Proves property 1 directly: if `init` had required the module, it would be in the
    // Jest module registry. Asserting on the registry (rather than on a mock) is what makes
    // this a real check — a mocked SDK would happily "not be called" while still loading.
    initReporting();
    const loaded = Object.keys(require.cache ?? {}).some((p) =>
      p.includes(`@sentry${path.sep}react-native`)
    );
    expect(loaded).toBe(false);
  });

  it("is idempotent", () => {
    initReporting();
    initReporting();
    initReporting();
    // The dev-mode "reporting disabled" notice should be logged once, not once per call.
    expect(consoleLog).toHaveBeenCalledTimes(1);
  });

  it("still logs errors to the console when inert", () => {
    initReporting();
    const boom = new Error("kaboom");
    reportError(boom);
    expect(consoleError).toHaveBeenCalledWith("[MediLink]", boom, "");
  });

  it("passes extra context through to the console", () => {
    initReporting();
    const boom = new Error("kaboom");
    reportError(boom, { tags: { surface: "test" }, extra: { componentStack: "<App/>" } });
    expect(consoleError).toHaveBeenCalledWith("[MediLink]", boom, {
      componentStack: "<App/>",
    });
  });

  it("accepts a non-Error throw without itself throwing", () => {
    initReporting();
    // RN code can `throw "string"`; a reporter that assumes Error would crash the handler
    // it was called from — turning a recoverable error into a hard crash.
    expect(() => reportError("plain string")).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("reports even if init was never called", () => {
    // A module-scope throw can beat `initReporting()`. Reporting must degrade to console
    // rather than blow up on an uninitialised client.
    expect(() => reportError(new Error("early"))).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
  });
});
