import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@medilink/shared";

export type LoginPayload = {
  email: string;
  password: string;
};

// NOTE: A legacy `registerWithEmail()` (client-side supabase.auth.signUp) was removed here.
// It was unused and, with email confirmations enabled, produced the verification-link flow.
// Patient signup is owned by POST /api/auth/signup (service-role admin.createUser), and the
// web email-OTP confirmation is handled by the /(auth)/sign-up + /(auth)/otp pages.

// ✅ LOGIN (no change needed)
export async function loginWithEmail({ email, password }: LoginPayload) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error };
  }

  return { user: data.user, session: data.session };
}

// // ✅ SOCIAL LOGIN
// export async function signInWithProvider(provider: "google" | "apple") {
//   const supabase = await createServerSupabaseClient();

//   return supabase.auth.signInWithOAuth({
//     provider,
//     options: {
//       redirectTo: `${
//         process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
//       }/auth/callback`,
//     },
//   });
// }

// Custom DB-based OTP (sendOtpToPhone / verifyOtpCode against otp_records) was removed:
// authentication now uses official Supabase Email OTP (see shared/src/api/auth.ts and
// mobile/src/services/authService.ts). These helpers were never imported anywhere. The
// otp_records table is kept in the schema for history/GDPR purge but is no longer written.

// ✅ PROFILE (safe)
export async function createPatientProfile(
  userId: string,
  payload: Record<string, unknown>
) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("patient_profiles").upsert({
    user_id: userId,
    ...payload,
  });

  return { data, error };
}

// ✅ FAMILY
export async function addFamilyMember(
  patientId: string,
  familyMember: {
    full_name: string;
    relation: Database["public"]["Enums"]["family_relation"];
    date_of_birth?: string;
    gender?: Database["public"]["Enums"]["gender_type"] | null;
  }
) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.from("family_members").insert([
    {
      patient_id: patientId,
      ...familyMember,
    },
  ]);

  return { data, error };
}

// ✅ APPOINTMENTS
export async function fetchPatientAppointments(userId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false });

  return { data, error };
}

// ✅ 2FA
export async function create2FAEnrollment() {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.mfa.enroll({ factorType: "totp" });
}

export async function create2FAChallenge(factorId: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.mfa.challenge({ factorId });
}

export async function verify2FA(
  factorId: string,
  challengeId: string,
  code: string
) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.mfa.verify({ factorId, challengeId, code });
}