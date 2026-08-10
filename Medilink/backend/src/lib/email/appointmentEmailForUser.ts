/**
 * Server-side helper: look up one appointment with a SERVICE-ROLE client and email the
 * patient about it.
 *
 * Separate from `POST /api/appointments/:id/email`, which is the RLS-scoped, caller-driven
 * path. This one exists for the payment finalisation paths (the Thawani webhook, and
 * `payments/verify` for the local/LAN case where the webhook cannot reach the backend):
 * there is no user session there — the request comes from the gateway — so the read cannot
 * be RLS-scoped and the recipient cannot come from a session. The `userId` passed in is
 * already the authoritative owner both routes resolved from the payment row.
 *
 * Never throws. Both call sites treat email as a non-fatal side effect of a payment that
 * has already been captured.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";

import { sendAppointmentEmail, type AppointmentEmailKind } from "./sendAppointment";
import type { SendMailResult } from "./transporter";

type Service = SupabaseClient<Database>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Same precedence as the RLS route: geocoded single-line address, else assembled parts. */
function facilityAddress(formatted: string | null | undefined, raw: unknown): string | null {
  if (formatted?.trim()) return formatted.trim();
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const joined = [a.street, a.area, a.city, a.region]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(", ");
  return joined || null;
}

export async function sendAppointmentEmailForUser(
  service: Service,
  opts: {
    appointmentId: string;
    /** auth.users id of the patient who owns the appointment. */
    userId: string;
    kind: AppointmentEmailKind;
    /** Pre-resolved recipient, when the caller already fetched it (saves an admin call). */
    to?: string | null;
  }
): Promise<SendMailResult> {
  try {
    let to = opts.to ?? null;
    if (!to) {
      // `profiles` does not reliably carry an email — auth.users is the source of truth.
      const { data } = await service.auth.admin.getUserById(opts.userId);
      to = data.user?.email ?? null;
    }
    if (!to) return { success: false, skipped: true };

    const { data: appointment } = await service
      // One string literal — see the note in api/appointments/[id]/email/route.ts.
      .from("appointments")
      .select("id, slot_date, slot_start, cancellation_reason, doctor:doctor_id ( full_name, specialty ), facility:facility_id ( name, address, formatted_address ), family_member:for_family_member_id ( full_name )")
      .eq("id", opts.appointmentId)
      .maybeSingle();

    if (!appointment) return { success: false, skipped: true };

    const doctor = one(appointment.doctor as { full_name?: string; specialty?: string } | null);
    const facility = one(
      appointment.facility as
        | { name?: string; address?: unknown; formatted_address?: string | null }
        | null
    );
    const familyMember = one(appointment.family_member as { full_name?: string } | null);

    return await sendAppointmentEmail({
      kind: opts.kind,
      to,
      patientName: familyMember?.full_name ?? null,
      doctorName: doctor?.full_name ?? null,
      specialty: doctor?.specialty ?? null,
      facilityName: facility?.name ?? null,
      facilityAddress: facilityAddress(facility?.formatted_address, facility?.address),
      slotDate: appointment.slot_date,
      slotStart: appointment.slot_start,
      reference: appointment.id,
      reason: opts.kind === "cancelled" ? appointment.cancellation_reason : null,
      actionUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/dashboard/appointments`
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] appointment email lookup failed:", message);
    return { success: false, error: message };
  }
}
