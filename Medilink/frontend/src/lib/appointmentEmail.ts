"use client";

/**
 * Ask the backend to email the patient about an appointment change.
 *
 * Web counterpart of `mobile/src/services/appointmentEmail.ts`; the same reasoning applies
 * to both. Only `cancelled` and `rescheduled` are triggered from the client — the BOOKED
 * confirmation is sent server-side from the payment webhook / verify path, because
 * `book_appointment_atomic` leaves the appointment `pending` until payment confirms it.
 *
 * The request carries no appointment data: the backend re-reads it under the caller's own
 * session (RLS) and takes the recipient from the verified session, so this cannot be used
 * to mail arbitrary addresses or to probe someone else's appointment.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

export type AppointmentEmailKind = "cancelled" | "rescheduled";

/**
 * Fire-and-forget. Never rejects, and callers must not await it.
 *
 * The cancellation has already committed by the time this runs — surfacing an email
 * failure as "Could not cancel the appointment" would be actively misleading.
 */
export function notifyAppointmentEmail(
  appointmentId: string,
  kind: AppointmentEmailKind
): void {
  void (async () => {
    try {
      // Bearer token rather than relying on the cookie alone: the backend is a separate
      // origin in the deployed setup, and `createApiSupabaseClient` reads Authorization
      // first. `credentials: "include"` stays for the same-origin/proxied deployment.
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      const token = data.session?.access_token;

      await fetch(`${env.BACKEND_URL}/api/appointments/${appointmentId}/email`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ kind }),
      });
    } catch {
      // Nothing actionable client-side; the state change already succeeded.
    }
  })();
}
