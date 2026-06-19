// REVIEWS — RE-HOMED from HAMS `reviews/me` (list) + `reviews` POST (create) → Supabase (RLS).
import type { DB, Enums, Row } from "./client";
import { getMyPatientProfileId } from "./client";

export type Review = Row<"reviews">;
export type ReviewWithTarget = Review & { target_name: string | null };

/** The patient's own reviews, enriched with the target facility/doctor name. */
export async function listMyReviews(db: DB): Promise<ReviewWithTarget[]> {
  const patientId = await getMyPatientProfileId(db);
  const { data: reviews, error } = await db
    .from("reviews")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = reviews ?? [];
  const facilityIds = rows.filter((r) => r.target_type === "facility").map((r) => r.target_id);
  const doctorIds = rows.filter((r) => r.target_type === "doctor").map((r) => r.target_id);

  const [facilities, doctors] = await Promise.all([
    facilityIds.length
      ? db.from("facilities").select("id, name").in("id", facilityIds)
      : Promise.resolve({ data: [], error: null }),
    doctorIds.length
      ? db.from("doctors").select("id, full_name").in("id", doctorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (facilities.error) throw facilities.error;
  if (doctors.error) throw doctors.error;

  const facilityNames = new Map((facilities.data ?? []).map((f) => [f.id, f.name]));
  const doctorNames = new Map((doctors.data ?? []).map((d) => [d.id, d.full_name]));

  return rows.map((r) => ({
    ...r,
    target_name:
      (r.target_type === "facility"
        ? facilityNames.get(r.target_id)
        : doctorNames.get(r.target_id)) ?? null,
  }));
}

export interface NewReview {
  targetType: Enums["review_target"];
  targetId: string;
  rating: number; // 1..5
  reviewText: string;
  comment?: string | null;
  appointmentId?: string | null;
}

export async function createReview(db: DB, input: NewReview): Promise<Review> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("reviews")
    .insert({
      patient_id: patientId,
      target_type: input.targetType,
      target_id: input.targetId,
      rating: input.rating,
      review_text: input.reviewText,
      comment: input.comment ?? null,
      appointment_id: input.appointmentId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
