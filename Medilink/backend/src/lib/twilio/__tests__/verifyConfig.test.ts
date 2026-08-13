import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  basicAuthHeader,
  describeConfig,
  isApproved,
  isVerifyConfigured,
  missingVerifyEnv,
  phoneLast4,
  redact,
  verificationCheckUrl,
  verificationsUrl,
  verifyStatusLine,
} from "../verifyConfig.ts";

/**
 * Twilio Verify configuration contract.
 *
 * The property these tests exist to defend is narrow and absolute: **`TWILIO_AUTH_TOKEN`
 * carries full Twilio account authority and must never leave this module except inside the
 * Authorization header.** A leaked token is not a degraded feature, it is an attacker
 * sending SMS on our account and reading our verification history.
 *
 * The email suite makes the same guarantee for `MICROSOFT_CLIENT_SECRET` ("no log line can
 * contain the secret or a password"); this mirrors it deliberately.
 */

const TOKEN = "super-secret-twilio-auth-token-value";
const FULL = {
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_VERIFY_SERVICE_SID: "VA6e277ff5e900fcf5a91a7e045cbdc12b",
};

describe("configuration detection", () => {
  it("reports configured only when all three variables are present", () => {
    assert.equal(isVerifyConfigured(FULL), true);
    assert.deepEqual(missingVerifyEnv(FULL), []);
  });

  it("names every missing variable so an operator knows what to set", () => {
    assert.deepEqual(missingVerifyEnv({}), [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
    ]);
    assert.equal(isVerifyConfigured({}), false);
  });

  it("treats a present-but-blank variable as missing", () => {
    // `TWILIO_AUTH_TOKEN=` in a .env file is the single most common way this goes wrong.
    assert.equal(isVerifyConfigured({ ...FULL, TWILIO_AUTH_TOKEN: "   " }), false);
  });

  it("a partial config is unusable rather than half-working", () => {
    assert.equal(isVerifyConfigured({ TWILIO_ACCOUNT_SID: "AC1" }), false);
  });
});

describe("THE SECRET NEVER ESCAPES", () => {
  it("describeConfig returns identifiers but NEVER the auth token", () => {
    const summary = describeConfig(FULL);
    assert.equal(summary.configured, true);
    assert.equal(summary.accountSid, FULL.TWILIO_ACCOUNT_SID);
    assert.equal(summary.serviceSid, FULL.TWILIO_VERIFY_SERVICE_SID);
    assert.equal(JSON.stringify(summary).includes(TOKEN), false);
  });

  it("the status line cannot contain the token, configured or not", () => {
    assert.equal(verifyStatusLine(FULL).includes(TOKEN), false);
    assert.equal(verifyStatusLine({}).includes(TOKEN), false);
    // …and it still says something useful.
    assert.match(verifyStatusLine({}), /NOT CONFIGURED/);
    assert.match(verifyStatusLine({}), /TWILIO_AUTH_TOKEN/); // the NAME is not a secret
    assert.match(verifyStatusLine(FULL), /ready/);
  });

  it("neither endpoint URL embeds the token", () => {
    for (const url of [verificationsUrl(FULL), verificationCheckUrl(FULL)]) {
      assert.equal(url.includes(TOKEN), false);
      assert.match(url, /^https:\/\/verify\.twilio\.com\/v2\/Services\/VA/);
    }
  });

  it("the Authorization header is the ONLY output containing the token", () => {
    const header = basicAuthHeader(FULL);
    assert.match(header, /^Basic /);
    // Base64, so the raw token is not literally present — decode to prove it is carried.
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString();
    assert.equal(decoded, `${FULL.TWILIO_ACCOUNT_SID}:${TOKEN}`);
  });

  it("redact strips the token and any Basic blob from text bound for a log", () => {
    const leaked = `Request failed: Authorization: Basic abc123== token=${TOKEN} end`;
    const safe = redact(leaked, FULL);
    assert.equal(safe.includes(TOKEN), false);
    assert.equal(safe.includes("Basic abc123=="), false);
    assert.match(safe, /\[REDACTED\]/);
  });

  it("redact is a no-op-safe when unconfigured (never throws on a log path)", () => {
    assert.equal(redact("plain message", {}), "plain message");
  });

  it("building an auth header without credentials throws instead of sending anonymously", () => {
    // Silently omitting auth would produce a confusing Twilio 401 rather than a clear
    // configuration error.
    assert.throws(() => basicAuthHeader({}), /not configured/i);
    assert.throws(() => verificationsUrl({}), /TWILIO_VERIFY_SERVICE_SID/);
  });
});

describe("approval is strict", () => {
  it("ONLY 'approved' counts as success", () => {
    assert.equal(isApproved("approved"), true);
    // `pending` means a WRONG code — Twilio keeps the verification open for retries.
    // Treating it as a pass would make the verification step decorative.
    assert.equal(isApproved("pending"), false);
    assert.equal(isApproved("canceled"), false);
    assert.equal(isApproved(undefined), false);
    assert.equal(isApproved(null), false);
    assert.equal(isApproved(""), false);
  });
});

describe("audit redaction of the phone number", () => {
  it("keeps only the last four digits", () => {
    assert.equal(phoneLast4("+919845367812"), "••••7812");
    assert.equal(phoneLast4("+96891234567"), "••••4567");
  });

  it("never returns a full number, whatever the shape", () => {
    for (const p of ["+919845367812", "+968 9123 4567", "9845367812"]) {
      const masked = phoneLast4(p);
      assert.equal(masked.length <= 8, true);
      assert.equal(masked.includes(p.replace(/\D/g, "")), false);
    }
  });

  it("degrades safely on a too-short value rather than echoing it", () => {
    assert.equal(phoneLast4("12"), "••••");
    assert.equal(phoneLast4(""), "••••");
  });
});
