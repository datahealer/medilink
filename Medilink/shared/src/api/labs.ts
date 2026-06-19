// LABS — RE-HOMED from HAMS `patients/me/results` → direct Supabase (RLS).
// Rows reference objects in the `lab-results` storage bucket; URLs are signed on demand.
import type { DB, Row } from "./client";
import { getMyPatientProfileId } from "./client";

export type LabResult = Row<"lab_results">;

const SELECT =
  "id, test_name, file_url, file_type, notes, is_viewed, viewed_at, uploaded_at, facility_id";

export async function listLabResults(db: DB): Promise<LabResult[]> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("lab_results")
    .select(SELECT)
    .eq("patient_id", patientId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LabResult[];
}

/** Mark a result as viewed (idempotent). */
export async function markLabResultViewed(db: DB, id: string): Promise<void> {
  const patientId = await getMyPatientProfileId(db);
  const { error } = await db
    .from("lab_results")
    .update({ is_viewed: true, viewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("patient_id", patientId);
  if (error) throw error;
}

/** Short-lived signed URL for a lab-result file (default 5 min, matching HAMS). */
export async function getLabResultSignedUrl(
  db: DB,
  path: string,
  expiresIn = 300
): Promise<string> {
  const { data, error } = await db.storage
    .from("lab-results")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
