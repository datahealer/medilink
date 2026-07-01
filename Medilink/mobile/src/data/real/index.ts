/**
 * REAL repositories — back the UI with the MediLink backend + Supabase
 * (`EXPO_PUBLIC_DATA_MODE=staging|production`). Privileged ops (auth, payments) go
 * to `@medilink/backend` over HTTPS via `apiFetch` (EXPO_PUBLIC_API_URL); RLS-safe
 * reads go directly to Supabase via the shared `@medilink/shared` `api.*` modules.
 * This is only the boundary the UI consumes.
 */
import { api } from "@medilink/shared/mobile";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/services/api";
import { env } from "@/config/env";
import { authService } from "@/services/authService";
import { asText } from "@/utils/text";
import type {
  AppointmentRepository,
  AuthRepository,
  DiscoveryRepository,
  DocumentRepository,
  DoctorRepository,
  FamilyRepository,
  MedicalHistoryRepository,
  NotificationRepository,
  PatientRepository,
  PaymentRepository,
  PrescriptionRepository,
  Repositories,
} from "../repositories";
import type {
  Appointment,
  BloodGroup,
  Clinic,
  Doctor,
  DocumentType,
  FamilyMember,
  FamilyRelation,
  Gender,
  MedicalHistory,
  NotificationItem,
  NotificationKind,
  NotificationPrefs,
  PatientDoc,
  PatientProfile,
  Payment,
  Prescription,
  SmokingStatus,
} from "../types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort message from an unknown throwable (Error | PostgrestError | string). */
function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean).map(String);
    return parts.length ? parts.join(" · ") : JSON.stringify(o);
  }
  return String(e);
}

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
    // Supabase-direct (consistent with every other real feature) — the previous
    // path went through the backend REST server (apiFetch + EXPO_PUBLIC_API_URL),
    // the only feature that did, so an unreachable/unset API host failed only
    // here. Upload to the same `account_image` bucket/path the web app uses,
    // then persist the public URL onto patient_profiles via the profile update.
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) throw authErr ?? new Error("Not authenticated");
    const ext =
      (asset.name?.split(".").pop() || asset.mimeType?.split("/").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    // The account_image bucket's storage policy casts the object's filename stem
    // to uuid and checks it against auth.uid(), so the filename MUST be the auth
    // user's UUID — a Date.now() timestamp here produced the runtime error
    // `invalid input syntax for type uuid: "1782453774429"`. upsert overwrites the
    // user's single avatar; cache-busting lives in a ?v= query param (not the path).
    const path = `patient-profiles/${auth.user.id}/${auth.user.id}.${ext}`;
    const body = await fetch(asset.uri).then((r) => r.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from("account_image")
      .upload(path, body, { contentType: asset.mimeType ?? "image/jpeg", upsert: true });
    if (uploadErr) throw uploadErr;
    const { data: pub } = supabase.storage.from("account_image").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    // Persist so the new avatar survives reload (Dashboard / Profile read this).
    await api.profile.updateMyProfile(supabase, { profile_photo_url: url });
    return { profile_photo_url: url };
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

interface ApptPaymentRow {
  amount: number | null;
  currency: string | null;
  status: string | null;
}

interface ApptRow {
  id: string;
  reference_number: string | null;
  doctor_id: string | null;
  slot_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  type: string | null;
  status: string | null;
  payment_status: string | null;
  reason_for_visit: string | null;
  notes: string | null;
  doctor: { full_name: string | null; specialty?: string | null; fees?: unknown } | null;
  facility: { name: string | null; address?: string | null } | null;
  family_member: { full_name: string | null } | null;
  payments?: ApptPaymentRow[] | null;
}

/** Consultation fee for this appointment's type from the doctor's fees JSONB. */
function feeForType(fees: unknown, type: string | null): number {
  if (fees && typeof fees === "object") {
    const f = fees as Record<string, unknown>;
    const v = (type === "online" ? f.online : f.in_person) ?? f.in_person ?? f.online;
    return typeof v === "number" ? v : Number(v) || 0;
  }
  return Number(fees) || 0;
}

function mapAppointment(r: ApptRow): Appointment {
  const pay = Array.isArray(r.payments) ? r.payments[0] : null;
  return {
    id: r.id,
    reference_number: r.reference_number ?? null,
    doctor_id: r.doctor_id ?? null,
    slot_date: r.slot_date ?? null,
    slot_start: r.slot_start ?? null,
    slot_end: r.slot_end ?? null,
    type: (r.type as Appointment["type"]) ?? null,
    status: r.status ?? null,
    payment_status: r.payment_status ?? null,
    reason_for_visit: r.reason_for_visit ?? null,
    notes: r.notes ?? null,
    fee_omr: r.doctor ? feeForType(r.doctor.fees, r.type) : null,
    doctor: r.doctor ? { full_name: r.doctor.full_name ?? null, specialty: r.doctor.specialty ?? null } : null,
    facility: r.facility ? { name: r.facility.name ?? null, address: r.facility.address ?? null } : null,
    for_family_member: r.family_member ? { full_name: r.family_member.full_name ?? null } : null,
    payment: pay ? { amount: pay.amount ?? null, currency: pay.currency ?? null, status: pay.status ?? null } : null,
  };
}

/** "14:30" / "14:30:00" → "2:30 PM" for display (raw start is kept for the RPC). */
function to12h(hhmm: string): string {
  const [hStr, mStr = "00"] = hhmm.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr.slice(0, 2)} ${ampm}`;
}

// ---- payments (read side) ---------------------------------------------------

interface PaymentRow {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  payment_method: string | null;
  gateway: string | null;
  gateway_ref: string | null;
  invoice_url: string | null;
  created_at: string | null;
  appointment: {
    id: string;
    patient_id: string | null;
    reference_number: string | null;
    slot_date: string | null;
    slot_start: string | null;
    type: string | null;
    doctor: { full_name: string | null; specialty?: string | null; fees?: unknown } | null;
    facility: { name: string | null; address?: string | null } | null;
  } | null;
}

function mapPayment(r: PaymentRow): Payment {
  const a = r.appointment;
  return {
    id: r.id,
    amount: r.amount ?? null,
    currency: r.currency ?? null,
    status: r.status ?? null,
    reference: r.gateway_ref ?? r.id ?? null,
    method: r.payment_method ?? r.gateway ?? null,
    invoiceUrl: r.invoice_url ?? null,
    createdAt: r.created_at ?? null,
    appointment: a
      ? {
          id: a.id,
          reference_number: a.reference_number ?? null,
          slot_date: a.slot_date ?? null,
          slot_start: a.slot_start ?? null,
          doctor: a.doctor ? { full_name: a.doctor.full_name ?? null, specialty: a.doctor.specialty ?? null } : null,
          facility: a.facility ? { name: a.facility.name ?? null } : null,
          fee_omr: a.doctor ? feeForType(a.doctor.fees, a.type) : null,
        }
      : null,
  };
}

const paymentRepo: PaymentRepository = {
  async list() {
    const rows = (await api.payments.listMyPayments(supabase)) as unknown as PaymentRow[];
    return rows.map(mapPayment);
  },
  async get(id) {
    const row = (await api.payments.getPayment(supabase, id)) as unknown as PaymentRow | null;
    return row ? mapPayment(row) : null;
  },
  async getByAppointment(appointmentId) {
    const row = (await api.payments.getPaymentByAppointment(supabase, appointmentId)) as unknown as PaymentRow | null;
    return row ? mapPayment(row) : null;
  },
  async createCheckout({ appointmentId, amount }) {
    // Privileged op: the Thawani secret lives server-side, so this goes through the
    // MediLink backend route (Bearer = the Supabase access token). Returns a hosted checkout URL.
    const res = await apiFetch<{ checkoutUrl?: string }>("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ appointment_id: appointmentId, amount }),
    });
    return { checkoutUrl: res?.checkoutUrl ?? null };
  },
  async verify(appointmentId) {
    // On return from Thawani, ask the backend to confirm against the Thawani session
    // (the webhook can't reach a local backend). Finalizes paid → confirmed server-side
    // and returns a service-role recap (RLS-independent) for the confirmation screen.
    const res = await apiFetch<{ status?: string; payment?: Payment | null }>("/api/payments/verify", {
      method: "POST",
      body: JSON.stringify({ appointment_id: appointmentId }),
    });
    return { status: res?.status ?? "pending", payment: res?.payment ?? null };
  },
};

const appointmentRepo: AppointmentRepository = {
  async listUpcoming() {
    const rows = (await api.appointments.listMyAppointments(supabase, "upcoming")) as unknown as ApptRow[];
    return rows.map(mapAppointment);
  },
  async list(tab) {
    const rows = (await api.appointments.listMyAppointments(supabase, tab)) as unknown as ApptRow[];
    return rows.map(mapAppointment);
  },
  async get(id) {
    const row = (await api.appointments.getAppointment(supabase, id)) as unknown as ApptRow | null;
    return row ? mapAppointment(row) : null;
  },
  async getSlots(params) {
    const slots = await api.appointments.getAvailableSlots(supabase, params);
    return slots
      .map((s) => ({
        start: typeof s.start === "string" ? s.start.slice(0, 5) : "",
        end: typeof s.end === "string" ? s.end.slice(0, 5) : undefined,
      }))
      .filter((s) => s.start !== "")
      .map((s) => ({ start: s.start, end: s.end, label: to12h(s.start) }));
  },
  async create(input) {
    // Boundary guard: the RPC's UUID columns reject any non-UUID id (e.g. a stale
    // mock "mock-100"). Drop a malformed family id rather than fail the booking.
    const fam = input.forFamilyMemberId ?? undefined;
    const forFamilyMemberId = fam && UUID_RE.test(fam) ? fam : undefined;
    if (__DEV__ && fam && !forFamilyMemberId) {
      console.warn("[booking] dropping non-UUID forFamilyMemberId", fam);
    }
    const payload = {
      doctorId: input.doctorId,
      facilityId: input.facilityId,
      slotDate: input.slotDate,
      slotStart: input.slotStart,
      type: input.type,
      forFamilyMemberId,
    };
    if (__DEV__) console.warn("[booking] book_appointment_atomic payload", payload);

    let res: unknown;
    try {
      res = await api.appointments.bookAppointment(supabase, payload);
    } catch (e) {
      // Transport / Postgres error (the RPC raised, or RLS/grant denied it).
      if (__DEV__) console.warn("[booking] RPC threw", e);
      throw new Error(errText(e));
    }
    if (__DEV__) console.warn("[booking] book_appointment_atomic result", res);

    // book_appointment_atomic does NOT throw on business failures — it returns
    // { success: false, error: <CODE|SQLERRM> }. Honour that and surface the code.
    const r = (res ?? {}) as Record<string, unknown>;
    if (r.success === false) throw new Error(String(r.error ?? "BOOKING_FAILED"));
    const id = String(r.appointment_id ?? r.id ?? "");
    if (!id) throw new Error("Booking did not return an appointment id");
    return { id, reference: (r.reference_number ?? r.reference ?? null) as string | null };
  },
  async cancel(id, reason) {
    let res: unknown;
    try {
      res = await api.appointments.cancelAppointment(supabase, id, { reason });
    } catch (e) {
      throw new Error(errText(e));
    }
    // cancel_appointment_safe returns { success: false, error } on business failures.
    const r = (res ?? {}) as Record<string, unknown>;
    if (r.success === false) throw new Error(String(r.error ?? "CANCEL_FAILED"));
  },
  async reschedule(id, slot) {
    let res: unknown;
    try {
      res = await api.appointments.rescheduleAppointment(supabase, id, {
        date: slot.date,
        start: slot.start,
        end: slot.end,
      });
    } catch (e) {
      throw new Error(errText(e));
    }
    const r = (res ?? {}) as Record<string, unknown>;
    if (r.success === false) throw new Error(String(r.error ?? "RESCHEDULE_FAILED"));
  },
  async checkIn(id) {
    // checkin_and_enqueue needs the patient's name/phone; pull them from the profile.
    const profile = await api.profile.getMyProfile(supabase);
    try {
      await api.appointments.checkInAppointment(supabase, {
        appointmentId: id,
        patientName: profile.account?.full_name ?? "",
        patientPhone: profile.account?.phone ?? "",
      });
    } catch (e) {
      throw new Error(errText(e));
    }
  },
};

// ---- discovery --------------------------------------------------------------
// Dashboard discovery. Featured clinics + recently-visited doctors are wired to
// the real backend; specialties has no backend list source yet (only a search
// filter) so it stays mock via the hybrid composition.

/** Loose shape of a row from api.facilities.listFacilities. */
interface FacilityRowLoose {
  id: string;
  name: string | null;
  type: string | null;
  address: unknown;
  rating: number | null;
  review_count: number | null;
  doctors?: { id: string }[] | null;
}

function mapFacilityToClinic(f: FacilityRowLoose): Clinic {
  return {
    id: f.id,
    name: f.name ?? "",
    area: asText(f.address) || "",
    category: f.type ?? undefined,
    doctors_count: Array.isArray(f.doctors) ? f.doctors.length : undefined,
    rating: f.rating ?? 0,
    featured: true,
  };
}

const RECENT_DOCTORS_LIMIT = 5;

const discoveryRepo: DiscoveryRepository = {
  async listSpecialties() {
    // No "list specialties" endpoint exists (only a search filter). Kept mock
    // via the hybrid composition until a real source is confirmed.
    return [];
  },
  async recentDoctors() {
    // Derived from the patient's past appointments (newest first) — there is no
    // dedicated "recently visited" endpoint. Hydrate up to N unique doctors so
    // the cards carry specialty / rating / fee.
    const past = (await api.appointments.listMyAppointments(supabase, "past")) as unknown as ApptRow[];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const a of past) {
      const id = (a.doctor as { id?: string } | null)?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      if (ids.length >= RECENT_DOCTORS_LIMIT) break;
    }
    const docs = await Promise.all(ids.map((id) => api.doctors.getDoctor(supabase, id)));
    return docs
      .map((d): Doctor | null =>
        d.doctor ? { ...mapDoctorRow(d.doctor as unknown as DoctorRowLoose), visited: true } : null
      )
      .filter((d): d is Doctor => d != null);
  },
  async featuredClinics() {
    const rows = (await api.facilities.listFacilities(supabase, { limit: 6 })) as unknown as FacilityRowLoose[];
    return rows.map(mapFacilityToClinic);
  },
};

// ---- doctors ----------------------------------------------------------------
// Search + details are wired to the real backend (api.doctors.*). The mapper is
// defensive: backend columns are nullable, and `facilities` may arrive as an
// object or a single-element array depending on the join. Reviews + map pins
// have no confirmed endpoint yet, so they stay mock via the hybrid composition.

/** Loose shape of a row from api.doctors.searchDoctors / getDoctor.doctor. */
interface DoctorRowLoose {
  id: string;
  full_name: string | null;
  specialty: string | null;
  years_experience: number | null;
  // doctors.fees is JSONB { in_person, online } (not a scalar).
  fees: unknown;
  avg_rating: number | null;
  profile_photo_url: string | null;
  facility_id: string | null;
  branch_id: string | null;
  status: string | null;
  facilities?: { name: string | null } | { name: string | null }[] | null;
  // detail-only (getDoctor selects doctors.*) — present best-effort:
  gender?: string | null;
  languages?: string[] | null;
  about?: string | null;
  bio?: string | null;
  review_count?: number | null;
  reviews_count?: number | null;
}

function facilityName(f: DoctorRowLoose["facilities"]): string {
  if (!f) return "";
  return Array.isArray(f) ? f[0]?.name ?? "" : f.name ?? "";
}

/** doctors.fees is JSONB `{ in_person, online }`; tolerate a scalar too. */
function feeOf(fees: unknown): number {
  if (typeof fees === "number") return fees;
  if (fees && typeof fees === "object") {
    const f = fees as Record<string, unknown>;
    const v = f.in_person ?? f.online;
    return typeof v === "number" ? v : Number(v) || 0;
  }
  return Number(fees) || 0;
}

function mapDoctorRow(r: DoctorRowLoose): Doctor {
  return {
    id: r.id,
    full_name: r.full_name ?? "",
    specialty: r.specialty ?? "",
    facility: facilityName(r.facilities),
    facility_id: r.facility_id ?? undefined,
    rating: r.avg_rating ?? 0,
    fee_omr: feeOf(r.fees),
    // `status === "available"` is the backend's live-now flag; null → unknown.
    available_today: r.status == null ? undefined : r.status === "available",
    experience_years: r.years_experience ?? undefined,
  };
}

function mapDoctorDetail(r: DoctorRowLoose): Doctor {
  return {
    ...mapDoctorRow(r),
    gender: (r.gender as Gender | null) ?? undefined,
    languages: Array.isArray(r.languages) ? r.languages : undefined,
    about: asText(r.about ?? r.bio ?? null) || undefined,
    reviews: r.review_count ?? r.reviews_count ?? undefined,
    // slots_today intentionally omitted: real availability comes from
    // api.appointments.getAvailableSlots(doctorId, date) when the slots batch
    // is wired. Until then the schedule screen falls back to DEFAULT_SLOTS.
  };
}

const doctorRepo: DoctorRepository = {
  async search(params = {}) {
    const rows = (await api.doctors.searchDoctors(supabase, {
      specialty: params.specialty,
      term: params.query,
    })) as unknown as DoctorRowLoose[];
    let list = rows.map(mapDoctorRow);
    // Filters the backend list query does not apply are honoured client-side.
    if (params.maxFee != null) list = list.filter((d) => d.fee_omr <= params.maxFee!);
    if (params.minRating != null) list = list.filter((d) => d.rating >= params.minRating!);
    if (params.availableToday) list = list.filter((d) => d.available_today);
    // `gender` has no column in the list select, so it cannot be filtered here;
    // `topRated` is already satisfied by the backend's avg_rating ordering.
    return list;
  },
  async get(id) {
    const { doctor } = await api.doctors.getDoctor(supabase, id);
    if (!doctor) return null;
    return mapDoctorDetail(doctor as unknown as DoctorRowLoose);
  },
  async reviews() {
    // No confirmed doctor-reviews endpoint yet — kept mock in hybrid mode.
    return { summary: { average: 0, total: 0, distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })) }, reviews: [] };
  },
  async mapClinics() {
    return [];
  },
};

// ---- notifications ----------------------------------------------------------
// List comes from in_app_notifications; preferences are the JSONB blob on
// profiles.notification_prefs (there is NO notification_preferences table). The
// blob carries channel flags (push/email/sms/whatsapp) at the top level; we
// nest the app's category flags under `categories` and preserve any other keys.
// Facility messages have no inbox endpoint yet and stay mock via the hybrid.

interface NotificationRowLoose {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

/** Backend `type` strings are mapped onto the UI's notification kinds. */
function mapNotificationKind(type: string | null): NotificationKind {
  const t = (type ?? "").toLowerCase();
  if (t.includes("appointment") || t.includes("reminder") || t.includes("booking") || t.includes("check")) return "appointment";
  if (t.includes("payment") || t.includes("invoice") || t.includes("refund")) return "payment";
  if (t.includes("lab") || t.includes("result")) return "lab";
  if (t.includes("prescription") || t.includes("medication")) return "prescription";
  if (t.includes("assistant") || t.includes("insight") || t.includes("ai")) return "assistant";
  return "facility";
}

/** Compact relative label (e.g. "3h", "2d") matching the design. */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return `${Math.floor(day / 7)}w`;
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function mapNotification(r: NotificationRowLoose): NotificationItem {
  return {
    id: r.id,
    kind: mapNotificationKind(r.type),
    title: r.title ?? "",
    body: r.body ?? "",
    time: relativeTime(r.created_at),
    group: isToday(r.created_at) ? "today" : "earlier",
    unread: !r.is_read,
  };
}

const PREF_DEFAULTS: NotificationPrefs = {
  appointmentReminders: true,
  paymentsInvoices: true,
  labResults: true,
  prescriptions: true,
  facilityUpdates: true,
  promotions: false,
  channels: { push: true, email: true, sms: false },
};

interface PrefsRowLoose {
  push: boolean | null;
  email: boolean | null;
  sms: boolean | null;
  categories?: Record<string, boolean> | null;
}

function mapPrefs(row: PrefsRowLoose | null): NotificationPrefs {
  const cats = (row?.categories ?? {}) as Record<string, boolean>;
  return {
    appointmentReminders: cats.appointmentReminders ?? PREF_DEFAULTS.appointmentReminders,
    paymentsInvoices: cats.paymentsInvoices ?? PREF_DEFAULTS.paymentsInvoices,
    labResults: cats.labResults ?? PREF_DEFAULTS.labResults,
    prescriptions: cats.prescriptions ?? PREF_DEFAULTS.prescriptions,
    facilityUpdates: cats.facilityUpdates ?? PREF_DEFAULTS.facilityUpdates,
    promotions: cats.promotions ?? PREF_DEFAULTS.promotions,
    channels: {
      push: row?.push ?? PREF_DEFAULTS.channels.push,
      email: row?.email ?? PREF_DEFAULTS.channels.email,
      sms: row?.sms ?? PREF_DEFAULTS.channels.sms,
    },
  };
}

const notificationRepo: NotificationRepository = {
  async list() {
    const rows = (await api.notifications.listNotifications(supabase, { limit: 50 })) as unknown as NotificationRowLoose[];
    return rows.map(mapNotification);
  },
  async facilityMessages() {
    // No facility-messages inbox endpoint yet — kept mock in hybrid mode.
    return [];
  },
  async getPreferences() {
    return mapPrefs((await api.notifications.getPreferences(supabase)) as unknown as PrefsRowLoose | null);
  },
  async updatePreferences(patch) {
    // Read the current JSONB so a single-field toggle never clobbers the rest of
    // the categories / channel flags (and we preserve unknown keys like whatsapp).
    const currentJson = ((await api.notifications.getPreferences(supabase)) ?? {}) as Record<string, unknown>;
    const current = mapPrefs(currentJson as unknown as PrefsRowLoose);
    const next: NotificationPrefs = {
      ...current,
      ...patch,
      channels: { ...current.channels, ...(patch.channels ?? {}) },
    };
    const merged = {
      ...currentJson,
      push: next.channels.push,
      email: next.channels.email,
      sms: next.channels.sms,
      categories: {
        appointmentReminders: next.appointmentReminders,
        paymentsInvoices: next.paymentsInvoices,
        labResults: next.labResults,
        prescriptions: next.prescriptions,
        facilityUpdates: next.facilityUpdates,
        promotions: next.promotions,
      },
    };
    const saved = await api.notifications.updatePreferences(
      supabase,
      merged as Parameters<typeof api.notifications.updatePreferences>[1]
    );
    return mapPrefs(saved as unknown as PrefsRowLoose);
  },
  async markAllRead() {
    await api.notifications.markAllRead(supabase);
  },
};

// ---- document vault (PDF p28-29) --------------------------------------------

interface DocRowLoose {
  id: string;
  name: string;
  type: DocumentType;
  file_url: string;
  file_type: string;
  file_size_bytes?: number | null;
  uploaded_at: string | null;
  appointment?: {
    slot_date: string | null;
    slot_start: string | null;
    doctor?: { full_name: string | null } | null;
  } | null;
}

function mapDoc(r: DocRowLoose): PatientDoc {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    file_url: r.file_url,
    file_type: r.file_type,
    size_bytes: r.file_size_bytes ?? null,
    uploaded_at: r.uploaded_at ?? null,
    linked_appointment: r.appointment
      ? {
          slot_date: r.appointment.slot_date ?? null,
          slot_start: r.appointment.slot_start ?? null,
          doctor: r.appointment.doctor ? { full_name: r.appointment.doctor.full_name ?? null } : null,
        }
      : null,
  };
}

const documentRepo: DocumentRepository = {
  async list() {
    const rows = (await api.records.listDocuments(supabase)) as unknown as DocRowLoose[];
    return rows.map(mapDoc);
  },
  async get(id) {
    // No single-document endpoint; the list is small and RLS-scoped, so filter it.
    const rows = (await api.records.listDocuments(supabase)) as unknown as DocRowLoose[];
    const r = rows.find((x) => x.id === id);
    return r ? mapDoc(r) : null;
  },
  async upload(input) {
    // Upload the local file to the `patient-docs` bucket, then record the row
    // (same fetch→arrayBuffer→storage.upload pattern as the profile photo).
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) throw authErr ?? new Error("Not authenticated");
    const ext =
      (input.asset.name?.split(".").pop() || input.asset.mimeType?.split("/").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${auth.user.id}/${Date.now()}.${ext}`;
    const body = await fetch(input.asset.uri).then((r) => r.arrayBuffer());
    const contentType = input.asset.mimeType ?? "image/jpeg";
    const { error: upErr } = await supabase.storage
      .from("patient-docs")
      .upload(path, body, { contentType, upsert: false });
    if (upErr) throw upErr;
    const row = (await api.records.addDocument(supabase, {
      name: input.name,
      type: input.type,
      file_url: path,
      file_type: contentType,
    })) as unknown as DocRowLoose;
    return mapDoc(row);
  },
  async remove(id) {
    await api.records.deleteDocument(supabase, id);
  },
  async signedUrl(filePath) {
    return api.records.getDocumentSignedUrl(supabase, filePath);
  },
};

// ---- prescriptions (PDF p30-31) ---------------------------------------------

interface RxRowLoose {
  id: string;
  medications: unknown;
  instructions: string | null;
  pdf_url: string | null;
  issued_at: string | null;
  doctors?: { full_name: string | null; specialty: string | null } | null;
  appointments?: { slot_date: string | null; type?: string | null } | null;
}

function mapPrescription(r: RxRowLoose): Prescription {
  const arr = Array.isArray(r.medications) ? r.medications : [];
  const medications = arr.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? ""),
      dosage: (o.dosage as string | undefined) ?? null,
      frequency: (o.frequency as string | undefined) ?? null,
      duration: (o.duration as string | undefined) ?? null,
      notes: (o.notes as string | undefined) ?? null,
    };
  });
  return {
    id: r.id,
    issued_at: r.issued_at ?? null,
    medications,
    instructions: r.instructions ?? null,
    pdf_url: r.pdf_url ?? null,
    doctor: r.doctors ? { full_name: r.doctors.full_name ?? null, specialty: r.doctors.specialty ?? null } : null,
    appointment: r.appointments ? { slot_date: r.appointments.slot_date ?? null, type: r.appointments.type ?? null } : null,
  };
}

const prescriptionRepo: PrescriptionRepository = {
  async list() {
    const rows = (await api.prescriptions.listPrescriptions(supabase)) as unknown as RxRowLoose[];
    return rows.map(mapPrescription);
  },
  async get(id) {
    const r = (await api.prescriptions.getPrescription(supabase, id)) as unknown as RxRowLoose | null;
    return r ? mapPrescription(r) : null;
  },
  async pdfUrl(id) {
    // Patients cannot generate the PDF (doctor-only route); this reads the already-generated one.
    const res = await apiFetch<{ signed_url?: string }>(`/api/prescriptions/${id}/download`);
    if (!res?.signed_url) throw new Error("PDF not available");
    return res.signed_url;
  },
  async shareLink(id) {
    const res = await apiFetch<{ url?: string; expires_at?: string }>(`/api/prescriptions/${id}/share-link`);
    const rel = res?.url ?? "";
    const baseUrl = (env.API_URL || "").replace(/[/]+$/, "");
    const url = !rel ? "" : rel.startsWith("http") ? rel : `${baseUrl}${rel.startsWith("/") ? "" : "/"}${rel}`;
    return { url, expiresAt: res?.expires_at ?? null };
  },
};

export const realRepositories: Repositories = {
  auth: authRepo,
  patient: patientRepo,
  medicalHistory: medicalHistoryRepo,
  family: familyRepo,
  appointment: appointmentRepo,
  payment: paymentRepo,
  discovery: discoveryRepo,
  doctor: doctorRepo,
  notification: notificationRepo,
  document: documentRepo,
  prescription: prescriptionRepo,
};
