import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  INVOICES_BUCKET,
  INVOICE_SIGNED_URL_TTL_SECONDS,
  invoiceDownloadUrl,
  invoiceObjectPath,
  isLegacyPublicInvoiceUrl,
  isPaymentId,
} from "../invoiceObject.ts";

/**
 * Invoice storage addressing.
 *
 * The property under test is a containment one: **an invoice object path is a function of an
 * ALREADY-AUTHORIZED payment id and of nothing else.** Every other input — the stored
 * `invoice_url`, anything a client sends, anything in the database — must be incapable of
 * steering which object gets signed. If that holds, one patient cannot reach another
 * patient's invoice even if a row is wrong or tampered with.
 */

const PAYMENT_ID = "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5f";
const OTHER_PAYMENT_ID = "99999999-8888-4777-a666-555544443333";

describe("payment id validation is the whole gate", () => {
  it("accepts a canonical UUID in either case", () => {
    assert.equal(isPaymentId(PAYMENT_ID), true);
    assert.equal(isPaymentId(PAYMENT_ID.toUpperCase()), true);
  });

  it("rejects every shape that is not a UUID", () => {
    for (const bad of [
      "",
      "   ",
      "not-a-uuid",
      "3f2b1c4d5e6a4b7c8d9e0a1b2c3d4e5f", // unhyphenated
      "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5", // one char short
      "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5ff", // one char long
      "../../etc/passwd",
      "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5f/../other",
    ]) {
      assert.equal(isPaymentId(bad), false, `should reject ${JSON.stringify(bad)}`);
    }
  });

  it("rejects non-strings rather than coercing them", () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      assert.equal(isPaymentId(bad), false);
    }
  });
});

describe("invoiceObjectPath", () => {
  it("is the deterministic path the invoice worker actually writes", () => {
    // generate-invoice: `const filePath = \`${payment.id}.pdf\``
    assert.equal(invoiceObjectPath(PAYMENT_ID), `${PAYMENT_ID}.pdf`);
  });

  it("normalises case so one payment can never address two objects", () => {
    assert.equal(invoiceObjectPath(PAYMENT_ID.toUpperCase()), `${PAYMENT_ID}.pdf`);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(invoiceObjectPath(`  ${PAYMENT_ID}  `), `${PAYMENT_ID}.pdf`);
  });

  it("THROWS rather than emitting a traversal or wildcard path", () => {
    for (const attack of [
      "../invoices/other",
      "../../../etc/passwd",
      `${PAYMENT_ID}/../${OTHER_PAYMENT_ID}`,
      "*",
      "",
      "%2e%2e%2f",
    ]) {
      assert.throws(
        () => invoiceObjectPath(attack),
        /non-UUID payment id/,
        `should refuse ${JSON.stringify(attack)}`
      );
    }
  });

  it("never produces a path containing a slash, so it cannot leave the bucket root", () => {
    assert.ok(!invoiceObjectPath(PAYMENT_ID).includes("/"));
  });

  it("maps different payments to different objects", () => {
    assert.notEqual(invoiceObjectPath(PAYMENT_ID), invoiceObjectPath(OTHER_PAYMENT_ID));
  });
});

describe("invoiceDownloadUrl — the link that goes in email", () => {
  it("points at the AUTHENTICATED api route, never at storage", () => {
    const url = invoiceDownloadUrl("https://app.medilink.om", PAYMENT_ID);
    assert.equal(url, `https://app.medilink.om/api/payments/${PAYMENT_ID}/invoice`);
    // The whole point: a mail link must not be a directly-fetchable object.
    assert.ok(!url.includes("/storage/"));
    assert.ok(!url.includes("supabase"));
  });

  it("tolerates a trailing slash on the configured base URL", () => {
    assert.equal(
      invoiceDownloadUrl("https://app.medilink.om/", PAYMENT_ID),
      `https://app.medilink.om/api/payments/${PAYMENT_ID}/invoice`
    );
    assert.equal(
      invoiceDownloadUrl("https://app.medilink.om///", PAYMENT_ID),
      `https://app.medilink.om/api/payments/${PAYMENT_ID}/invoice`
    );
  });

  it("refuses an unset base URL instead of emitting 'undefined/api/...'", () => {
    // The exact silent-interpolation failure documented in thawani/checkoutConfig.ts.
    assert.throws(() => invoiceDownloadUrl("", PAYMENT_ID), /base URL is empty/);
    assert.throws(() => invoiceDownloadUrl("   ", PAYMENT_ID), /base URL is empty/);
  });

  it("refuses a non-UUID id, so a bad row cannot forge a link", () => {
    assert.throws(
      () => invoiceDownloadUrl("https://app.medilink.om", "../admin"),
      /non-UUID payment id/
    );
  });
});

describe("legacy public URL detection", () => {
  it("recognises the URL shape getPublicUrl() produced", () => {
    assert.equal(
      isLegacyPublicInvoiceUrl(
        `https://zojrwuvxrkmgnlwyuypg.supabase.co/storage/v1/object/public/invoices/${PAYMENT_ID}.pdf`
      ),
      true
    );
  });

  it("does not flag a signed URL or a bare path", () => {
    assert.equal(
      isLegacyPublicInvoiceUrl(
        `https://x.supabase.co/storage/v1/object/sign/invoices/${PAYMENT_ID}.pdf?token=abc`
      ),
      false
    );
    assert.equal(isLegacyPublicInvoiceUrl(`${PAYMENT_ID}.pdf`), false);
  });

  it("is null-safe — it runs over arbitrary database rows", () => {
    assert.equal(isLegacyPublicInvoiceUrl(null), false);
    assert.equal(isLegacyPublicInvoiceUrl(undefined), false);
  });
});

describe("constants", () => {
  it("targets the bucket the worker writes to", () => {
    assert.equal(INVOICES_BUCKET, "invoices");
  });

  it("keeps the signed-URL window short — this is the attacker's window", () => {
    assert.ok(INVOICE_SIGNED_URL_TTL_SECONDS > 0);
    assert.ok(
      INVOICE_SIGNED_URL_TTL_SECONDS <= 900,
      "a link to PHI must not stay valid for more than 15 minutes"
    );
  });
});
