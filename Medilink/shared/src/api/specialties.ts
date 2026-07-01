// SPECIALTIES — curated specialty catalog (Design Doc p18) backing the Specialty Categories grid,
// Dashboard "Top Specialties" chips, and Filters specialty chips. Public read (RLS
// `specialties_public_read`); seeded via migration 20260701000002_specialties.sql.
import type { DB } from "./client";

export interface Specialty {
  id: string; // slug (stable key)
  name: string;
  icon: string | null; // app icon key (resolved by mobile resolveIconName)
}

export async function listSpecialties(db: DB): Promise<Specialty[]> {
  const { data, error } = await db
    .from("specialties")
    .select("slug, name, icon")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.slug, name: s.name, icon: s.icon }));
}
