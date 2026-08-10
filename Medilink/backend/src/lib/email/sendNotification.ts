/**
 * Generic notification email — an in-app notification mirrored to the inbox.
 *
 * `body` is plain text supplied by the caller; newlines become <br />. It is ESCAPED
 * first (it previously was not, so any `<` in a notification body corrupted the markup
 * and an operator-authored body was raw HTML into every recipient's inbox).
 */
import { escapeHtml, renderEmail, toPlainText } from "./layout";
import { sendMail, type SendMailResult } from "./transporter";

type SendNotificationEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

export async function sendNotificationEmail({
  to,
  subject,
  body,
}: SendNotificationEmailPayload): Promise<SendMailResult> {
  const html = renderEmail({
    heading: subject,
    preheader: body.slice(0, 120),
    body: `<p style="margin:0;color:#1A1A1A;font-size:15px;line-height:1.6">${escapeHtml(body).replace(
      /\n/g,
      "<br />"
    )}</p>`,
  });

  return sendMail({ to, subject, html, text: toPlainText(html) });
}
