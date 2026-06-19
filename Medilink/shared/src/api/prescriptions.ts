// PRESCRIPTIONS (read) — RE-HOMED from HAMS `prescriptions` (patient role) → Supabase (RLS).
// PDF generation + share links are privileged ops handled by the backend, not here.
import type { DB } from "./client";
import { getMyPatientProfileId } from "./client";

const SELECT =
  "id, medications, instructions, pdf_url, issued_at, " +
  "doctors!prescriptions_doctor_id_fkey ( full_name, specialty ), " +
  "appointments!prescriptions_appointment_id_fkey ( slot_date, type )";

export async function listPrescriptions(db: DB) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("prescriptions")
    .select(SELECT)
    .eq("patient_id", patientId)
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPrescription(db: DB, id: string) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("prescriptions")
    .select(SELECT)
    .eq("id", id)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
