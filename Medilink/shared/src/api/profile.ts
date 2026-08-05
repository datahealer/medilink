// PROFILE — RE-HOMED from HAMS `patients/me` + `me` routes → direct Supabase (RLS).
// The patient identity spans two tables: `profiles` (account: name/phone/role) and
// `patient_profiles` (clinical: dob/gender/blood group/address/emergency contact).
import { normalizeHumanText, normalizeOptionalText } from "../utils/normalize";
import type { DB, Json, Row, Update } from "./client";
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

/**
 * `patient_profiles.address` and `.emergency_contact` are JSONB, not text. MediLink writes
 * plain strings into them, but HAMS can store a structured object, so normalize ONLY the
 * string case and pass anything else through untouched — running a text normalizer over an
 * object would destroy a structured address.
 */
function normalizeJsonText(value: Json): Json {
  if (typeof value !== "string") return value;
  return normalizeOptionalText(value);
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
  civil_number?: Update<"patient_profiles">["civil_number"];
}

/** Update either/both halves; only provided fields are written. */
export async function updateMyProfile(db: DB, patch: ProfilePatch): Promise<MyProfile> {
  const userId = await getCurrentUserId(db);

  // Normalized HERE, not only in the callers' forms: this is the single write path for
  // both web and mobile, so padded text cannot reach `profiles`/`patient_profiles` even
  // from a caller that forgot to trim. See utils/normalize.ts.
  const accountPatch: Update<"profiles"> = {};
  if (patch.full_name !== undefined) accountPatch.full_name = normalizeHumanText(patch.full_name);
  if (patch.phone !== undefined) accountPatch.phone = normalizeOptionalText(patch.phone);

  const patientPatch: Update<"patient_profiles"> = {};
  if (patch.date_of_birth !== undefined) patientPatch.date_of_birth = patch.date_of_birth;
  if (patch.gender !== undefined) patientPatch.gender = patch.gender;
  if (patch.blood_group !== undefined) patientPatch.blood_group = patch.blood_group;
  if (patch.address !== undefined) patientPatch.address = normalizeJsonText(patch.address);
  if (patch.emergency_contact !== undefined)
    patientPatch.emergency_contact = normalizeJsonText(patch.emergency_contact);
  // A URL, not prose — trim only; collapsing internal runs would corrupt a signed URL.
  if (patch.profile_photo_url !== undefined)
    patientPatch.profile_photo_url = patch.profile_photo_url?.trim() || null;
  if (patch.civil_number !== undefined) patientPatch.civil_number = normalizeOptionalText(patch.civil_number);

  // A required name must not be blanked by a padded-empty value. Rejecting is safer than
  // silently dropping the key: the caller asked to set a name and would otherwise be told
  // it succeeded while the old value stayed.
  if (patch.full_name !== undefined && accountPatch.full_name === "") {
    throw new Error("Full name cannot be empty.");
  }

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
