/**
 * Payment receipt / invoice email.
 *
 * Called by the Thawani webhook once a payment is confirmed and the invoice PDF exists.
 * Transport is the shared Microsoft 365 transporter — this file no longer builds its own.
 */
import { ctaButton, detailRows, renderEmail, toPlainText } from "./layout";
import { sendMail, type SendMailResult } from "./transporter";

/**
 * Behaviour change, deliberate: this used to `throw` when EMAIL_USER/EMAIL_PASS were
 * missing. It now returns a result instead. The webhook already wraps the call in
 * try/catch and treats failure as non-fatal, so nothing downstream regresses — but a
 * missing credential is a deployment state, and "unconfigured" and "SMTP rejected the
 * message" are worth telling apart in the return value rather than in a stack trace.
 *
 * ── `invoiceUrl` MUST BE THE AUTHENTICATED ROUTE, NOT A STORAGE URL ──
 *
 * Callers pass `invoiceDownloadUrl(base, paymentId)` — i.e. `/api/payments/{id}/invoice`.
 * They used to pass `payments.invoice_url`, a public storage link, and this is the single
 * worst place that could happen: email is the one channel that carries the link OUT of our
 * control, into forwarding, mailbox scanning, and screenshots, permanently.
 *
 * With the app route, a forwarded mail is worth nothing to a recipient who is not signed in
 * as that patient, and a link in a two-year-old email still works for its rightful owner —
 * which a stored signed URL could never manage, since it would have expired.
 *
 * The parameter is asserted rather than trusted, because a regression here is silent: the
 * mail still sends and still looks right, and the exposure is only visible to someone who
 * inspects the href.
 */
export async function sendInvoiceEmail(
  to: string,
  invoiceUrl: string,
  invoiceNumber: string
): Promise<SendMailResult> {
  if (invoiceUrl.includes("/storage/v1/object/public/")) {
    // Refusing to send beats sending PHI on a public link. This is a programming error at
    // the call site, not a runtime condition, so it fails loudly and is caught by the
    // caller's existing non-fatal try/catch rather than breaking payment confirmation.
    throw new Error(
      "sendInvoiceEmail: refusing to email a PUBLIC storage URL — pass invoiceDownloadUrl(base, paymentId)"
    );
  }
  const html = renderEmail({
    heading: "Payment successful",
    preheader: `Invoice ${invoiceNumber} — your payment has been confirmed.`,
    body: `
      <p style="margin:0;color:#1A1A1A;font-size:15px;line-height:1.6">
        Thank you — your payment has been confirmed.
      </p>
      ${detailRows([{ label: "Invoice number", value: invoiceNumber }])}
      ${ctaButton("View invoice (PDF)", invoiceUrl)}
      <p style="margin:0;color:#6B6B6B;font-size:13px;line-height:1.6">
        You'll be asked to sign in — your invoice contains personal health information,
        so it is only available to your account. You can also find it any time under
        Payments in the MediLink app.
      </p>
    `,
  });

  return sendMail({
    to,
    subject: `Invoice ${invoiceNumber} — payment successful`,
    html,
    text: toPlainText(html),
  });
}
