/**
 * Appointment lifecycle emails — booked, cancelled, rescheduled.
 *
 * These are TRANSACTIONAL, so they go out over the shared Microsoft 365 transporter.
 * Nothing here touches Supabase Auth's own mail (signup/verification/reset/OTP), which
 * stays with GoTrue — see the scope note at the top of transporter.ts.
 *
 * The three variants share one shape because the recipient's question is the same in all
 * three cases ("what is now true about my visit?"); only the heading, the subject and one
 * closing line differ. Splitting them into three near-identical templates was the
 * alternative and it drifts within a sprint.
 */
import { ctaButton, detailRows, escapeHtml, renderEmail, toPlainText } from "./layout";
import { sendMail, type SendMailResult } from "./transporter";

export type AppointmentEmailKind = "booked" | "cancelled" | "rescheduled";

export type AppointmentEmailInput = {
  kind: AppointmentEmailKind;
  to: string;
  /** Who the visit is for — the patient, or a family member booked on their behalf. */
  patientName?: string | null;
  doctorName?: string | null;
  specialty?: string | null;
  facilityName?: string | null;
  facilityAddress?: string | null;
  /** ISO date, `YYYY-MM-DD`. Rendered as-is when it cannot be parsed. */
  slotDate?: string | null;
  /** `HH:MM` or `HH:MM:SS`. */
  slotStart?: string | null;
  reference?: string | null;
  /** Cancellation reason, when the caller recorded one. */
  reason?: string | null;
  /** Deep link back into the app's appointment detail, when available. */
  actionUrl?: string | null;
};

/**
 * Render `YYYY-MM-DD` as "Monday, 12 August 2026".
 *
 * `en-GB` is fixed on purpose: the recipient's locale is not knowable server-side, and an
 * ambiguous 08/12/2026 in a medical appointment email is a missed visit. Arabic templates
 * are a separate piece of work (the in-app notifications are already bilingual); until
 * then the copy is English rather than half-translated.
 */
function formatDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** `14:30:00` → `14:30`. Seconds are noise in an appointment time. */
function formatTime(value?: string | null): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
}

const COPY: Record<
  AppointmentEmailKind,
  { subject: string; heading: string; lead: string; closing: string }
> = {
  booked: {
    subject: "Your appointment is confirmed",
    heading: "Appointment confirmed",
    lead: "Your appointment has been booked. The details are below.",
    closing:
      "Please arrive 10 minutes early and bring any relevant medical documents. " +
      "You can view, reschedule or cancel this appointment in the MediLink app.",
  },
  cancelled: {
    subject: "Your appointment has been cancelled",
    heading: "Appointment cancelled",
    lead: "The following appointment has been cancelled.",
    closing:
      "If a payment was made, any refund is processed automatically and appears on your " +
      "original payment method. You can book a new appointment any time in the MediLink app.",
  },
  rescheduled: {
    subject: "Your appointment has been rescheduled",
    heading: "Appointment rescheduled",
    lead: "Your appointment has moved. The new details are below.",
    closing:
      "Your previous time slot has been released. Please arrive 10 minutes early for the " +
      "new appointment.",
  },
};

export async function sendAppointmentEmail(input: AppointmentEmailInput): Promise<SendMailResult> {
  const copy = COPY[input.kind];
  const date = formatDate(input.slotDate);
  const time = formatTime(input.slotStart);

  const rows = detailRows([
    { label: "Patient", value: input.patientName ?? "" },
    {
      label: "Doctor",
      value: [input.doctorName, input.specialty].filter(Boolean).join(" · "),
    },
    { label: "Clinic", value: input.facilityName ?? "" },
    { label: "Address", value: input.facilityAddress ?? "" },
    { label: input.kind === "rescheduled" ? "New date" : "Date", value: date },
    { label: input.kind === "rescheduled" ? "New time" : "Time", value: time },
    { label: "Reference", value: input.reference ?? "" },
    { label: "Reason", value: input.kind === "cancelled" ? (input.reason ?? "") : "" },
  ]);

  const html = renderEmail({
    heading: copy.heading,
    preheader: [copy.subject, date, time].filter(Boolean).join(" — "),
    body: `
      <p style="margin:0;color:#1A1A1A;font-size:15px;line-height:1.6">${escapeHtml(copy.lead)}</p>
      ${rows}
      ${ctaButton("View appointment", input.actionUrl)}
      <p style="margin:0;color:#6B6B6B;font-size:13px;line-height:1.6">${escapeHtml(copy.closing)}</p>
    `,
  });

  const subject = date ? `${copy.subject} — ${date}` : copy.subject;
  return sendMail({ to: input.to, subject, html, text: toPlainText(html) });
}
