import crypto from "crypto";

/**
 * Thawani webhook signature verification (BP-6).
 *
 * Extracted from `app/api/payments/webhook/route.ts` so it can be asserted directly. It was
 * a private function inside the handler, which meant the single piece of cryptography in
 * the payments surface — the thing standing between an attacker's HTTP request and a
 * payment marked `paid` — had no test and could not have had one: the handler cannot be
 * imported without a database, an email transport and a live Thawani account.
 *
 * Behaviour is preserved exactly; only the seam moved. `req` is narrowed to the one thing
 * this logic needs (a header lookup), so the module has no Next.js dependency.
 *
 * ── THE GUARANTEE, AND ITS LIMIT ──
 *
 * This is DEFENCE IN DEPTH, not the primary control. The authoritative anti-spoof guard is
 * the webhook handler re-querying Thawani for the session before finalizing anything, which
 * runs whether or not a secret is configured. That is why an unset secret SKIPS rather than
 * rejects: making it mandatory would break every deployment that has not set it yet and
 * strand real payments, and the re-query already refuses to trust the request body.
 *
 * The failure direction is therefore deliberate and worth being explicit about:
 *
 *   secret UNSET  → skip (open), re-query still protects
 *   secret SET    → a missing or wrong signature is REJECTED
 *
 * Once the secret is set, this must never silently fall open — a bug that turned a
 * mismatch into a skip would remove the control while every test that only checks the
 * happy path kept passing. That is the regression these tests exist to catch.
 */

export interface SignatureVerdict {
  ok: boolean;
  reason?: string;
}

/** Just enough of a request to read one header — keeps this module Next-free. */
export interface HeaderSource {
  headers: { get(name: string): string | null };
}

export const DEFAULT_SIGNATURE_HEADER = "thawani-signature";

/** Env keys this reads, named so a test can build an environment without guessing. */
export interface WebhookSignatureEnv {
  THAWANI_WEBHOOK_SECRET?: string;
  THAWANI_WEBHOOK_SIGNATURE_HEADER?: string;
}

/**
 * Verify `HMAC-SHA256(rawBody, secret)` (hex) against the signature header.
 *
 * The comparison is timing-safe. The length pre-check exists because
 * `crypto.timingSafeEqual` THROWS on differing buffer lengths rather than returning false —
 * so without it, a short signature would produce a 500 instead of a clean 401, turning a
 * rejected forgery into an error path and (on some hosts) a retry storm.
 */
export function verifyWebhookSignature(
  req: HeaderSource,
  rawBody: string,
  env: WebhookSignatureEnv = process.env as WebhookSignatureEnv
): SignatureVerdict {
  const secret = env.THAWANI_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: "hmac-not-configured" };

  const headerName = env.THAWANI_WEBHOOK_SIGNATURE_HEADER || DEFAULT_SIGNATURE_HEADER;
  const provided = req.headers.get(headerName);
  if (!provided) return { ok: false, reason: "missing-signature" };

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "signature-mismatch" };
  return { ok: crypto.timingSafeEqual(a, b), reason: "signature-mismatch" };
}
