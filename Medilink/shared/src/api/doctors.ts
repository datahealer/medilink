// DOCTORS — RE-HOMED from HAMS `doctors[/[id]]` → direct Supabase (RLS).
import { normalizeSearchQuery } from "../utils/normalize";
import type { DB } from "./client";

const LIST_SELECT =
  "id, full_name, full_name_ar, full_name_ar_status, specialty, years_experience, fees, avg_rating, review_count, profile_photo_url, facility_id, branch_id, status, status_updated_at, facilities(name, name_ar, name_ar_status)";

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
  // `doctors.specialty` is uncurated freetext, so an exact case-sensitive `.eq`
  // silently returns nothing when the stored value differs only by case/whitespace
  // from the catalog label the UI sends (QA #8). Match case-insensitively on the
  // trimmed value (no `%` wildcards → still a whole-string match, so "Surgery" does
  // not over-match "Neurosurgery"). Proper fix = a `specialty_id` FK (backend, tracked).
  // `%` is added around the NORMALIZED term. Interpolating the raw value meant a query of
  // "  Ahmed  " became `ilike '%  Ahmed  %'`, which requires that padding to exist inside
  // the stored name and therefore matched nothing — search silently failed for anyone
  // whose keyboard or paste added a space. A whitespace-only term normalizes to "" and is
  // correctly treated as "no term" (return the unfiltered list) rather than `ilike '%   %'`.
  const specialty = normalizeSearchQuery(q.specialty);
  const term = normalizeSearchQuery(q.term);
  if (specialty) query = query.ilike("specialty", specialty);
  if (term) query = query.ilike("full_name", `%${term}%`);

  const limit = q.limit ?? 20;
  const offset = q.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * BP-1 — set of doctor ids that have a real bookable slot on `date` (YYYY-MM-DD).
 * Backed by the `doctors_available_today` RPC (slot-based; ignores `doctors.status`).
 * Called loosely (the RPC is not in the generated Functions types). Returns a Set
 * for O(1) membership when flagging `available_today` on a doctor list.
 */
export async function listDoctorsAvailableToday(db: DB, date: string): Promise<Set<string>> {
  const { data, error } = await db.rpc("doctors_available_today" as never, { p_date: date } as never);
  if (error) throw error;
  const rows = (data ?? []) as { doctor_id: string }[];
  return new Set(rows.map((r) => r.doctor_id).filter(Boolean));
}

/** Doctor detail + their weekly availability rows. */
export async function getDoctor(db: DB, id: string) {
  const [{ data: doctor, error: docErr }, { data: availability, error: availErr }] =
    await Promise.all([
      db.from("doctors").select("*, facilities(name, name_ar, name_ar_status)").eq("id", id).single(),
      db.from("doctor_availability").select("*").eq("doctor_id", id),
    ]);
  if (docErr) throw docErr;
  if (availErr) throw availErr;
  return { doctor, availability: availability ?? [] };
}
