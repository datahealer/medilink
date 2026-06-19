// FAVOURITES — RE-HOMED from HAMS `patients/me/favourites` → direct Supabase (RLS).
// Cross-cutting over doctors + facilities (target_type discriminates).
import type { DB, Row } from "./client";
import { getMyPatientProfileId } from "./client";

export type Favourite = Row<"favourites">;
export type FavouriteTarget = "doctor" | "facility";

export async function listFavourites(
  db: DB,
  targetType?: FavouriteTarget
): Promise<Favourite[]> {
  const patientId = await getMyPatientProfileId(db);
  let query = db
    .from("favourites")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (targetType) query = query.eq("target_type", targetType);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function isFavourite(
  db: DB,
  target: { targetId: string; targetType: FavouriteTarget }
): Promise<boolean> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("favourites")
    .select("id")
    .eq("patient_id", patientId)
    .eq("target_id", target.targetId)
    .eq("target_type", target.targetType)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

/** Toggle a favourite. Returns the new state (`true` = now favourited). */
export async function toggleFavourite(
  db: DB,
  target: { targetId: string; targetType: FavouriteTarget }
): Promise<boolean> {
  const patientId = await getMyPatientProfileId(db);
  const { data: existing, error: findErr } = await db
    .from("favourites")
    .select("id")
    .eq("patient_id", patientId)
    .eq("target_id", target.targetId)
    .eq("target_type", target.targetType)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await db.from("favourites").delete().eq("id", existing.id);
    if (error) throw error;
    return false;
  }

  const { error } = await db.from("favourites").insert({
    patient_id: patientId,
    target_id: target.targetId,
    target_type: target.targetType,
  });
  if (error) throw error;
  return true;
}
