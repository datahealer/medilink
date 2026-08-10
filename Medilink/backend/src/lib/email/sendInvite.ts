/**
 * Staff invitation + announcement emails (facility admin / doctor / technician / staff).
 *
 * Inherited from HAMS and currently has no call site in MediLink — the patient app does
 * not invite staff. Kept, and migrated onto the shared Microsoft 365 transporter, so it
 * does not sit here as the last Gmail-configured module waiting to be rediscovered.
 *
 * Copy now says MediLink rather than HAMS, matching the mailbox these are sent from.
 */
import { ctaButton, escapeHtml, renderEmail, toPlainText } from "./layout";
import { sendMail, type SendMailResult } from "./transporter";

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

function roleLabel(inviteType?: InviteType): string {
  switch (inviteType) {
    case "doctor":
      return "Doctor";
    case "technician":
      return "Technician";
    case "staff":
      return "Staff Member";
    default:
      return "Facility Admin";
  }
}

export async function sendInviteEmail(payload: SendInvitePayload): Promise<SendMailResult> {
  const role = roleLabel(payload.inviteType);
  const facilityText = payload.facilityName ? ` for ${payload.facilityName}` : "";

  const accountInstructions = payload.useExistingAccount
    ? `<p style="margin:0 0 12px;color:#1A1A1A;font-size:15px;line-height:1.6">
         Use your existing account password to sign in and accept the invite.
       </p>`
    : payload.temporaryPassword
      ? `<p style="margin:0 0 12px;color:#1A1A1A;font-size:15px;line-height:1.6">
           <strong>Temporary password:</strong>
           <code style="background:#F5F3F8;padding:2px 6px;border-radius:4px">${escapeHtml(
             payload.temporaryPassword
           )}</code><br />
           Use this password to log in when prompted, then change it immediately.
         </p>`
      : "";

  const html = renderEmail({
    heading: `Hello ${payload.name}`,
    preheader: `You have been invited to join MediLink as ${role}.`,
    body: `
      <p style="margin:0 0 12px;color:#1A1A1A;font-size:15px;line-height:1.6">
        You have been invited to join MediLink as a <strong>${escapeHtml(role)}</strong>${escapeHtml(
          facilityText
        )}.
      </p>
      ${accountInstructions}
      ${ctaButton("Accept invitation", payload.inviteLink)}
      <p style="margin:0;color:#6B6B6B;font-size:13px">This link expires in 48 hours.</p>
    `,
  });

  return sendMail({
    to: payload.to,
    subject: `You're invited to join MediLink as ${role}`,
    html,
    text: toPlainText(html),
  });
}

export async function sendAnnouncementEmail({
  to,
  subject,
  message,
}: {
  to: string;
  subject: string;
  message: string;
}): Promise<SendMailResult> {
  const html = renderEmail({
    heading: subject,
    preheader: message.slice(0, 120),
    body: `<p style="margin:0;color:#1A1A1A;font-size:15px;line-height:1.6">${escapeHtml(
      message
    ).replace(/\n/g, "<br />")}</p>`,
  });

  return sendMail({ to, subject, html, text: toPlainText(html) });
}
