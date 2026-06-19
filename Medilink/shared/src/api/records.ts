// MEDICAL RECORDS — RE-HOMED from HAMS `patients/me/medical-history` + `patients/me/documents`.
// Medical history (structured, one row/patient) + uploaded documents (with signed URLs).
import type { DB, Insert, Row } from "./client";
import { getMyPatientProfileId } from "./client";

export type MedicalHistory = Row<"medical_histories">;
export type PatientDocument = Row<"patient_documents">;

const DOCS_SELECT =
  "*, appointment:linked_appointment_id ( slot_date, slot_start, doctor:doctor_id ( full_name ) )";

// ---- Medical history ----

export async function getMedicalHistory(db: DB): Promise<MedicalHistory | null> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("medical_histories")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface MedicalHistoryPatch {
  allergies?: Insert<"medical_histories">["allergies"];
  conditions?: Insert<"medical_histories">["conditions"];
  medications?: Insert<"medical_histories">["medications"];
  surgeries?: Insert<"medical_histories">["surgeries"];
  smoking_status?: Insert<"medical_histories">["smoking_status"];
  notes?: string | null;
}

/** Create-or-update the patient's single medical-history row (upsert on patient_id). */
export async function upsertMedicalHistory(
  db: DB,
  patch: MedicalHistoryPatch
): Promise<MedicalHistory> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("medical_histories")
    .upsert(
      { patient_id: patientId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "patient_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Documents ----

export async function listDocuments(db: DB) {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("patient_documents")
    .select(DOCS_SELECT)
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface NewDocument {
  name: string;
  type: Insert<"patient_documents">["type"];
  /** Storage object path within the `patient-docs` bucket. */
  file_url: string;
  file_type: string;
  linked_appointment_id?: string | null;
}

export async function addDocument(db: DB, doc: NewDocument): Promise<PatientDocument> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("patient_documents")
    .insert({
      patient_id: patientId,
      name: doc.name,
      type: doc.type,
      file_url: doc.file_url,
      file_type: doc.file_type,
      linked_appointment_id: doc.linked_appointment_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-delete (matches the `deleted_at is null` list filter). */
export async function deleteDocument(db: DB, id: string): Promise<void> {
  const patientId = await getMyPatientProfileId(db);
  const { error } = await db
    .from("patient_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("patient_id", patientId);
  if (error) throw error;
}

/** Short-lived signed URL for a stored document object (default 1h). */
export async function getDocumentSignedUrl(
  db: DB,
  path: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await db.storage
    .from("patient-docs")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
