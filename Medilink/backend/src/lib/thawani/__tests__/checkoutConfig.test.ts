import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CHECKOUT_REQUIRED_ENV,
  ThawaniCheckoutConfigError,
  assertCheckoutConfigured,
  buildCheckoutUrl,
  checkoutConfigProblems,
  checkoutStatusLine,
  isCheckoutConfigured,
  missingCheckoutEnv,
} from "../checkoutConfig.ts";

/**
 * These tests encode the two production failures that produced an unexplained
 * "404 — Oops! We couldn't find that page" on Thawani's hosted payment page:
 * an interpolated `undefined` publishable key, and a silent UAT host fallback.
 */

const UAT = "https://uatcheckout.thawani.om";
const PROD = "https://checkout.thawani.om";
const KEY = "HGvTMLDssJghr9tlN9gr4DVYt0qyBy"; // shape-only stand-in, not a live credential
const SESSION = "checkout_ABC123";

const ok = () => ({
  THAWANI_BASE_URL: `${UAT}/api/v1`,
  THAWANI_CHECKOUT_BASE_URL: UAT,
  THAWANI_PUBLISHABLE_KEY: KEY,
});

describe("a sound configuration builds Thawani's documented URL", () => {
  it("format is {host}/pay/{session}?key={publishable}", () => {
    assert.equal(buildCheckoutUrl(ok(), SESSION), `${UAT}/pay/${SESSION}?key=${KEY}`);
  });

  it("isCheckoutConfigured is true and there are no problems", () => {
    assert.equal(isCheckoutConfigured(ok()), true);
    assert.deepEqual(checkoutConfigProblems(ok()), []);
    assert.doesNotThrow(() => assertCheckoutConfigured(ok()));
  });

  it("a trailing slash on the host does not produce a double slash", () => {
    const env = { ...ok(), THAWANI_CHECKOUT_BASE_URL: `${UAT}/` };
    assert.equal(buildCheckoutUrl(env, SESSION), `${UAT}/pay/${SESSION}?key=${KEY}`);
  });

  it("production hosts on both variables are equally valid", () => {
    const env = { THAWANI_BASE_URL: `${PROD}/api/v1`, THAWANI_CHECKOUT_BASE_URL: PROD, THAWANI_PUBLISHABLE_KEY: KEY };
    assert.equal(buildCheckoutUrl(env, SESSION), `${PROD}/pay/${SESSION}?key=${KEY}`);
  });
});

describe("REGRESSION: the publishable key is never interpolated blind", () => {
  it("an unset key throws instead of producing ?key=undefined", () => {
    const env = { ...ok(), THAWANI_PUBLISHABLE_KEY: undefined };
    assert.throws(() => buildCheckoutUrl(env, SESSION), ThawaniCheckoutConfigError);
    // The exact string that made Thawani answer 404 must be impossible to emit.
    assert.equal(isCheckoutConfigured(env), false);
    assert.ok(missingCheckoutEnv(env).includes("THAWANI_PUBLISHABLE_KEY"));
  });

  it("a blank / whitespace-only key counts as absent", () => {
    for (const bad of ["", "   ", "\n", "\r\n"]) {
      const env = { ...ok(), THAWANI_PUBLISHABLE_KEY: bad };
      assert.equal(isCheckoutConfigured(env), false, `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });

  it("a key pasted with a trailing newline is trimmed, not sent as %0A", () => {
    const env = { ...ok(), THAWANI_PUBLISHABLE_KEY: `${KEY}\r\n` };
    assert.equal(buildCheckoutUrl(env, SESSION), `${UAT}/pay/${SESSION}?key=${KEY}`);
  });

  it("a key with interior whitespace is reported, not silently encoded", () => {
    const env = { ...ok(), THAWANI_PUBLISHABLE_KEY: "HGvTML DssJghr9" };
    const problems = checkoutConfigProblems(env);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /whitespace or control characters/);
  });
});

describe("REGRESSION: no silent host fallback", () => {
  it("an unset checkout host throws rather than defaulting to UAT", () => {
    const env = { ...ok(), THAWANI_CHECKOUT_BASE_URL: undefined };
    assert.throws(() => buildCheckoutUrl(env, SESSION), ThawaniCheckoutConfigError);
    assert.ok(missingCheckoutEnv(env).includes("THAWANI_CHECKOUT_BASE_URL"));
  });

  it("the UAT host is not reachable as a default from an empty environment", () => {
    assert.throws(() => buildCheckoutUrl({}, SESSION), ThawaniCheckoutConfigError);
    assert.deepEqual(missingCheckoutEnv({}), [...CHECKOUT_REQUIRED_ENV]);
  });

  it("a non-absolute or non-https host is rejected", () => {
    assert.match(
      checkoutConfigProblems({ ...ok(), THAWANI_CHECKOUT_BASE_URL: "uatcheckout.thawani.om" }).join(),
      /not an absolute URL/
    );
    assert.match(
      checkoutConfigProblems({ ...ok(), THAWANI_CHECKOUT_BASE_URL: "http://uatcheckout.thawani.om" }).join(),
      /must be https/
    );
  });
});

describe("REGRESSION: the production-cutover trap", () => {
  it("API on production with checkout on UAT is refused", () => {
    const env = { ...ok(), THAWANI_BASE_URL: `${PROD}/api/v1`, THAWANI_CHECKOUT_BASE_URL: UAT };
    const problems = checkoutConfigProblems(env);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /environment mismatch/);
    assert.throws(() => buildCheckoutUrl(env, SESSION), ThawaniCheckoutConfigError);
  });

  it("the mirror image — API on UAT with checkout on production — is equally refused", () => {
    const env = { ...ok(), THAWANI_BASE_URL: `${UAT}/api/v1`, THAWANI_CHECKOUT_BASE_URL: PROD };
    assert.match(checkoutConfigProblems(env).join(), /environment mismatch/);
  });

  it("an unset API host does not fabricate a mismatch", () => {
    const env = { ...ok(), THAWANI_BASE_URL: undefined };
    assert.deepEqual(checkoutConfigProblems(env), []);
  });
});

describe("failures are actionable and report every problem at once", () => {
  it("both missing variables are named in one message", () => {
    assert.throws(
      () => assertCheckoutConfigured({}),
      (err: unknown) => {
        assert.ok(err instanceof ThawaniCheckoutConfigError);
        assert.match(err.message, /THAWANI_CHECKOUT_BASE_URL/);
        assert.match(err.message, /THAWANI_PUBLISHABLE_KEY/);
        return true;
      }
    );
  });

  it("an empty session id is refused even with sound config", () => {
    assert.throws(() => buildCheckoutUrl(ok(), "   "), /session id is empty/);
  });
});

describe("THE CREDENTIAL NEVER ESCAPES", () => {
  it("the status line reports the host and never the key", () => {
    const line = checkoutStatusLine(ok());
    assert.match(line, /ready/);
    assert.match(line, /uatcheckout\.thawani\.om/);
    assert.equal(line.includes(KEY), false);
  });

  it("no problem message ever contains the key value", () => {
    const env = { ...ok(), THAWANI_CHECKOUT_BASE_URL: "not-a-url" };
    const text = checkoutConfigProblems(env).join(" ") + checkoutStatusLine(env);
    assert.equal(text.includes(KEY), false);
  });
});
