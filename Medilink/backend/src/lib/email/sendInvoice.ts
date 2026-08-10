/**
 * Payment receipt / invoice email.
 *
 * Called by the Thawani webhook once a payment is confirmed and the invoice PDF exists.
 * Transport is the shared Microsoft 365 transporter — this file no longer builds its own.
 */
import { ctaButton, detailRows, renderEmail, toPlainText } from "./layout";
import { sendMail, type SendMailResult } from "./transporter";

/**
 * Signature preserved exactly (positional `to, invoiceUrl, invoiceNumber`) so the webhook
 * call site is untouched.
 *
 * Behaviour change, deliberate: this used to `throw` when EMAIL_USER/EMAIL_PASS were
 * missing. It now returns a result instead. The webhook already wraps the call in
 * try/catch and treats failure as non-fatal, so nothing downstream regresses — but a
 * missing credential is a deployment state, and "unconfigured" and "SMTP rejected the
 * message" are worth telling apart in the return value rather than in a stack trace.
 */
export async function sendInvoiceEmail(
  to: string,
  invoiceUrl: string,
  invoiceNumber: string
): Promise<SendMailResult> {
  const html = renderEmail({
    heading: "Payment successful",
    preheader: `Invoice ${invoiceNumber} — your payment has been confirmed.`,
    body: `
      <p style="margin:0;color:#1A1A1A;font-size:15px;line-height:1.6">
        Thank you — your payment has been confirmed.
      </p>
      ${detailRows([{ label: "Invoice number", value: invoiceNumber }])}
      ${ctaButton("Download invoice (PDF)", invoiceUrl)}
      <p style="margin:0;color:#6B6B6B;font-size:13px;line-height:1.6">
        Keep this invoice for your records. You can also find it any time under
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
