/**
 * POST /api/appointments/:id/email — send the booking / cancellation / reschedule
 * confirmation email for one appointment.
 *
 * ── Why this lives in the backend tier at all ──
 *
 * Booking, cancelling and rescheduling are RLS-safe RPCs the clients call directly
 * (`shared/src/api/appointments.ts`), so there was no server-side moment at which an email
 * could be sent. SMTP credentials cannot go anywhere near a browser or an Expo bundle, so
 * the send needs a server. This route is that server hook and nothing more — it performs
 * no booking side effects, writes nothing, and cannot change an appointment's state.
 *
 * ── Authorisation ──
 *
 * The appointment is read through the CALLER'S OWN session (`createApiSupabaseClient`
 * honours the mobile bearer token and the web cookie alike), so the existing RLS policy is
 * what decides whether this user may see it. A patient asking for someone else's
 * appointment id gets `.maybeSingle()` → null → 404, with no service-role client anywhere
 * in the path. That is deliberate: a service-role read here would turn "send my
 * confirmation" into an appointment-detail oracle for any authenticated user.
 *
 * The recipient is likewise NOT caller-supplied — it is `user.email` from the verified
 * session. Accepting a `to` field would make this an open relay for MediLink-branded mail.
 *
 * ── Failure posture ──
 *
 * Always 200 with `{ sent: boolean }` once authorisation passes. Callers invoke this
 * fire-and-forget after an operation that has already committed; a bounced email must not
 * read as a failed booking. Genuine 4xx are reserved for "not your appointment" and a
 * malformed `kind`.
 */
import { NextRequest, NextResponse } from "next/server";

import { getUserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { sendAppointmentEmail, type AppointmentEmailKind } from "@/lib/email/sendAppointment";
import { createApiSupabaseClient } from "@/lib/supabase/api";

const KINDS: readonly AppointmentEmailKind[] = ["booked", "cancelled", "rescheduled"];

function isKind(value: unknown): value is AppointmentEmailKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

/** Nested Supabase relations come back as an object or a single-element array depending
 *  on how the FK is inferred; normalise both. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * `facilities.address` is a JSON blob; `facilities.formatted_address` is the geocoder's
 * single-line version and is NULL for any clinic that has not been geocoded yet. Prefer
 * the formatted one, fall back to assembling the parts — matching what the web clinic
 * page already renders, so the email does not disagree with the app.
 */
function facilityAddress(formatted: string | null, raw: unknown): string | null {
  if (formatted?.trim()) return formatted.trim();
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const joined = [a.street, a.area, a.city, a.region]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(", ");
  return joined || null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
    if (!isKind(body.kind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${KINDS.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createApiSupabaseClient(req);
    const user = await getUserOrThrow(supabase);

    // RLS-scoped read — see the authorisation note above.
    const { data: appointment } = await supabase
      .from("appointments")
      // ONE string literal, not a `+` concatenation: supabase-js derives the row type
      // from the literal type of this argument, and TypeScript widens `"a" + "b"` to
      // plain `string` — which collapses the result to GenericStringError and makes every
      // field access below an error. Keep it on one line however long it gets.
      .select("id, slot_date, slot_start, cancellation_reason, doctor:doctor_id ( full_name, specialty ), facility:facility_id ( name, address, formatted_address ), family_member:for_family_member_id ( full_name )")
      .eq("id", id)
      .maybeSingle();

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // The session's email is the account's verified address; profiles may not carry one.
    const to = user.email;
    if (!to) {
      // Possible for a phone-only identity. Not an error — there is simply nowhere to send.
      return NextResponse.json({ sent: false, reason: "no_email_on_account" });
    }

    const doctor = one(appointment.doctor as { full_name?: string; specialty?: string } | null);
    const facility = one(
      appointment.facility as
        | { name?: string; address?: unknown; formatted_address?: string | null }
        | null
    );
    const familyMember = one(appointment.family_member as { full_name?: string } | null);

    const result = await sendAppointmentEmail({
      kind: body.kind,
      to,
      // A visit booked for a family member is theirs, not the account holder's — naming
      // the account holder on a child's appointment email is confusing and wrong.
      patientName: familyMember?.full_name ?? user.user_metadata?.full_name ?? null,
      doctorName: doctor?.full_name ?? null,
      specialty: doctor?.specialty ?? null,
      facilityName: facility?.name ?? null,
      facilityAddress: facilityAddress(facility?.formatted_address ?? null, facility?.address),
      slotDate: appointment.slot_date,
      slotStart: appointment.slot_start,
      reference: appointment.id,
      reason: body.kind === "cancelled" ? appointment.cancellation_reason : null,
      actionUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/dashboard/appointments`
        : null,
    });

    return NextResponse.json({ sent: result.success });
  } catch (err) {
    const authRes = authErrorResponse(err, "error");
    if (authRes) return authRes;
    console.error("[appointments/email] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not send appointment email" }, { status: 500 });
  }
}
