import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@medilink/shared";

export type RegisterPayload = {
  email?: string; // ✅ optional in UI
  password: string;
  full_name: string;
  phone?: string;
  role?: "patient" | "doctor" | "technician" | "facility_admin" | "super_admin";
};

export type LoginPayload = {
  email: string;
  password: string;
};

// ✅ FIXED REGISTER FUNCTION
export async function registerWithEmail({
  email,
  password,
  full_name,
  phone,
  role = "patient",
}: RegisterPayload) {
  const supabase = await createServerSupabaseClient();

  // ❗ Supabase requires email for password signup
  if (!email) {
    return {
      user: null,
      error: { message: "Email is required for signup" },
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: full_name || "User", // ✅ always safe
        phone: phone || null,
        role,
      },
    },
  });

  if (error) {
    return { error };
  }

  return { user: data.user };
}

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

// ✅ OTP SEND (DB-based)
export async function sendOtpToPhone(userId: string, phone: string) {
  const supabase = await createServerSupabaseClient();

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  const { error } = await supabase.from("otp_records").insert([
    {
      user_id: userId,
      hash: code,
      expires_at: expiresAt,
      attempts: 0,
    },
  ]);

  return { code, error };
}

// ✅ OTP VERIFY
export async function verifyOtpCode(userId: string, code: string) {
  const supabase = await createServerSupabaseClient();

  const { data: record, error } = await supabase
    .from("otp_records")
    .select("id, hash, expires_at, attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(); // ✅ safer than .single()

  if (error || !record) {
    return { error: new Error("OTP not found") };
  }

  if (record.attempts >= 5) {
    return { error: new Error("Too many attempts") };
  }

  if (record.expires_at < new Date().toISOString()) {
    return { error: new Error("OTP expired") };
  }

  if (record.hash !== code) {
    await supabase
      .from("otp_records")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    return { error: new Error("Invalid OTP code") };
  }

  return { success: true };
}

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