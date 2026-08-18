import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildMailtoUrl,
  canComposeMessage,
  supportChannels,
  supportEmail,
  type ContactDraft,
  type SupportEnv,
} from "../supportContact";

/**
 * Support contact channels and the `mailto:` composer.
 *
 * ── THE DEFECT THIS PINS ──
 *
 * `/contact` rendered a real-looking form whose submit handler was `setSent(true)` and nothing
 * else, then told the visitor "Message sent!" and promised a reply "within one business day".
 * Alongside it — and in the global footer, on every marketing page — sat `hello@medilink.om` and
 * `+968 9000 0000`, neither of which reaches anyone.
 *
 * Two properties are asserted here, and they are the whole point of the fix:
 *
 *   1. **Absence is silent, never invented.** With no configuration there is no channel, no
 *      address, and `canComposeMessage()` is false so the page renders no form at all. There is
 *      no default, no fallback, and nothing hardcoded that could stand in for a real inbox.
 *
 *   2. **The composed URL cannot be steered by form input.** The form is public and
 *      unauthenticated, and its values land in a URL whose parameters some mail clients map onto
 *      real message headers. A CR/LF in the subject is the classic header smuggle.
 *
 * Note the FIRST frontend test in this workspace — `package.json` gained a `test` script for it.
 * It works with no loader harness because `supportContact.ts` imports nothing, the same
 * discipline `backend/src/lib/thawani/checkoutConfig.ts` follows.
 */

const CONFIGURED: SupportEnv = {
  email: "support@example.test",
  phone: "+968 2222 3333",
};

const draft = (over: Partial<ContactDraft> = {}): ContactDraft => ({
  name: "Aisha",
  email: "aisha@example.test",
  topic: "Billing",
  message: "I was charged twice.",
  ...over,
});

/** Read one query parameter out of a `mailto:` URL, decoded. */
function param(url: string, key: string): string {
  const query = url.slice(url.indexOf("?") + 1);
  const hit = new URLSearchParams(query).get(key);
  assert.ok(hit !== null, `expected a "${key}" parameter in ${url}`);
  return hit;
}

describe("no configuration — the app must not invent a contact route", () => {
  it("offers no channels at all", () => {
    assert.deepEqual(supportChannels({}), []);
  });

  it("has no support address", () => {
    assert.equal(supportEmail({}), null);
  });

  it("reports that it cannot compose, so the page renders no form", () => {
    assert.equal(canComposeMessage({}), false);
  });

  it("refuses to build a mailto URL rather than producing `mailto:?subject=...`", () => {
    // The failure mode that matters: a URL with no recipient opens a blank compose window, which
    // looks like it worked. Returning null is what lets the caller hide the submit control.
    assert.equal(buildMailtoUrl(draft(), {}), null);
  });

  it("treats a blank or whitespace-only variable exactly like an unset one", () => {
    // `NEXT_PUBLIC_SUPPORT_EMAIL=` in a deploy is the common shape of "not configured yet".
    for (const email of ["", "   ", "\n\t"]) {
      assert.equal(supportEmail({ email }), null, JSON.stringify(email));
      assert.equal(canComposeMessage({ email }), false, JSON.stringify(email));
    }
    assert.deepEqual(supportChannels({ email: "  ", phone: "  " }), []);
  });
});

describe("malformed configuration is dropped, not displayed", () => {
  it("rejects a value that is not an address", () => {
    // The old placeholder block shipped whatever string was in the file. A typo'd or
    // half-edited value must vanish from the UI rather than render as a dead link.
    for (const email of ["support", "support@example", "support@", "@example.test", "a b@c.test"]) {
      assert.equal(supportEmail({ email }), null, email);
      assert.deepEqual(supportChannels({ email }), [], email);
    }
  });

  it("rejects a phone number that is not plausibly dialable", () => {
    for (const phone of ["2222", "n/a", "call us", "+968", "1234567890123456789"]) {
      assert.deepEqual(supportChannels({ phone }), [], phone);
    }
  });

  it("keeps a valid channel even when a sibling channel is malformed", () => {
    const channels = supportChannels({ email: "support@example.test", phone: "n/a" });
    assert.deepEqual(
      channels.map((c) => c.kind),
      ["email"],
      "one bad variable must not suppress a good one"
    );
  });
});

describe("configured channels", () => {
  it("links email, phone and WhatsApp with the right scheme for each", () => {
    const channels = supportChannels({
      email: "support@example.test",
      phone: "+968 2222 3333",
      whatsapp: "+968 9111 2222",
    });
    assert.deepEqual(channels.map((c) => c.kind), ["email", "phone", "whatsapp"]);
    assert.equal(channels[0]!.href, "mailto:support@example.test");
    assert.equal(channels[1]!.href, "tel:+96822223333", "tel: must be digits, not the pretty form");
    assert.equal(channels[2]!.href, "https://wa.me/96891112222", "wa.me takes bare digits, no +");
  });

  it("displays the human-readable value while linking the normalised one", () => {
    const [phone] = supportChannels({ phone: "+968 2222 3333" });
    assert.equal(phone!.detail, "+968 2222 3333");
    assert.equal(phone!.href, "tel:+96822223333");
  });

  it("falls back to the phone number for WhatsApp when no separate number is set", () => {
    const channels = supportChannels({ phone: "+968 2222 3333" });
    assert.deepEqual(channels.map((c) => c.kind), ["phone", "whatsapp"]);
    assert.equal(channels[1]!.href, "https://wa.me/96822223333");
  });

  it("does NOT invent a WhatsApp channel when the phone is unset", () => {
    // The fallback is a convenience, not a source of numbers.
    assert.deepEqual(supportChannels({ email: "support@example.test" }).map((c) => c.kind), ["email"]);
  });

  it("trims surrounding whitespace from a configured value", () => {
    assert.equal(supportEmail({ email: "  support@example.test  " }), "support@example.test");
  });
});

describe("mailto composition", () => {
  it("addresses the configured inbox and carries the message", () => {
    const url = buildMailtoUrl(draft(), CONFIGURED)!;
    assert.ok(url.startsWith("mailto:support%40example.test?"), url);
    assert.match(param(url, "body"), /I was charged twice\./);
  });

  it("puts the topic and sender name in the subject", () => {
    const subject = param(buildMailtoUrl(draft(), CONFIGURED)!, "subject");
    assert.match(subject, /Billing/);
    assert.match(subject, /Aisha/);
  });

  it("falls back to a generic subject when no topic is given", () => {
    const subject = param(buildMailtoUrl(draft({ topic: "" }), CONFIGURED)!, "subject");
    assert.match(subject, /Website enquiry/);
  });

  it("includes the visitor's own reply address in the body", () => {
    // It cannot go in a `Reply-To` parameter — that is exactly the header surface being closed
    // off below — so it is body text the recipient can read.
    assert.match(param(buildMailtoUrl(draft(), CONFIGURED)!, "body"), /aisha@example\.test/);
  });

  it("omits the email line entirely when the visitor left it blank", () => {
    const body = param(buildMailtoUrl(draft({ email: "  " }), CONFIGURED)!, "body");
    assert.ok(!body.includes("Email:"), body);
  });
});

describe("header injection — the form is public and unauthenticated", () => {
  it("strips CR/LF from the subject so no extra header can be smuggled", () => {
    const url = buildMailtoUrl(
      draft({ topic: "Hi\r\nBcc: victim@example.test" }),
      CONFIGURED
    )!;
    const subject = param(url, "subject");
    assert.ok(!subject.includes("\r"), "raw CR survived into the subject");
    assert.ok(!subject.includes("\n"), "raw LF survived into the subject");

    // Not even the escaped form may reach the subject: %0A is what a client would decode back
    // into a line break. Scoped to the SUBJECT parameter on purpose — the body legitimately
    // contains %0A for its own "Name: / Email: / Topic:" separators, and that is fine, because
    // a line break in a body is body text. It is the subject that some clients map onto a
    // header, so the subject is what must be flat.
    const rawSubject = url.slice(url.indexOf("?subject=") + 9, url.indexOf("&body="));
    assert.ok(!rawSubject.includes("%0A"), rawSubject);
    assert.ok(!rawSubject.includes("%0D"), rawSubject);

    // The injected text survives as inert content, it just cannot be a header any more.
    assert.match(subject, /Bcc: victim@example\.test/);
  });

  it("percent-encodes & so input cannot append a parameter", () => {
    const url = buildMailtoUrl(
      draft({ topic: "x&bcc=victim@example.test" }),
      CONFIGURED
    )!;
    const query = url.slice(url.indexOf("?") + 1);
    assert.deepEqual(
      [...new URLSearchParams(query).keys()],
      ["subject", "body"],
      "input introduced a query parameter"
    );
    assert.ok(url.includes("%26"), "the ampersand must be encoded, not literal");
  });

  it("percent-encodes a ? so input cannot restart the query string", () => {
    const url = buildMailtoUrl(draft({ topic: "a?b=c" }), CONFIGURED)!;
    assert.equal(url.indexOf("?"), url.lastIndexOf("?"), "more than one ? in the URL");
  });

  it("keeps newlines in the BODY, but only in encoded form", () => {
    // Multi-line messages are the normal case and must survive; they just may not appear raw.
    const url = buildMailtoUrl(draft({ message: "line one\nline two" }), CONFIGURED)!;
    assert.ok(!url.includes("\n"), "a raw newline in the URL");
    assert.match(param(url, "body"), /line one\nline two/);
  });

  it("cannot be made to change the recipient", () => {
    // Every field is attacked at once; `to` comes from configuration alone.
    const url = buildMailtoUrl(
      draft({
        name: "x@evil.test?to=evil@evil.test",
        email: "y\r\nTo: evil@evil.test",
        topic: "z&to=evil@evil.test",
        message: "w\r\nBcc: evil@evil.test",
      }),
      CONFIGURED
    )!;
    assert.equal(url.slice(0, url.indexOf("?")), "mailto:support%40example.test");
    assert.ok(!/[?&]to=/.test(url), url);
    assert.ok(!/[?&]bcc=/i.test(url), url);
  });

  it("parses back to exactly the two parameters it wrote, for any input", () => {
    // Control bytes are written as ESCAPES, not raw: a literal NUL in source makes the file
    // register as binary to grep and diff, and an invisible byte is not a readable fixture.
    const nasty = "\r\n\t\0\u001b%0A%0D&?=#\"'<> ok";
    const url = buildMailtoUrl(
      draft({ name: nasty, email: nasty, topic: nasty, message: nasty }),
      CONFIGURED
    )!;
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "mailto:");
    assert.deepEqual([...parsed.searchParams.keys()], ["subject", "body"]);
  });
});

describe("length caps", () => {
  it("caps each field that feeds the subject", () => {
    const subject = param(
      buildMailtoUrl(draft({ topic: "T".repeat(5000), name: "N".repeat(5000) }), CONFIGURED)!,
      "subject"
    );
    assert.ok(subject.match(/T+/)![0].length <= 80, "topic not capped");
    assert.ok(subject.match(/N+/)![0].length <= 80, "name not capped");
  });

  it("caps the ASSEMBLED subject, not just its parts", () => {
    // A distinct assertion because the per-field caps alone do not give this. topic(80) plus the
    // " — " separator plus name(80) is 163 characters, so the outer cap is the only thing holding
    // the subject at 160 — and a test that sends only a long TOPIC cannot detect its removal,
    // since an over-long topic is already trimmed to 80 before the join.
    const subject = param(
      buildMailtoUrl(draft({ topic: "T".repeat(5000), name: "N".repeat(5000) }), CONFIGURED)!,
      "subject"
    );
    assert.ok(subject.length <= 160, `subject was ${subject.length} chars`);
  });

  it("caps the body", () => {
    const body = param(buildMailtoUrl(draft({ message: "M".repeat(50_000) }), CONFIGURED)!, "body");
    assert.ok(body.length <= 4000, `body was ${body.length} chars`);
  });

  it("truncation cannot leave a dangling percent escape", () => {
    // The cap is applied BEFORE encoding for this reason. Slicing encoded text could cut "%0A"
    // into "%0", which is not a valid URL and would throw in the mail client.
    const url = buildMailtoUrl(
      draft({ topic: "€".repeat(300), message: "€".repeat(9000) }),
      CONFIGURED
    )!;
    assert.doesNotThrow(() => new URL(url));
  });
});
