// FAMILY — RE-HOMED from HAMS `patients/me/family[/[id]]` → direct Supabase (RLS).
// Keyed on patient_profiles.id; ownership is enforced by RLS + explicit patient_id filters.
import { normalizeHumanText } from "../utils/normalize";
import type { DB, Enums, Row } from "./client";
import { getMyPatientProfileId } from "./client";

export type FamilyMember = Row<"family_members">;

/**
 * A family member's name is required and appears on appointments and clinic records, so a
 * whitespace-only value is rejected at the write boundary rather than stored as padding.
 * Matches the 2-character floor the sign-up and family forms already enforce.
 */
function requireName(input: string): string {
  const value = normalizeHumanText(input);
  if (value.length < 2) {
    throw new Error("Full name must be at least 2 characters.");
  }
  return value;
}

export interface NewFamilyMember {
  full_name: string;
  relation: Enums["family_relation"];
  date_of_birth?: string | null;
  gender?: Enums["gender_type"] | null;
}

export async function listFamily(db: DB): Promise<FamilyMember[]> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("family_members")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addFamilyMember(
  db: DB,
  member: NewFamilyMember
): Promise<FamilyMember> {
  const patientId = await getMyPatientProfileId(db);
  const { data, error } = await db
    .from("family_members")
    .insert({
      patient_id: patientId,
      full_name: requireName(member.full_name),
      relation: member.relation,
      date_of_birth: member.date_of_birth ?? null,
      gender: member.gender ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFamilyMember(
  db: DB,
  id: string,
  patch: Partial<NewFamilyMember>
): Promise<FamilyMember> {
  const patientId = await getMyPatientProfileId(db);
  // Normalize the name if this patch touches it; leave every other key untouched so a
  // partial update stays partial.
  const safePatch: Partial<NewFamilyMember> =
    patch.full_name !== undefined ? { ...patch, full_name: requireName(patch.full_name) } : patch;
  const { data, error } = await db
    .from("family_members")
    .update(safePatch)
    .eq("id", id)
    .eq("patient_id", patientId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFamilyMember(db: DB, id: string): Promise<void> {
  const patientId = await getMyPatientProfileId(db);
  const { error } = await db
    .from("family_members")
    .delete()
    .eq("id", id)
    .eq("patient_id", patientId);
  if (error) throw error;
}
