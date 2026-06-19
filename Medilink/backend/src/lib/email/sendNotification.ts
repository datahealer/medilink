import nodemailer from "nodemailer";

type SendNotificationEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendNotificationEmail({
  to,
  subject,
  body,
}: SendNotificationEmailPayload) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: `<p>${body.replace(/\n/g, "<br />")}</p>`,
    });

    return { success: true, data: info };
  } catch (error) {
    console.error("Notification email send failed:", error);
    return { success: false, error };
  }
}
