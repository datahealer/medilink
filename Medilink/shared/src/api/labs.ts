// LABS — RE-HOMED from HAMS `patients/me/results` → direct Supabase (RLS).
// A lab result is a delivered report *file* (public.lab_results) plus structured analytes
// (public.lab_result_analytes: value, unit, reference range, high/normal/low flag). Per-report
// status + flagged_count are trigger-derived; trends query analytes by stable analyte_code over
// measured_at. Report files stay in the private `lab-results` bucket (signed URLs on demand).
import type { DB, Enums } from "./client";
import { getMyPatientProfileId } from "./client";

export type LabFlag = Enums["lab_flag"];
export type LabStatus = Enums["lab_result_status"];

export interface LabResultListItem {
  id: string;
  test_name: string;
  facility_name: string | null;
  result_date: string | null; // DATE; falls back to uploaded_at date in the UI
  uploaded_at: string;
  status: LabStatus;
  flagged_count: number;
}

export interface LabAnalyte {
  id: string;
  analyte_code: string;
  analyte_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  flag: LabFlag;
  measured_at: string;
  display_order: number;
}

export interface LabResultDetail extends LabResultListItem {
  ai_insight: string | null;
  ai_insight_at: string | null;
  storage_path: string | null;
  file_url: string;
  file_type: string;
  notes: string | null;
  analytes: LabAnalyte[];
}

export interface LabTrendPoint {
  measured_at: string;
  value_numeric: number | null;
  unit: string | null;
  flag: LabFlag;
}

/** Resolve the (possibly array-shaped) embedded facility relation to a single name. */
function facilityName(facility: unknown): string | null {
  if (Array.isArray(facility)) return (facility[0] as { name?: string } | undefined)?.name ?? null;
  return (facility as { name?: string } | null)?.name ?? null;
}

const LIST_SELECT =
  "id, test_name, result_date, uploaded_at, status, flagged_count, facility:facility_id ( name )";

export async function listLabResults(db: DB): Promise<LabResultListItem[]> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("lab_results")
    .select(LIST_SELECT)
    .eq("patient_id", patientId)
    .order("result_date", { ascending: false, nullsFirst: false })
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    test_name: r.test_name,
    facility_name: facilityName(r.facility),
    result_date: r.result_date,
    uploaded_at: r.uploaded_at,
    status: r.status,
    flagged_count: r.flagged_count,
  }));
}

/** Full report + ordered analytes + optional AI insight. Patient-scoped via RLS. */
export async function getLabResult(db: DB, id: string): Promise<LabResultDetail | null> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("lab_results")
    .select(
      "id, test_name, result_date, uploaded_at, status, flagged_count, ai_insight, ai_insight_at, storage_path, file_url, file_type, notes, facility:facility_id ( name ), analytes:lab_result_analytes ( id, analyte_code, analyte_name, value_numeric, value_text, unit, reference_low, reference_high, reference_text, flag, measured_at, display_order )"
    )
    .eq("id", id)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const analytes = ((data.analytes ?? []) as LabAnalyte[])
    .slice()
    .sort((a, b) => a.display_order - b.display_order);
  return {
    id: data.id,
    test_name: data.test_name,
    facility_name: facilityName(data.facility),
    result_date: data.result_date,
    uploaded_at: data.uploaded_at,
    status: data.status,
    flagged_count: data.flagged_count,
    ai_insight: data.ai_insight,
    ai_insight_at: data.ai_insight_at,
    storage_path: data.storage_path,
    file_url: data.file_url,
    file_type: data.file_type,
    notes: data.notes,
    analytes,
  };
}

/** Time series for one analyte (oldest→newest) for the caller, for trend display. */
export async function getAnalyteTrend(
  db: DB,
  analyteCode: string,
  limit = 12
): Promise<LabTrendPoint[]> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("lab_result_analytes")
    .select("measured_at, value_numeric, unit, flag")
    .eq("patient_id", patientId)
    .eq("analyte_code", analyteCode)
    .order("measured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((p) => ({ measured_at: p.measured_at, value_numeric: p.value_numeric, unit: p.unit, flag: p.flag }))
    .reverse();
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
