import {
  AUTH_ROUTE_SIGN_IN,
  AUTH_ROUTE_SIGN_UP,
  crossLinkAction,
} from "../authNav";

/**
 * QA MED-023 — Guest → Sign In → Sign Up → Back must return to Sign In.
 *
 * These assert the STACK CONTRACT rather than a rendered screen, deliberately: the defect was
 * invisible to a render test (both screens rendered perfectly) and lived entirely in which
 * navigation verb was used. A render test would still pass with the bug present.
 */
describe("crossLinkAction — MED-023", () => {
  it("pushes to sign-up from the reported guest-wall flow, so Back returns to Sign In", () => {
    // welcome --push--> sign-in, now tapping "Create one"
    const stack = ["welcome", AUTH_ROUTE_SIGN_IN];
    expect(crossLinkAction(stack, AUTH_ROUTE_SIGN_UP)).toBe("push");
  });

  it("pops back to sign-in when sign-in is the screen directly below (no duplicate)", () => {
    // welcome --push--> sign-in --push--> sign-up, now tapping "Sign in"
    const stack = ["welcome", AUTH_ROUTE_SIGN_IN, AUTH_ROUTE_SIGN_UP];
    expect(crossLinkAction(stack, AUTH_ROUTE_SIGN_IN)).toBe("back");
  });

  it("pushes to sign-in when sign-up was entered directly from the guest wall", () => {
    // welcome --push--> sign-up (never visited sign-in), now tapping "Sign in"
    const stack = ["welcome", AUTH_ROUTE_SIGN_UP];
    expect(crossLinkAction(stack, AUTH_ROUTE_SIGN_IN)).toBe("push");
  });

  it("pops back to sign-up in the REVERSE flow", () => {
    const stack = ["welcome", AUTH_ROUTE_SIGN_UP, AUTH_ROUTE_SIGN_IN];
    expect(crossLinkAction(stack, AUTH_ROUTE_SIGN_UP)).toBe("back");
  });

  it("never grows the stack when the user toggles Sign In ↔ Sign Up repeatedly", () => {
    // This is the property `replace()` was protecting and a blanket `push()` would lose.
    let stack = ["welcome", AUTH_ROUTE_SIGN_IN];
    const targets = [
      AUTH_ROUTE_SIGN_UP,
      AUTH_ROUTE_SIGN_IN,
      AUTH_ROUTE_SIGN_UP,
      AUTH_ROUTE_SIGN_IN,
      AUTH_ROUTE_SIGN_UP,
    ];

    for (const target of targets) {
      const action = crossLinkAction(stack, target);
      stack = action === "back" ? stack.slice(0, -1) : [...stack, target];
      // Guest wall + at most one of each auth screen.
      expect(stack.length).toBeLessThanOrEqual(3);
    }

    // Still rooted at the guest wall, so Back eventually reaches it.
    expect(stack[0]).toBe("welcome");
  });

  it("pushes when there is nothing below us (deep link straight into an auth screen)", () => {
    expect(crossLinkAction([AUTH_ROUTE_SIGN_UP], AUTH_ROUTE_SIGN_IN)).toBe("push");
    expect(crossLinkAction([], AUTH_ROUTE_SIGN_IN)).toBe("push");
  });

  it("ignores routes deeper in the stack — only the immediate predecessor counts", () => {
    // sign-in is present but NOT directly below, so popping once would land on otp.
    const stack = ["welcome", AUTH_ROUTE_SIGN_IN, "otp", AUTH_ROUTE_SIGN_UP];
    expect(crossLinkAction(stack, AUTH_ROUTE_SIGN_IN)).toBe("push");
  });

  it("uses the filename-derived route names the auth stack actually reports", () => {
    // A rename in app/auth/ without updating these constants would silently degrade the
    // rule to "always push" — caught here rather than on a device.
    expect(AUTH_ROUTE_SIGN_IN).toBe("sign-in");
    expect(AUTH_ROUTE_SIGN_UP).toBe("sign-up");
  });
});
