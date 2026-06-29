// PAYMENTS — read side (Thawani is a hosted checkout; the patient's card is never
// stored by us). These are direct-Supabase reads of the `payments` table, scoped
// to the caller through appointment ownership so they're correct regardless of the
// payments RLS shape. Creating a checkout session is a privileged op done via the
// HAMS backend (see the mobile apiFetch client), not here.
import type { DB } from "./client";
import { getMyPatientProfileId } from "./client";

// Full payment row + the appointment it pays for (doctor/facility for recaps & invoices).
const PAYMENT_SELECT =
  "id, amount, currency, status, payment_method, gateway, gateway_ref, invoice_url, created_at, " +
  "appointment:appointment_id!inner ( id, patient_id, reference_number, slot_date, slot_start, type, " +
  "doctor:doctor_id ( full_name, specialty, fees ), facility:facility_id ( name, address ) )";

/** The caller's payments (newest first), scoped via appointment ownership. */
export async function listMyPayments(db: DB) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("appointment.patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single payment by id, scoped to the caller. */
export async function getPayment(db: DB, id: string) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", id)
    .eq("appointment.patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The payment for a given appointment (payments.appointment_id is UNIQUE), or null. */
export async function getPaymentByAppointment(db: DB, appointmentId: string) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("appointment_id", appointmentId)
    .eq("appointment.patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
