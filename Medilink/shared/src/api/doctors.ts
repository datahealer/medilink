// DOCTORS — RE-HOMED from HAMS `doctors[/[id]]` → direct Supabase (RLS).
import type { DB } from "./client";

const LIST_SELECT =
  "id, full_name, specialty, years_experience, fees, avg_rating, review_count, profile_photo_url, facility_id, branch_id, status, status_updated_at, facilities(name)";

export interface DoctorSearch {
  facilityId?: string;
  branchId?: string;
  specialty?: string;
  /** Case-insensitive substring match on doctor name. */
  term?: string;
  limit?: number;
  offset?: number;
}

export async function searchDoctors(db: DB, q: DoctorSearch = {}) {
  let query = db
    .from("doctors")
    .select(LIST_SELECT)
    .order("avg_rating", { ascending: false, nullsFirst: false });

  if (q.facilityId) query = query.eq("facility_id", q.facilityId);
  if (q.branchId) query = query.eq("branch_id", q.branchId);
  if (q.specialty) query = query.eq("specialty", q.specialty);
  if (q.term) query = query.ilike("full_name", `%${q.term}%`);

  const limit = q.limit ?? 20;
  const offset = q.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Doctor detail + their weekly availability rows. */
export async function getDoctor(db: DB, id: string) {
  const [{ data: doctor, error: docErr }, { data: availability, error: availErr }] =
    await Promise.all([
      db.from("doctors").select("*, facilities(name)").eq("id", id).single(),
      db.from("doctor_availability").select("*").eq("doctor_id", id),
    ]);
  if (docErr) throw docErr;
  if (availErr) throw availErr;
  return { doctor, availability: availability ?? [] };
}
