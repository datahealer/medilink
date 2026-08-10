/**
 * Ask the backend to email the patient about an appointment change.
 *
 * Only `cancelled` and `rescheduled` are triggered from the client. The BOOKED
 * confirmation is deliberately NOT sent here: `book_appointment_atomic` creates the
 * appointment as `pending`, and payment is what confirms it — so that email is sent
 * server-side from the payment webhook / verify path, where the appointment is genuinely
 * confirmed. Sending it at booking time would confirm a hold the TTL sweeper may release.
 *
 * SMTP credentials cannot exist in a mobile bundle, so the send has to be a backend call;
 * this is that call and nothing more. It carries no data — the backend re-reads the
 * appointment under the caller's own session (RLS) and takes the recipient from the
 * verified session, so a compromised client cannot mail arbitrary people or read someone
 * else's appointment.
 */
import { apiFetch } from "@/services/api";

export type AppointmentEmailKind = "cancelled" | "rescheduled";

/**
 * Fire-and-forget. Deliberately NOT awaited by callers and never rejects.
 *
 * The cancellation has already committed in the database by the time this runs. Letting a
 * dead backend, an offline device or an SMTP outage surface as a thrown error would show
 * the patient "Cancellation failed" for an appointment that is, in fact, cancelled — a
 * strictly worse outcome than a missing email.
 */
export function notifyAppointmentEmail(
  appointmentId: string,
  kind: AppointmentEmailKind
): void {
  void apiFetch(`/api/appointments/${appointmentId}/email`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  }).catch((e) => {
    if (__DEV__) console.warn(`[appointmentEmail] ${kind} email request failed`, e);
  });
}
