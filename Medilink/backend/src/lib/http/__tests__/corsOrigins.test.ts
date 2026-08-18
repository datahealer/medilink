import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEV_ORIGIN,
  allowedOrigins,
  corsRejectionLog,
  isOriginAllowed,
  resolveAllowedOrigin,
  normalizeOrigin,
  type CorsEnv,
} from "../corsOrigins.ts";

/**
 * CORS allow-list rules.
 *
 * The property under test is two-sided, and both halves are load-bearing:
 *
 *   1. The real frontend origin MUST be allowed once configured — the deployed backend returned
 *      no `Access-Control-Allow-Origin` for ANY origin, which broke every browser call from the
 *      web app while the server logs looked perfectly healthy.
 *
 *   2. Nothing else may EVER be allowed. This is credentialed CORS: the response carries
 *      `Access-Control-Allow-Credentials: true`, so an over-broad allow-list would let another
 *      site read authenticated responses containing PHI.
 *
 * The tests that matter most are therefore the negative ones.
 */

const PROD: CorsEnv = { NODE_ENV: "production" };
const DEV: CorsEnv = { NODE_ENV: "development" };
const APP = "https://medilink-frontend.vercel.app";

describe("normalizeOrigin", () => {
  it("strips a trailing slash — the copy-paste failure mode", () => {
    // `https://app.example.com/` is what you get from a browser address bar, and under exact
    // string matching it never equalled the Origin header. Silent, total failure.
    assert.equal(normalizeOrigin("https://app.example.com/"), "https://app.example.com");
  });

  it("lowercases the host (scheme and host are case-insensitive per RFC 3986)", () => {
    assert.equal(normalizeOrigin("HTTPS://App.Example.COM"), "https://app.example.com");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizeOrigin("  https://app.example.com  "), "https://app.example.com");
  });

  it("preserves a non-default port", () => {
    assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
  });

  it("drops any path, query or fragment — an Origin has none", () => {
    assert.equal(normalizeOrigin("https://app.example.com/dashboard?a=1#x"), "https://app.example.com");
  });

  it("returns '' for values that must never match", () => {
    for (const bad of [
      "", "   ", "not-a-url", "app.example.com", "//app.example.com",
      "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x",
      "null", "*", undefined, null,
    ]) {
      assert.equal(normalizeOrigin(bad as string), "", `must reject ${JSON.stringify(bad)}`);
    }
  });
});

describe("allowedOrigins", () => {
  it("is EMPTY when nothing is configured in production — the observed production state", () => {
    assert.equal(allowedOrigins(PROD).size, 0);
  });

  it("accepts FRONTEND_URL (the runtime variable)", () => {
    assert.deepEqual([...allowedOrigins({ ...PROD, FRONTEND_URL: APP })], [APP]);
  });

  it("accepts NEXT_PUBLIC_FRONTEND_URL (build-inlined) for backwards compatibility", () => {
    assert.deepEqual([...allowedOrigins({ ...PROD, NEXT_PUBLIC_FRONTEND_URL: APP })], [APP]);
  });

  it("merges both variables without duplicating", () => {
    const s = allowedOrigins({ ...PROD, FRONTEND_URL: APP, NEXT_PUBLIC_FRONTEND_URL: APP });
    assert.equal(s.size, 1);
  });

  it("accepts a comma-separated list, so prod + preview + custom domain can coexist", () => {
    const s = allowedOrigins({
      ...PROD,
      FRONTEND_URL: `${APP}, https://medilink.om ,https://app.medilink.om/`,
    });
    assert.equal(s.size, 3);
    assert.ok(s.has(APP));
    assert.ok(s.has("https://medilink.om"));
    assert.ok(s.has("https://app.medilink.om"), "trailing slash normalised inside a list");
  });

  it("drops unparseable entries from a list instead of failing the whole list", () => {
    const s = allowedOrigins({ ...PROD, FRONTEND_URL: `${APP},garbage,,https://ok.example` });
    assert.equal(s.size, 2);
  });
});

describe("localhost is dev-only", () => {
  it("is allowed outside production", () => {
    assert.ok(allowedOrigins(DEV).has(DEV_ORIGIN));
    assert.equal(isOriginAllowed(DEV_ORIGIN, DEV), true);
  });

  it("is REFUSED in production", () => {
    // The original vulnerability: production reflected localhost:3000 with credentials, so
    // anything a patient ran on their own port 3000 could read production responses.
    assert.equal(isOriginAllowed(DEV_ORIGIN, PROD), false);
    assert.equal(isOriginAllowed(DEV_ORIGIN, { ...PROD, FRONTEND_URL: APP }), false);
  });
});

describe("isOriginAllowed — the negative cases are the important ones", () => {
  const env: CorsEnv = { ...PROD, FRONTEND_URL: APP };

  it("allows the configured origin, however it is cased or slashed in the header", () => {
    for (const variant of [APP, `${APP}/`, APP.toUpperCase().replace("HTTPS", "https")]) {
      assert.equal(isOriginAllowed(variant, env), true, `should allow ${variant}`);
    }
  });

  it("refuses a different scheme", () => {
    assert.equal(isOriginAllowed("http://medilink-frontend.vercel.app", env), false);
  });

  it("refuses look-alike and suffix/prefix hosts", () => {
    for (const evil of [
      "https://medilink-frontend.vercel.app.evil.com",
      "https://evil.com/?x=https://medilink-frontend.vercel.app",
      "https://medilink-frontend-vercel.app",
      "https://xmedilink-frontend.vercel.app",
      "https://medilink-frontend.vercel.app:8443",
    ]) {
      assert.equal(isOriginAllowed(evil, env), false, `must refuse ${evil}`);
    }
  });

  it("refuses ANOTHER Vercel-hosted site — no *.vercel.app wildcard", () => {
    // Every Vercel project shares the suffix, so a wildcard would hand credentialed access to
    // any site on the platform.
    assert.equal(isOriginAllowed("https://someone-elses-app.vercel.app", env), false);
  });

  it("refuses the literal 'null' origin (sandboxed iframes, opaque redirects)", () => {
    assert.equal(isOriginAllowed("null", env), false);
  });

  it("refuses '*' and an absent Origin", () => {
    assert.equal(isOriginAllowed("*", env), false);
    assert.equal(isOriginAllowed(undefined, env), false);
    assert.equal(isOriginAllowed(null, env), false);
  });

  it("refuses everything when the allow-list is empty, including the real frontend", () => {
    assert.equal(isOriginAllowed(APP, PROD), false);
  });
});

describe("corsRejectionLog — makes the silent failure diagnosable", () => {
  it("returns null for an allowed origin (nothing to report)", () => {
    assert.equal(corsRejectionLog(APP, { ...PROD, FRONTEND_URL: APP }), null);
  });

  it("says the list is EMPTY and names the variable to set", () => {
    const msg = corsRejectionLog(APP, PROD)!;
    assert.match(msg, /allow-list is EMPTY/);
    assert.match(msg, /FRONTEND_URL/);
    assert.match(msg, /inlined at build time/, "must warn about the NEXT_PUBLIC redeploy trap");
  });

  it("distinguishes 'configured but not listed' from 'empty' — different fixes", () => {
    const msg = corsRejectionLog("https://evil.com", { ...PROD, FRONTEND_URL: APP })!;
    assert.match(msg, /not in the allow-list/);
    assert.ok(!msg.includes("EMPTY"));
    assert.match(msg, /medilink-frontend\.vercel\.app/, "names what IS allowed, to aid diagnosis");
  });

  it("never leaks an environment value beyond a public hostname", () => {
    const msg = corsRejectionLog("https://evil.com", {
      ...PROD,
      FRONTEND_URL: APP,
      // Not read by this module, but prove nothing else can reach the log line.
      ...({ SUPABASE_SERVICE_ROLE_KEY: "super-secret-value" } as CorsEnv),
    })!;
    assert.ok(!msg.includes("super-secret-value"));
  });

  it("does not crash on an unparseable Origin and truncates it", () => {
    const msg = corsRejectionLog("!!!" + "A".repeat(500), PROD)!;
    assert.match(msg, /unparseable/);
    assert.ok(msg.length < 400, "attacker-controlled input must not flood the log");
  });
});

describe("resolveAllowedOrigin — reflect the CANONICAL origin, never the raw header", () => {
  const env: CorsEnv = { ...PROD, FRONTEND_URL: APP };

  /**
   * The first two were found by probing this module during pre-commit review, and they were live
   * defects: middleware reflected `req.headers.get("origin")` verbatim, so an Origin that
   * NORMALISES to the allow-listed value while still containing CR/LF in its raw form passed the
   * check and then threw inside `Headers.set()` — an unauthenticated 500 on any backend route.
   *
   * WHATWG URL parsing strips tabs and newlines from its input, which is why they normalise at
   * all. The fix is to echo the normalised value; these assert the canonical form comes back and
   * that it is a header value `Headers.set` accepts.
   */
  const CRLF_SMUGGLES = [
    APP + "/\r\nX-Injected: 1",
    "https://medilink-frontend.\r\nvercel.app",
    APP + "\r\n",
  ];

  for (const raw of CRLF_SMUGGLES) {
    it("returns the canonical origin for " + JSON.stringify(raw), () => {
      assert.equal(resolveAllowedOrigin(raw, env), APP);
    });

    it("the returned value is settable as a header, unlike the raw input " + JSON.stringify(raw), () => {
      const value = resolveAllowedOrigin(raw, env)!;
      assert.doesNotThrow(() => new Headers().set("Access-Control-Allow-Origin", value));
      assert.ok(!value.includes("\r") && !value.includes("\n"));
    });
  }

  it("canonicalises userinfo, where the HOST is the allow-listed origin", () => {
    // `evil.com` here is a username, not the host — so allowing it is correct. What must not
    // happen is echoing `https://evil.com@…` into Access-Control-Allow-Origin.
    assert.equal(resolveAllowedOrigin("https://evil.com@medilink-frontend.vercel.app", env), APP);
  });

  it("canonicalises percent-encoded dots in the host", () => {
    assert.equal(resolveAllowedOrigin("https://medilink-frontend%2Evercel%2Eapp", env), APP);
  });

  it("canonicalises case and a trailing slash to the configured spelling", () => {
    assert.equal(resolveAllowedOrigin(APP.toUpperCase(), env), APP);
    assert.equal(resolveAllowedOrigin(APP + "/", env), APP);
  });

  it("returns null — not a value — for everything refused", () => {
    for (const bad of ["https://evil.com", "null", "*", "", undefined, null, DEV_ORIGIN]) {
      assert.equal(resolveAllowedOrigin(bad, env), null, "must refuse " + JSON.stringify(bad));
    }
  });

  it("agrees with isOriginAllowed on every input", () => {
    const inputs = [APP, APP + "/", APP.toUpperCase(), "https://evil.com", "null", "*", "", undefined, null, DEV_ORIGIN, ...CRLF_SMUGGLES];
    for (const i of inputs) {
      assert.equal(
        resolveAllowedOrigin(i, env) !== null,
        isOriginAllowed(i, env),
        "disagreement on " + JSON.stringify(i)
      );
    }
  });
});
