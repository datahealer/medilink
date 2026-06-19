import nodemailer from "nodemailer";

export async function sendInvoiceEmail(
  to: string,
  invoiceUrl: string,
  invoiceNumber: string
) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error("EMAIL_USER or EMAIL_PASS env vars are not set");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"HAMS" <${user}>`,
    to,
    subject: `Invoice ${invoiceNumber} — Payment Successful`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a1a">Payment Successful</h2>
        <p>Thank you! Your payment has been confirmed.</p>
        <p>Your invoice number is: <strong>${invoiceNumber}</strong></p>
        <p style="margin-top:24px">
          <a href="${invoiceUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
            Download Invoice (PDF)
          </a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:32px">
          HAMS — Healthcare Appointment Management System
        </p>
      </div>
    `,
  });
}