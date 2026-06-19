// FACILITIES — RE-HOMED from HAMS `facilities[/[id]]` + `facilities/nearby` → Supabase (RLS).
import type { DB } from "./client";

const LIST_SELECT =
  "id, name, type, address, services, rating, review_count, is_verified, cover_photo_url, phone, doctors!inner(id)";

const DETAIL_SELECT =
  "id, name, type, custom_type, description, address, phone, email, website, logo_url, cover_photo_url, working_hours, services, accepted_insurances, rating, review_count, status, is_verified, location";

export interface FacilityList {
  /** Filter to facilities offering this service (array contains). */
  service?: string;
  limit?: number;
  offset?: number;
}

/** Active + verified facilities that have at least one doctor (inner join). */
export async function listFacilities(db: DB, opts: FacilityList = {}) {
  let query = db
    .from("facilities")
    .select(LIST_SELECT)
    .eq("status", "active")
    .eq("is_verified", true)
    .order("rating", { ascending: false, nullsFirst: false });

  if (opts.service) query = query.contains("services", [opts.service]);

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getFacility(db: DB, id: string) {
  const { data, error } = await db
    .from("facilities")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .eq("is_verified", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Geo proximity search over facilities (RPC: get_nearby_facilities). */
export async function nearbyFacilities(
  db: DB,
  geo: { lat: number; lng: number; radiusM?: number }
) {
  const { data, error } = await db.rpc("get_nearby_facilities", {
    p_lat: geo.lat,
    p_lng: geo.lng,
    p_radius_m: geo.radiusM ?? 5000,
  });
  if (error) throw error;
  return data ?? [];
}

/** Geo proximity search over branches (RPC: get_nearby_branches). */
export async function nearbyBranches(
  db: DB,
  geo: { lat: number; lng: number; radius: number }
) {
  const { data, error } = await db.rpc("get_nearby_branches", {
    lat: geo.lat,
    lng: geo.lng,
    radius: geo.radius,
  });
  if (error) throw error;
  return data ?? [];
}
