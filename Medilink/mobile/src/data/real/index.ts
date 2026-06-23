/**
 * REAL repositories — back the UI with HAMS + Supabase
 * (`EXPO_PUBLIC_DATA_MODE=staging|production`). Each method wraps the existing,
 * untouched transport (`@medilink/shared` `api.*`, `authService`, `apiFetch`) and
 * maps backend rows → domain models. The backend foundation is preserved; this is
 * only the boundary the UI consumes.
 */
import { api } from "@medilink/shared/mobile";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/services/api";
import { authService } from "@/services/authService";
import { asText } from "@/utils/text";
import type {
  AppointmentRepository,
  AuthRepository,
  DiscoveryRepository,
  DoctorRepository,
  FamilyRepository,
  MedicalHistoryRepository,
  NotificationRepository,
  PatientRepository,
  Repositories,
} from "../repositories";
import type {
  Appointment,
  BloodGroup,
  FamilyMember,
  FamilyRelation,
  Gender,
  MedicalHistory,
  PatientProfile,
  SmokingStatus,
} from "../types";

// ---- auth -------------------------------------------------------------------

const authRepo: AuthRepository = {
  signIn: (input) => authService.signIn(input),
  signUp: (input) => authService.signUp(input),
  sendOtp: (phone) => authService.sendOtp(phone),
  verifyOtp: (code, phone) => authService.verifyOtp(code, phone),
  requestPasswordReset: (id) => authService.requestPasswordReset(id),
  resetPassword: (pw) => authService.resetPassword(pw),
  googleSignIn: () => authService.googleSignIn(),
  signOut: () => authService.signOut(),
  async restoreSession() {
    const session = await api.auth.getSession(supabase);
    return session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
  },
  subscribe(onChange) {
    return api.auth.onAuthStateChange(supabase, (session) =>
      onChange(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
    );
  },
};

// ---- patient ----------------------------------------------------------------

function toDomainProfile(p: Awaited<ReturnType<typeof api.profile.getMyProfile>>): PatientProfile {
  return {
    account: p.account
      ? { id: p.account.id, full_name: p.account.full_name ?? null, phone: p.account.phone ?? null, email: null }
      : null,
    patient: p.patient
      ? {
          id: p.patient.id,
          date_of_birth: p.patient.date_of_birth ?? null,
          gender: (p.patient.gender as Gender) ?? null,
          blood_group: (p.patient.blood_group as BloodGroup) ?? "unknown",
          address: asText(p.patient.address) || null,
          emergency_contact: asText(p.patient.emergency_contact) || null,
          profile_photo_url: p.patient.profile_photo_url ?? null,
        }
      : null,
  };
}

const patientRepo: PatientRepository = {
  async getProfile() {
    return toDomainProfile(await api.profile.getMyProfile(supabase));
  },
  async updateProfile(patch) {
    return toDomainProfile(await api.profile.updateMyProfile(supabase, patch));
  },
  async uploadProfilePhoto(asset) {
    const form = new FormData();
    form.append("file", {
      uri: asset.uri,
      name: asset.name ?? "profile.jpg",
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    const res = await apiFetch<{ success: boolean; data?: { profile_photo_url: string } }>(
      "/api/patients/me/profile-photo",
      { method: "POST", body: form }
    );
    return { profile_photo_url: res.data?.profile_photo_url ?? asset.uri };
  },
};

// ---- medical history --------------------------------------------------------

const medicalHistoryRepo: MedicalHistoryRepository = {
  async get() {
    const h = await api.records.getMedicalHistory(supabase);
    if (!h) return null;
    return {
      allergies: h.allergies ?? [],
      conditions: h.conditions ?? [],
      medications: h.medications ?? [],
      surgeries: h.surgeries ?? [],
      smoking_status: (h.smoking_status as SmokingStatus) ?? "unknown",
      notes: h.notes ?? null,
    } satisfies MedicalHistory;
  },
  async upsert(patch) {
    const h = await api.records.upsertMedicalHistory(supabase, patch);
    return {
      allergies: h.allergies ?? [],
      conditions: h.conditions ?? [],
      medications: h.medications ?? [],
      surgeries: h.surgeries ?? [],
      smoking_status: (h.smoking_status as SmokingStatus) ?? "unknown",
      notes: h.notes ?? null,
    } satisfies MedicalHistory;
  },
};

// ---- family -----------------------------------------------------------------

function toDomainMember(m: Awaited<ReturnType<typeof api.family.listFamily>>[number]): FamilyMember {
  return {
    id: m.id,
    full_name: m.full_name,
    relation: m.relation as FamilyRelation,
    date_of_birth: m.date_of_birth ?? null,
    gender: (m.gender as Gender) ?? null,
  };
}

const familyRepo: FamilyRepository = {
  async list() {
    return (await api.family.listFamily(supabase)).map(toDomainMember);
  },
  async add(member) {
    return toDomainMember(await api.family.addFamilyMember(supabase, member));
  },
  async update(id, patch) {
    return toDomainMember(await api.family.updateFamilyMember(supabase, id, patch));
  },
  async remove(id) {
    await api.family.deleteFamilyMember(supabase, id);
  },
};

// ---- appointments -----------------------------------------------------------

interface ApptRow {
  id: string;
  slot_date: string | null;
  slot_start: string | null;
  status: string | null;
  doctor: { full_name: string | null } | null;
  facility: { name: string | null } | null;
}

const appointmentRepo: AppointmentRepository = {
  async listUpcoming() {
    const rows = (await api.appointments.listMyAppointments(supabase, "upcoming")) as unknown as ApptRow[];
    return rows.map(
      (r): Appointment => ({
        id: r.id,
        slot_date: r.slot_date ?? null,
        slot_start: r.slot_start ?? null,
        doctor: r.doctor ? { full_name: r.doctor.full_name ?? null } : null,
        facility: r.facility ? { name: r.facility.name ?? null } : null,
        status: r.status ?? null,
      })
    );
  },
};

// ---- discovery --------------------------------------------------------------
// Doctor discovery is Batch-2 work; the real HAMS endpoints are not wired yet.
// We return empty results rather than fake data (never fabricate clinical content).
const discoveryRepo: DiscoveryRepository = {
  async listSpecialties() {
    return [];
  },
  async recentDoctors() {
    return [];
  },
  async featuredClinics() {
    return [];
  },
};

// Doctor discovery + notifications: HAMS endpoints land when these modules are
// wired to the backend. Until then return empty results / safe defaults — never
// fabricate clinical content.
const doctorRepo: DoctorRepository = {
  async search() {
    return [];
  },
  async get() {
    return null;
  },
  async reviews() {
    return { summary: { average: 0, total: 0, distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })) }, reviews: [] };
  },
  async mapClinics() {
    return [];
  },
};

const notificationRepo: NotificationRepository = {
  async list() {
    return [];
  },
  async facilityMessages() {
    return [];
  },
  async getPreferences() {
    return {
      appointmentReminders: true,
      paymentsInvoices: true,
      labResults: true,
      prescriptions: true,
      facilityUpdates: true,
      promotions: false,
      channels: { push: true, email: true, sms: false },
    };
  },
  async updatePreferences(patch) {
    const base = {
      appointmentReminders: true,
      paymentsInvoices: true,
      labResults: true,
      prescriptions: true,
      facilityUpdates: true,
      promotions: false,
    };
    return {
      ...base,
      ...patch,
      channels: { push: true, email: true, sms: false, ...(patch.channels ?? {}) },
    };
  },
};

export const realRepositories: Repositories = {
  auth: authRepo,
  patient: patientRepo,
  medicalHistory: medicalHistoryRepo,
  family: familyRepo,
  appointment: appointmentRepo,
  discovery: discoveryRepo,
  doctor: doctorRepo,
  notification: notificationRepo,
};
