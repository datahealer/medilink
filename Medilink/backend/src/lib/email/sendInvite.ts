import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

type InviteType = "facility_admin" | "doctor" | "technician" | "staff";

type SendInvitePayload = {
  to: string;
  name: string;
  inviteLink: string;
  inviteType?: InviteType;
  temporaryPassword?: string;
  useExistingAccount?: boolean;
  facilityName?: string;
  loginLink?: string;
};

// ================= INVITE EMAIL =================
function inviteCopy(opts: SendInvitePayload): { subject: string; html: string } {
  const roleLabel =
    opts.inviteType === "doctor"
      ? "Doctor"
      : opts.inviteType === "technician"
      ? "Technician"
      : opts.inviteType === "staff"
      ? "Staff Member"
      : "Facility Admin";

  const facilityText = opts.facilityName ? ` for ${opts.facilityName}` : "";

  const accountInstructions = opts.useExistingAccount
    ? `<p>Use your existing account password to sign in and accept the invite.</p>`
    : opts.temporaryPassword
    ? `
      <p><strong>Temporary Password:</strong> <code>${opts.temporaryPassword}</code></p>
      <p>Use this password to log in when prompted.</p>
    `
    : "";

  return {
    subject: `You're invited to join HAMS as ${roleLabel}`,
    html: `
      <h2>Hello ${opts.name},</h2>
      <p>You have been invited to join HAMS as a <strong>${roleLabel}</strong>${facilityText}.</p>
      ${accountInstructions}
      <p>
        <a href="${opts.inviteLink}"><strong>Accept Invitation</strong></a>
      </p>
      <p>This link expires in 48 hours.</p>
    `,
  };
}

export async function sendInviteEmail(payload: SendInvitePayload) {
  try {
    const { subject, html } = inviteCopy(payload);

    console.log("📧 Sending INVITE email to:", payload.to);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: payload.to,
      subject,
      html,
    });

    console.log("✅ Invite email sent:", info.messageId);

    return { success: true, data: info };
  } catch (error) {
    console.error("❌ Invite Email failed:", error);
    return { success: false, error };
  }
}

// ================= ANNOUNCEMENT EMAIL =================
export async function sendAnnouncementEmail({
  to,
  subject,
  message,
}: {
  to: string;
  subject: string;
  message: string;
}) {
  try {
    console.log("📧 Sending ANNOUNCEMENT email to:", to);

    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2>📢 New Announcement</h2>
        <h3>${subject}</h3>
        <p>${message}</p>
        <hr />
        <p style="font-size: 12px; color: gray;">
          This message was sent from HAMS platform.
        </p>
      </div>
    `;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    console.log("✅ Announcement email sent:", info.messageId);

    return { success: true };
  } catch (error) {
    console.error("❌ Announcement Email failed:", error);
    return { success: false, error };
  }
}