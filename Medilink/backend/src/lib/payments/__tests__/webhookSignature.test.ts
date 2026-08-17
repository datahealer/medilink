import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  DEFAULT_SIGNATURE_HEADER,
  verifyWebhookSignature,
  type WebhookSignatureEnv,
} from "../webhookSignature.ts";

/**
 * Thawani webhook signature verification.
 *
 * This is the only cryptography in the payments surface, and what it guards is the
 * highest-consequence transition in the product: a request that reaches the webhook handler
 * can mark a payment `paid`, confirm the appointment, generate an invoice and email a
 * receipt. Before this suite it had no tests, because it lived as a private function inside
 * a route handler that cannot be imported without a database and an SMTP transport.
 *
 * The property under test is asymmetric and easy to break in the safe-looking direction:
 * **once a secret is configured, no request without a matching signature may pass.** A
 * refactor that turned a mismatch into a skip would silently remove the control while every
 * happy-path test kept passing.
 */

const SECRET = "whsec_thawani_test_secret_value";
const BODY = JSON.stringify({
  event_type: "checkout.completed",
  data: { session_id: "checkout_abc123", client_reference_id: "8b1f0c22-1111-4222-8333-444455556666" },
});

const CONFIGURED: WebhookSignatureEnv = { THAWANI_WEBHOOK_SECRET: SECRET };

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Minimal header-bearing stand-in — the module deliberately needs nothing more. */
function reqWith(headers: Record<string, string>) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } };
}

describe("secret NOT configured — open, by design", () => {
  it("accepts an unsigned request and says why", () => {
    const verdict = verifyWebhookSignature(reqWith({}), BODY, {});
    assert.equal(verdict.ok, true);
    assert.equal(verdict.reason, "hmac-not-configured");
  });

  it("accepts even a deliberately WRONG signature when no secret is set", () => {
    // Not a bug: with no secret there is nothing to check against, and the Thawani
    // re-query in the handler remains the authoritative anti-spoof guard. Asserted so the
    // open-by-default behaviour is a recorded decision rather than an accident.
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: "deadbeef" }),
      BODY,
      {}
    );
    assert.equal(verdict.ok, true);
  });

  it("treats an empty-string secret as unset rather than as a real key", () => {
    const verdict = verifyWebhookSignature(reqWith({}), BODY, { THAWANI_WEBHOOK_SECRET: "" });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.reason, "hmac-not-configured");
  });
});

describe("secret configured — closed", () => {
  it("accepts a correctly signed body", () => {
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }),
      BODY,
      CONFIGURED
    );
    assert.equal(verdict.ok, true);
  });

  it("REJECTS a request with no signature header", () => {
    const verdict = verifyWebhookSignature(reqWith({}), BODY, CONFIGURED);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "missing-signature");
  });

  it("REJECTS a signature computed with the wrong secret", () => {
    const forged = sign(BODY, "attacker-guessed-secret");
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: forged }),
      BODY,
      CONFIGURED
    );
    assert.equal(verdict.ok, false);
  });

  it("REJECTS a valid signature for a DIFFERENT body — the replay-with-tamper case", () => {
    // The realistic attack: capture a genuine delivery, change the amount or the
    // client_reference_id, resend. The signature is authentic but no longer matches.
    const tampered = JSON.stringify({
      event_type: "checkout.completed",
      data: { session_id: "checkout_abc123", client_reference_id: "99999999-9999-4999-8999-999999999999" },
    });
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }),
      tampered,
      CONFIGURED
    );
    assert.equal(verdict.ok, false);
  });

  it("is byte-exact — one flipped character in the body invalidates it", () => {
    const almost = `${BODY} `;
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }),
      almost,
      CONFIGURED
    );
    assert.equal(verdict.ok, false);
  });

  it("does NOT throw on a short signature — it returns a clean rejection", () => {
    // crypto.timingSafeEqual throws on differing lengths. Without the length pre-check a
    // 1-char signature would raise, and the handler's catch would answer 500 instead of
    // 401 — turning a rejected forgery into an error path (and, on some hosts, a retry
    // storm). This asserts the guard is present.
    for (const bogus of ["a", "", "00", "z".repeat(63), "z".repeat(65)]) {
      const verdict = verifyWebhookSignature(
        reqWith({ [DEFAULT_SIGNATURE_HEADER]: bogus }),
        BODY,
        CONFIGURED
      );
      assert.equal(verdict.ok, false, `should reject ${JSON.stringify(bogus)} without throwing`);
    }
  });

  it("rejects a same-length signature of the right shape but wrong value", () => {
    // Same 64 hex chars, so it survives the length pre-check and reaches timingSafeEqual.
    const wrongButWellFormed = "f".repeat(64);
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: wrongButWellFormed }),
      BODY,
      CONFIGURED
    );
    assert.equal(verdict.ok, false);
  });

  it("is case-sensitive about the hex digest", () => {
    const upper = sign(BODY).toUpperCase();
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: upper }),
      BODY,
      CONFIGURED
    );
    assert.equal(verdict.ok, false);
  });

  it("verifies an empty body rather than waving it through", () => {
    const ok = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign("") }),
      "",
      CONFIGURED
    );
    assert.equal(ok.ok, true);

    const bad = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }),
      "",
      CONFIGURED
    );
    assert.equal(bad.ok, false);
  });
});

describe("configurable header name", () => {
  it("reads the custom header when one is set", () => {
    const env: WebhookSignatureEnv = {
      THAWANI_WEBHOOK_SECRET: SECRET,
      THAWANI_WEBHOOK_SIGNATURE_HEADER: "x-thawani-hmac",
    };
    assert.equal(
      verifyWebhookSignature(reqWith({ "x-thawani-hmac": sign(BODY) }), BODY, env).ok,
      true
    );
  });

  it("does NOT fall back to the default header once a custom one is configured", () => {
    // Otherwise an attacker could sign under whichever header name happened to be easier,
    // and rotating the header name would not actually change anything.
    const env: WebhookSignatureEnv = {
      THAWANI_WEBHOOK_SECRET: SECRET,
      THAWANI_WEBHOOK_SIGNATURE_HEADER: "x-thawani-hmac",
    };
    const verdict = verifyWebhookSignature(
      reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }),
      BODY,
      env
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "missing-signature");
  });

  it("uses the documented default header name when none is configured", () => {
    assert.equal(DEFAULT_SIGNATURE_HEADER, "thawani-signature");
  });
});

describe("the secret never escapes", () => {
  it("no verdict — pass or fail — contains the secret", () => {
    const verdicts = [
      verifyWebhookSignature(reqWith({ [DEFAULT_SIGNATURE_HEADER]: sign(BODY) }), BODY, CONFIGURED),
      verifyWebhookSignature(reqWith({}), BODY, CONFIGURED),
      verifyWebhookSignature(reqWith({ [DEFAULT_SIGNATURE_HEADER]: "nope" }), BODY, CONFIGURED),
      verifyWebhookSignature(reqWith({}), BODY, {}),
    ];
    for (const v of verdicts) {
      assert.ok(!JSON.stringify(v).includes(SECRET), "verdict must not carry the secret");
    }
  });

  it("the reason strings are safe to log verbatim", () => {
    // The handler logs `sig.reason` on rejection. It must be a fixed vocabulary, never
    // anything derived from the request or the key.
    const reasons = new Set(["hmac-not-configured", "missing-signature", "signature-mismatch"]);
    const v = verifyWebhookSignature(reqWith({ [DEFAULT_SIGNATURE_HEADER]: "nope" }), BODY, CONFIGURED);
    assert.ok(reasons.has(v.reason!), `unexpected reason ${v.reason}`);
  });
});
