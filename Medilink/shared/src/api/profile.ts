// PROFILE — RE-HOMED from HAMS `patients/me` + `me` routes → direct Supabase (RLS).
// The patient identity spans two tables: `profiles` (account: name/phone/role) and
// `patient_profiles` (clinical: dob/gender/blood group/address/emergency contact).
import {
  detectPhoneCountry,
  normalizeHumanText,
  normalizeOptionalText,
  omanPhoneE164,
  phoneLocal,
} from "../utils/normalize";
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
  // Phone is canonicalised to E.164 (+968XXXXXXXX) — the format signup already writes and
  // the one the backend's OpenAPI schema and send-otp route document. See the Oman phone
  // block in utils/normalize.ts for why this column had three competing formats.
  //
  // Deliberately NOT canonicalise-or-null: an unrecognised value falls back to plain text
  // normalization instead of being discarded. Web's profile form has no phone validation
  // yet, and silently nulling a field a user typed into would be worse than storing it
  // verbatim. Recognisable numbers become consistent; nothing else is destroyed.
  //
  // COUNTRY-AWARE (QA G2). This used to be `omanPhoneE164(...)` unconditionally, so a value
  // that was already a valid non-Oman E.164 — e.g. `+919876543210` from the mobile client —
  // failed the Oman conversion and fell through to plain-text normalization. Now a recognised
  // E.164 for ANY supported country is passed through verbatim, and only a bare local number
  // is canonicalised as Oman (which is what web's unvalidated form still sends).
  if (patch.phone !== undefined) {
    const already = detectPhoneCountry(patch.phone);
    accountPatch.phone = already
      ? `+${already.cc}${phoneLocal(patch.phone, already)}`
      : (omanPhoneE164(patch.phone) ?? normalizeOptionalText(patch.phone));

    /**
     * WRITING A PHONE NUMBER ALWAYS UNVERIFIES IT.
     *
     * `profiles.phone_verified` attests that an SMS code was delivered to a specific
     * handset and entered back. That attestation belongs to a NUMBER, not to an account, so
     * the moment the number changes the old attestation is meaningless — and leaving it set
     * is worse than merely untidy: a clinic reading `phone_verified = true` would believe a
     * number nobody has ever confirmed, and phone OTP login would treat it as a credential.
     *
     * This lives HERE, at the single write path shared by web and mobile, rather than in
     * either screen. A screen can forget; this cannot — if `phone` is in the patch,
     * `phone_verified: false` is in the same UPDATE, atomically. That mirrors the G2
     * guarantee on the other side: an UNTOUCHED number is structurally unwritable, so
     * merely opening Edit Profile and saving other fields never reaches this branch and
     * never clears verification.
     *
     * ── ONLY EVER `false` FROM A CLIENT ──
     *
     * The one place `phone_verified` becomes `true` is `POST /api/auth/phone/check`, under
     * the service role, after Twilio Verify returns `approved`. That route does not go
     * through `updateMyProfile`, so there is no conflict and no ordering hazard. Nothing in
     * shared/ or mobile/ ever writes `true`.
     */
    accountPatch.phone_verified = false;
  }

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
