// PROFILE — RE-HOMED from HAMS `patients/me` + `me` routes → direct Supabase (RLS).
// The patient identity spans two tables: `profiles` (account: name/phone/role) and
// `patient_profiles` (clinical: dob/gender/blood group/address/emergency contact).
import type { DB, Row, Update } from "./client";
import { getCurrentUserId } from "./client";

export interface MyProfile {
  account: Row<"profiles"> | null;
  patient: Row<"patient_profiles"> | null;
}

/** Read both halves of the current user's profile. */
export async function getMyProfile(db: DB): Promise<MyProfile> {
  const userId = await getCurrentUserId(db);

  const [{ data: account, error: accErr }, { data: patient, error: patErr }] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", userId).maybeSingle(),
      db.from("patient_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

  if (accErr) throw accErr;
  if (patErr) throw patErr;
  return { account, patient };
}

export interface ProfilePatch {
  // → profiles
  full_name?: string;
  phone?: string;
  // → patient_profiles
  date_of_birth?: Update<"patient_profiles">["date_of_birth"];
  gender?: Update<"patient_profiles">["gender"];
  blood_group?: Update<"patient_profiles">["blood_group"];
  address?: Update<"patient_profiles">["address"];
  emergency_contact?: Update<"patient_profiles">["emergency_contact"];
  profile_photo_url?: Update<"patient_profiles">["profile_photo_url"];
}

/** Update either/both halves; only provided fields are written. */
export async function updateMyProfile(db: DB, patch: ProfilePatch): Promise<MyProfile> {
  const userId = await getCurrentUserId(db);

  const accountPatch: Update<"profiles"> = {};
  if (patch.full_name !== undefined) accountPatch.full_name = patch.full_name;
  if (patch.phone !== undefined) accountPatch.phone = patch.phone;

  const patientPatch: Update<"patient_profiles"> = {};
  if (patch.date_of_birth !== undefined) patientPatch.date_of_birth = patch.date_of_birth;
  if (patch.gender !== undefined) patientPatch.gender = patch.gender;
  if (patch.blood_group !== undefined) patientPatch.blood_group = patch.blood_group;
  if (patch.address !== undefined) patientPatch.address = patch.address;
  if (patch.emergency_contact !== undefined)
    patientPatch.emergency_contact = patch.emergency_contact;
  if (patch.profile_photo_url !== undefined)
    patientPatch.profile_photo_url = patch.profile_photo_url;

  if (Object.keys(accountPatch).length > 0) {
    const { error } = await db.from("profiles").update(accountPatch).eq("id", userId);
    if (error) throw error;
  }
  if (Object.keys(patientPatch).length > 0) {
    const { error } = await db
      .from("patient_profiles")
      .update(patientPatch)
      .eq("user_id", userId);
    if (error) throw error;
  }

  return getMyProfile(db);
}
