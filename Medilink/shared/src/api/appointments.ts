// APPOINTMENTS — RE-HOMED from HAMS `patients/me/appointments`, `appointments/book`,
// `appointments/[id]`, `slots` → direct Supabase + RPCs (RLS / SECURITY DEFINER).
import type { DB, Enums, Json } from "./client";
import { getCurrentUserId, getMyPatientProfileId, today } from "./client";

/**
 * Call an RPC not present in the generated types (e.g. the patient-action wrappers).
 * IMPORTANT: invoke `db.rpc(...)` directly — assigning it to a local (`const call =
 * db.rpc`) detaches `this`, and supabase-js's rpc reads `this.rest`, throwing
 * "Cannot read property 'rest' of undefined" before any request is made.
 */
async function rpcLoose(db: DB, fn: string, args: Record<string, unknown>): Promise<Json> {
  const res = await db.rpc(fn as never, args as never);
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (dev) {
    const r = res as { data?: unknown; error?: unknown; status?: number; statusText?: string };
    console.warn(`[rpc ${fn}]`, { data: r.data, error: r.error, status: r.status, statusText: r.statusText });
  }
  if (res.error) throw res.error;
  return (res.data ?? null) as Json;
}

const LIST_SELECT =
  "*, doctor:doctor_id ( id, full_name, specialty, fees ), facility:facility_id ( id, name, address ), " +
  "family_member:for_family_member_id ( full_name ), " +
  "payments ( id, status, amount, currency, invoice_url )";

export type AppointmentTab = "upcoming" | "past" | "all";

/** List the patient's appointments (newest first), optionally partitioned by tab. */
export async function listMyAppointments(db: DB, tab: AppointmentTab = "all") {
  const patientId = await getMyPatientProfileId(db);
  let query = db
    .from("appointments")
    .select(LIST_SELECT)
    .eq("patient_id", patientId)
    .order("slot_date", { ascending: false });

  if (tab === "upcoming") query = query.gte("slot_date", today());
  else if (tab === "past") query = query.lt("slot_date", today());

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** A single appointment (same shape as the list rows), scoped to the caller. */
export async function getAppointment(db: DB, id: string) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("appointments")
    .select(LIST_SELECT)
    .eq("id", id)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface BookAppointmentInput {
  doctorId: string;
  facilityId: string;
  slotDate: string; // YYYY-MM-DD
  slotStart: string; // HH:MM[:SS]
  type: Enums["appointment_type"];
  forFamilyMemberId?: string;
  isEmergency?: boolean;
}

/** Book atomically (RPC enforces slot uniqueness / overbooking guards). */
export async function bookAppointment(db: DB, input: BookAppointmentInput): Promise<Json> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db.rpc("book_appointment_atomic", {
    p_patient_id: patientId,
    p_doctor_id: input.doctorId,
    p_facility_id: input.facilityId,
    p_slot_date: input.slotDate,
    p_slot_start: input.slotStart,
    p_type: input.type,
    p_is_emergency: input.isEmergency ?? false,
    p_for_family_member_id: input.forFamilyMemberId,
  });
  if (error) throw error;
  return data;
}

/**
 * Cancel (RPC enforces cutoff + refund side-effects).
 *
 * NOTE (Phase 3 hybrid merge, see MERGE_INTEGRATION_STRATEGY_AUDIT.md §2.3): an
 * `ios`-branch rewrite of this function called a new `cancel_my_appointment`
 * patient-wrapper RPC. That RPC does not exist in the deployed backend (verified
 * live during the audit — PGRST202, function not found). Do NOT switch to it
 * until it's actually written and migrated; doing so would break cancellation
 * for every user the moment this code path runs.
 */
export async function cancelAppointment(
  db: DB,
  id: string,
  opts: { reason?: string; skipCutoff?: boolean } = {}
): Promise<Json> {
  const userId = await getCurrentUserId(db);
  const { data, error } = await db.rpc("cancel_appointment_safe", {
    p_id: id,
    p_user_id: userId,
    p_reason: opts.reason,
    p_skip_cutoff: opts.skipCutoff ?? false,
  });
  if (error) throw error;
  return data;
}

/**
 * Reschedule atomically to a new slot.
 *
 * NOTE (Phase 3 hybrid merge): same reasoning as cancelAppointment above — do
 * NOT switch to the `ios`-branch `reschedule_my_appointment` wrapper RPC until
 * it actually exists in the deployed backend.
 */
export async function rescheduleAppointment(
  db: DB,
  id: string,
  slot: { date: string; start: string; end: string; skipCutoff?: boolean }
): Promise<Json> {
  const userId = await getCurrentUserId(db);
  const { data, error } = await db.rpc("reschedule_appointment_atomic", {
    p_id: id,
    p_user_id: userId,
    p_new_date: slot.date,
    p_new_start: slot.start,
    p_new_end: slot.end,
    p_skip_cutoff: slot.skipCutoff ?? false,
  });
  if (error) throw error;
  return data;
}

/** Check in via the patient wrapper (checkin_my_appointment); enqueues into the facility queue. */
export async function checkInAppointment(
  db: DB,
  input: { appointmentId: string; patientName: string; patientPhone: string }
): Promise<Json> {
  return rpcLoose(db, "checkin_my_appointment", {
    p_id: input.appointmentId,
    p_patient_name: input.patientName,
    p_patient_phone: input.patientPhone,
  });
}

/** Re-book a fresh appointment from a previous one. */
export async function rebookAppointment(db: DB, originalId: string): Promise<Json> {
  const { data, error } = await db.rpc("rebook_appointment", { p_original_id: originalId });
  if (error) throw error;
  return data;
}

/** Claim an offered waitlist slot. */
export async function claimWaitlistAppointment(db: DB, entryId: string): Promise<Json> {
  const { data, error } = await db.rpc("claim_waitlist_appointment", { p_entry_id: entryId });
  if (error) throw error;
  return data;
}

export interface AvailableSlot {
  start: string;
  end?: string;
  [k: string]: unknown;
}

/**
 * Available booking slots for a doctor on a date. Mirrors HAMS `/api/slots`:
 * a doctor's weekly template (`doctor_availability.slots` JSONB for that weekday)
 * minus slots already taken by non-emergency pending/confirmed/checked-in appointments.
 */
export async function getAvailableSlots(
  db: DB,
  q: { doctorId: string; date: string; branchId?: string }
): Promise<AvailableSlot[]> {
  const dayOfWeek = new Date(`${q.date}T00:00:00`).getDay();

  const { data: availability, error: availErr } = await db
    .from("doctor_availability")
    .select("slots")
    .eq("doctor_id", q.doctorId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();
  if (availErr) throw availErr;

  const template = (availability?.slots as AvailableSlot[] | null) ?? [];
  if (template.length === 0) return [];

  let bookedQuery = db
    .from("appointments")
    .select("slot_start")
    .eq("doctor_id", q.doctorId)
    .eq("slot_date", q.date)
    .in("status", ["pending", "confirmed", "checked_in"])
    .eq("is_emergency", false);
  if (q.branchId) bookedQuery = bookedQuery.eq("branch_id", q.branchId);

  const { data: bookedRows, error: bookedErr } = await bookedQuery;
  if (bookedErr) throw bookedErr;

  // appointments.slot_start serializes as "HH:MM:SS"; template starts are "HH:MM".
  const booked = new Set(
    (bookedRows ?? [])
      .map((r) => r.slot_start)
      .filter((t): t is string => Boolean(t))
      .map((t) => t.slice(0, 5))
  );

  return template.filter((s) => {
    const start = typeof s.start === "string" ? s.start.slice(0, 5) : "";
    return start !== "" && !booked.has(start);
  });
}
