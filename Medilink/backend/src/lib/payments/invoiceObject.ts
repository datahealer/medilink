/**
 * Invoice storage addressing — pure, dependency-free, so it is assertable without Supabase.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ──
 *
 * `supabase/functions/generate-invoice/index.ts` uploads the invoice PDF and then calls
 * `getPublicUrl()`, storing the result in `payments.invoice_url`. That URL is
 * unauthenticated and permanent, and the PDF it serves contains, verbatim:
 *
 *     patient full name · patient email · doctor name · facility name and address · amount
 *
 * which is PHI. It is then emailed to the patient as a "Download invoice (PDF)" link,
 * returned to clients by `GET /api/payments` and `/api/payments/verify`, re-downloaded
 * unauthenticated by the mobile save-to-vault flow, and redirected to by
 * `GET /api/payments/[id]/invoice`.
 *
 * That last one is the sharpest illustration: the route authenticates the caller AND filters
 * on `patient_id = auth.uid()` — a correct authorization gate — and then hands over a URL
 * that needs no authorization at all. The gate is decorative. Anyone holding the link reads
 * the PHI: anyone the email was forwarded to, anything that scans mail, browser history on a
 * shared device, a referrer header, a support ticket screenshot.
 *
 * The path is `{payment_id}.pdf`, and a v4 UUID is not brute-forceable — but an unguessable
 * URL is obscurity, not access control, and PHI has to be access-controlled.
 *
 * ── THE RULE THIS MODULE ENFORCES ──
 *
 * The object path is DERIVED FROM THE AUTHENTICATED PAYMENT ID, never parsed out of the
 * stored `invoice_url`.
 *
 * This is the whole security argument, so it is worth being explicit about. By the time we
 * mint a signed URL, the caller has been authenticated and the payment row has been fetched
 * with `.eq("patient_id", user.id)` — so `payment.id` is *proven* to belong to the caller.
 * `invoice_url` is just a column: if it were ever wrong (a bad backfill, a HAMS-side write,
 * a tampered row), parsing it would sign whatever object it named — including another
 * patient's. Deriving from the id makes cross-patient access structurally impossible rather
 * than merely unlikely, and it means this module needs no URL parser and no allow-list of
 * hostnames to get right.
 *
 * `invoice_url` therefore keeps exactly one job: a NON-NULL value means "an invoice exists".
 * Its contents are never trusted or dereferenced by MediLink again.
 */

/** The bucket the invoice worker writes to. */
export const INVOICES_BUCKET = "invoices";

/**
 * How long a minted download link stays valid.
 *
 * Long enough that a patient can tap the email on a slow connection and still land on the
 * PDF; short enough that a link captured from history, a referrer or a forwarded mail is
 * dead by the time anyone tries it. This is the window an attacker gets, so it is measured
 * in minutes, not days.
 */
export const INVOICE_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

/** A canonical v4-shaped UUID, lowercase or upper. Anything else is not a payment id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPaymentId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * The storage object path for a payment's invoice: `{payment_id}.pdf`, at the bucket root.
 *
 * Matches what `generate-invoice` writes (`const filePath = \`${payment.id}.pdf\``) and what
 * migration 20260726000000 documents (`invoices/{payment_id}.pdf`).
 *
 * Throws on a non-UUID rather than returning a best-effort string. The return value is
 * concatenated into a storage request, so accepting `"../"` or an empty segment here would
 * be the traversal bug this function exists to make impossible. A caller that cannot prove
 * it holds a real payment id has no business addressing an object.
 */
export function invoiceObjectPath(paymentId: string): string {
  if (!isPaymentId(paymentId)) {
    throw new Error("invoiceObjectPath: refusing to build a path from a non-UUID payment id");
  }
  return `${paymentId.trim().toLowerCase()}.pdf`;
}

/**
 * The AUTHENTICATED download endpoint for an invoice — what emails and clients link to.
 *
 * Deliberately the API route and not a storage URL. The route re-checks the session and the
 * ownership filter on every hit and mints a fresh short-lived signed URL, so a forwarded
 * link is worth nothing to anyone who is not signed in as that patient. It also means the
 * link in a two-year-old email still works for its rightful owner, which a stored signed URL
 * could never do.
 */
export function invoiceDownloadUrl(baseUrl: string, paymentId: string): string {
  if (!isPaymentId(paymentId)) {
    throw new Error("invoiceDownloadUrl: refusing to build a link from a non-UUID payment id");
  }
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("invoiceDownloadUrl: base URL is empty — set NEXT_PUBLIC_APP_URL");
  }
  return `${trimmed}/api/payments/${paymentId.trim().toLowerCase()}/invoice`;
}

/**
 * Does this stored `invoice_url` still look like a legacy PUBLIC storage URL?
 *
 * Not used for addressing — see the module header. It exists so operations can measure how
 * many rows still carry a public link after the bucket is flipped private, and so the
 * post-apply verification in the migration has a matching predicate in code.
 */
export function isLegacyPublicInvoiceUrl(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.includes("/storage/v1/object/public/");
}
