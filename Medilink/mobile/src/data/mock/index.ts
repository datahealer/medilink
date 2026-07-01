/**
 * MOCK repositories — typed in-memory data for UI-first development
 * (`EXPO_PUBLIC_DATA_MODE=mock`). No network, no Supabase. Seed content mirrors the
 * design PDF (Aisha Al Harthy + family) so screens render exactly like the spec.
 *
 * State is module-scoped so add/edit/remove persist within a session. A small
 * latency makes the real loading states visible.
 */
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
  Repositories,
} from "../repositories";
import type {
  Appointment,
  Clinic,
  Doctor,
  DoctorReviews,
  DoctorSearchParams,
  FacilityMessage,
  FamilyMember,
  MedicalHistory,
  NewDocumentUpload,
  NewFamilyMember,
  NotificationItem,
  NotificationPrefs,
  PatientDoc,
  PatientProfile,
  Payment,
  ProfilePatch,
  Review,
  SessionUser,
  Specialty,
} from "../types";

const delay = <T>(value: T, ms = 450): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

let uid = 100;
const nextId = () => `mock-${uid++}`;

// ---- seed state (from the design documentation) -----------------------------

const MOCK_USER: SessionUser = { id: "mock-user-1", email: "aisha@medilink.om" };

let profile: PatientProfile = {
  account: { id: "mock-user-1", full_name: "Aisha Al Harthy", phone: "+968 9000 0000", email: "aisha@medilink.om" },
  patient: {
    id: "mock-patient-1",
    date_of_birth: "1994-03-12",
    gender: "female",
    blood_group: "O+",
    address: "Muscat",
    emergency_contact: "Salim · +968 9111 1111",
    profile_photo_url: null,
  },
};

let history: MedicalHistory = {
  allergies: ["Penicillin", "Pollen"],
  conditions: ["Asthma (mild)"],
  medications: [],
  surgeries: [],
  smoking_status: "never",
  notes: null,
};

let family: FamilyMember[] = [
  { id: "mock-fam-1", full_name: "Salim Al Harthy", relation: "spouse", date_of_birth: "1989-05-02", gender: "male" },
  { id: "mock-fam-2", full_name: "Lina Al Harthy", relation: "child", date_of_birth: "2019-09-14", gender: "female" },
  { id: "mock-fam-3", full_name: "Maryam Al Harthy", relation: "parent", date_of_birth: "1964-01-20", gender: "female" },
];

const appointments: Appointment[] = [
  {
    id: "mock-appt-1",
    reference_number: "ML-3F2A9C01",
    doctor_id: "doc-khalid",
    slot_date: "Wed 18 Jun",
    slot_start: "10:30 AM",
    type: "in_person",
    doctor: { full_name: "Dr. Khalid Al Balushi", specialty: "Cardiology" },
    facility: { name: "Royal Hospital · General Care", address: "Al Ghubrah, Muscat" },
    status: "confirmed",
    payment_status: "paid",
    reason_for_visit: "Follow-up consultation",
    fee_omr: 12,
  },
  {
    id: "mock-appt-2",
    reference_number: "ML-7B1D4E22",
    doctor_id: "doc-said",
    slot_date: "Mon 2 Jun",
    slot_start: "4:00 PM",
    type: "in_person",
    doctor: { full_name: "Dr. Said Al Hinai", specialty: "Dermatology" },
    facility: { name: "Aster Clinic · Dermatology", address: "Al Khuwair, Muscat" },
    status: "completed",
    payment_status: "paid",
    reason_for_visit: "Skin check",
    fee_omr: 15,
  },
];

/** Statuses considered "upcoming" (vs past) for the mock tab split. */
const UPCOMING_STATUSES = ["pending", "confirmed", "checked_in"];

// ---- discovery (dashboard recents/featured; mirrors PDF p14) ----------------

const specialties: Specialty[] = [
  { id: "general", name: "General", icon: "medkit-outline" },
  { id: "pathology", name: "Pathology", icon: "flask-outline" },
  { id: "radiology", name: "Radiology", icon: "scan-outline" },
  { id: "cardiology", name: "Cardiology", icon: "heart-outline" },
  { id: "dermatology", name: "Dermatology", icon: "sparkles-outline" },
  { id: "pediatrics", name: "Pediatrics", icon: "people-outline" },
  { id: "physio", name: "Physio", icon: "fitness-outline" },
  { id: "skincare", name: "Skincare", icon: "rose-outline" },
  { id: "dentist", name: "Dentist", icon: "happy-outline" },
];

// Full doctor catalogue (drives search, details, recents). Mirrors PDF p17/p19.
const allDoctors: Doctor[] = [
  {
    id: "doc-khalid",
    full_name: "Dr. Khalid Al Balushi",
    specialty: "Cardiologist",
    facility: "Royal Hospital",
    rating: 4.9,
    reviews: 320,
    fee_omr: 25,
    distance_km: 2.1,
    available_today: true,
    visited: true,
    gender: "male",
    experience_years: 12,
    languages: ["Arabic", "English", "Hindi"],
    about:
      "Senior interventional cardiologist focused on preventive care, diagnostics and patient-centred treatment plans.",
    slots_today: ["10:00 AM", "10:30 AM", "11:30 AM", "12:00 PM", "4:30 PM", "5:00 PM"],
  },
  {
    id: "doc-fatma",
    full_name: "Dr. Fatma Said",
    specialty: "Cardiologist",
    facility: "Aster Clinic",
    rating: 4.7,
    reviews: 168,
    fee_omr: 22,
    distance_km: 3.4,
    available_today: true,
    gender: "female",
    experience_years: 9,
    languages: ["Arabic", "English"],
    about: "Cardiologist with a focus on women's heart health and preventive screening.",
    slots_today: ["9:00 AM", "12:00 PM", "2:30 PM", "4:00 PM", "5:30 PM"],
  },
  {
    id: "doc-sara",
    full_name: "Dr. Sara Nasser",
    specialty: "Dermatologist",
    facility: "DermaCare",
    rating: 4.8,
    reviews: 210,
    fee_omr: 20,
    distance_km: 1.6,
    available_today: true,
    visited: true,
    gender: "female",
    experience_years: 8,
    languages: ["Arabic", "English"],
    about: "Dermatologist specialising in skin health, acne and cosmetic dermatology.",
    slots_today: ["9:30 AM", "11:00 AM", "1:00 PM", "3:30 PM", "4:30 PM"],
  },
  {
    id: "doc-yusuf",
    full_name: "Dr. Yusuf Al Lawati",
    specialty: "Dentist",
    facility: "Smile Studio",
    rating: 4.6,
    reviews: 95,
    fee_omr: 18,
    distance_km: 4.2,
    available_today: false,
    gender: "male",
    experience_years: 11,
    languages: ["Arabic", "English"],
    about: "General and cosmetic dentistry with a gentle, patient-first approach.",
    slots_today: ["11:00 AM", "1:30 PM", "3:00 PM"],
  },
  {
    id: "doc-noura",
    full_name: "Dr. Noura Al Habsi",
    specialty: "Pediatrics",
    facility: "Aster Clinic",
    rating: 4.9,
    reviews: 142,
    fee_omr: 21,
    distance_km: 2.9,
    available_today: true,
    gender: "female",
    experience_years: 10,
    languages: ["Arabic", "English"],
    about: "Paediatrician caring for newborns through adolescents, with a focus on development.",
    slots_today: ["10:15 AM", "12:45 PM", "2:15 PM", "5:00 PM"],
  },
];

const reviewsByDoctor: Record<string, Review[]> = {
  "doc-khalid": [
    { id: "rv-1", author: "Salim M.", rating: 5, comment: "Very thorough and reassuring.", date: "2 May", verified: true },
    { id: "rv-2", author: "Noura A.", rating: 5, comment: "Short wait, clear explanations.", date: "28 Apr", verified: true },
    { id: "rv-3", author: "Yusuf K.", rating: 4, comment: "Good doctor, clinic a bit busy.", date: "20 Apr" },
  ],
};

const mapClinics: Clinic[] = [
  { id: "clinic-royal", name: "Royal Hospital — Ghubra", area: "Ghubra", rating: 4.9, distance_km: 2.1, open_now: true },
  { id: "clinic-aster", name: "Aster Clinic — Al Khuwair", area: "Al Khuwair", category: "Multi-speciality", rating: 4.7, distance_km: 0.8, open_now: true, doctors_count: 24, featured: true },
  { id: "clinic-nmc", name: "NMC — Azaiba", area: "Azaiba", rating: 4.6, distance_km: 3.0, open_now: false },
];

const featuredClinics: Clinic[] = mapClinics.filter((c) => c.featured);

const discoveryRepo: DiscoveryRepository = {
  async listSpecialties() {
    return delay(specialties.map((s) => ({ ...s })));
  },
  async recentDoctors() {
    return delay(allDoctors.filter((d) => d.visited).map((d) => ({ ...d })), 350);
  },
  async featuredClinics() {
    return delay(featuredClinics.map((c) => ({ ...c })), 350);
  },
};

const doctorRepo: DoctorRepository = {
  async search(params: DoctorSearchParams = {}) {
    const q = (params.query ?? "").trim().toLowerCase();
    const filtered = allDoctors.filter((d) => {
      if (q && !`${d.full_name} ${d.specialty} ${d.facility}`.toLowerCase().includes(q)) return false;
      if (params.specialty && d.specialty.toLowerCase() !== params.specialty.toLowerCase()) return false;
      if (params.gender && params.gender !== "any" && d.gender !== params.gender) return false;
      if (params.maxFee != null && d.fee_omr > params.maxFee) return false;
      if (params.minRating != null && d.rating < params.minRating) return false;
      if (params.availableToday && !d.available_today) return false;
      return true;
    });
    if (params.topRated) filtered.sort((a, b) => b.rating - a.rating);
    return delay(filtered.map((d) => ({ ...d })), 400);
  },
  async get(id) {
    const found = allDoctors.find((d) => d.id === id) ?? null;
    return delay(found ? { ...found } : null, 300);
  },
  async reviews(id) {
    const list = reviewsByDoctor[id] ?? [];
    const total = list.length;
    const average = total ? Math.round((list.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10 : 0;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: list.filter((r) => r.rating === stars).length }));
    const doc = allDoctors.find((d) => d.id === id);
    const out: DoctorReviews = {
      summary: { average: doc?.rating ?? average, total: doc?.reviews ?? total, distribution },
      reviews: list.map((r) => ({ ...r })),
    };
    return delay(out, 350);
  },
  async mapClinics() {
    return delay(mapClinics.map((c) => ({ ...c })), 350);
  },
};

// ---- notifications (PDF p31-32) ---------------------------------------------

const notifications: NotificationItem[] = [
  { id: "nt-1", kind: "assistant", title: "Me Assistant", body: "Your blood pressure improved 8% — view it in Me Health Insights.", time: "1h", group: "today", unread: true },
  { id: "nt-2", kind: "appointment", title: "Appointment reminder", body: "Dr. Khalid · Wed 18 Jun, 10:30 AM. Check in early.", time: "3h", group: "today", unread: true },
  { id: "nt-3", kind: "payment", title: "Payment successful", body: "OMR 26.250 paid by card. Invoice ready.", time: "5h", group: "today" },
  { id: "nt-4", kind: "lab", title: "Lab results available", body: "Your Lipid Profile is ready to view.", time: "1d", group: "earlier" },
  { id: "nt-5", kind: "prescription", title: "Prescription renewed", body: "Atorvastatin 10mg renewed by Dr. Said.", time: "2d", group: "earlier" },
];

const facilityMessages: FacilityMessage[] = [
  { id: "fm-1", source: "Royal Hospital", preview: "Your visit is confirmed for Wed 18 Jun, 10:30…", time: "2m", unread: true },
  { id: "fm-2", source: "MediLink", preview: "Invoice ML-INV-48213 is now available to download…", time: "3h", unread: true },
  { id: "fm-3", source: "Aster Lab", preview: "Your Lipid Profile results are ready to view.", time: "1d" },
  { id: "fm-4", source: "MediLink", preview: "Please upload your ID to complete your profile.", time: "2d" },
];

let notificationPrefs: NotificationPrefs = {
  appointmentReminders: true,
  paymentsInvoices: true,
  labResults: true,
  prescriptions: true,
  facilityUpdates: true,
  promotions: false,
  channels: { push: true, email: true, sms: false },
};

const notificationRepo: NotificationRepository = {
  async list() {
    return delay(notifications.map((n) => ({ ...n })), 350);
  },
  async facilityMessages() {
    return delay(facilityMessages.map((m) => ({ ...m })), 350);
  },
  async getPreferences() {
    return delay({ ...notificationPrefs, channels: { ...notificationPrefs.channels } }, 200);
  },
  async updatePreferences(patch) {
    notificationPrefs = {
      ...notificationPrefs,
      ...patch,
      channels: { ...notificationPrefs.channels, ...(patch.channels ?? {}) },
    };
    return delay({ ...notificationPrefs, channels: { ...notificationPrefs.channels } }, 150);
  },
  async markAllRead() {
    for (const n of notifications) n.unread = false;
    return delay(undefined, 150);
  },
};

// ---- auth -------------------------------------------------------------------

let currentUser: SessionUser | null = null;
const listeners = new Set<(u: SessionUser | null) => void>();
const notify = () => listeners.forEach((l) => l(currentUser));

const authRepo: AuthRepository = {
  async signIn() {
    currentUser = MOCK_USER;
    notify();
    return delay({ ok: true });
  },
  async signUp() {
    currentUser = MOCK_USER;
    notify();
    return delay({ ok: true });
  },
  async sendOtp() {
    return delay({ ok: true, messageKey: "otp.sent" });
  },
  async verifyOtp() {
    return delay({ ok: true });
  },
  async requestPasswordReset() {
    return delay({ ok: true, messageKey: "forgot.emailSent" });
  },
  async resetPassword() {
    return delay({ ok: true });
  },
  async googleSignIn() {
    return delay({ ok: false, messageKey: "errors.googleNotConfigured" });
  },
  async signOut() {
    currentUser = null;
    notify();
    await delay(null, 150);
  },
  async restoreSession() {
    return delay(currentUser, 150);
  },
  subscribe(onChange) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },
};

// ---- patient ----------------------------------------------------------------

const patientRepo: PatientRepository = {
  async getProfile() {
    return delay(structuredCloneSafe(profile));
  },
  async updateProfile(patch: ProfilePatch) {
    profile = {
      account: {
        ...profile.account!,
        ...(patch.full_name !== undefined ? { full_name: patch.full_name } : null),
        ...(patch.phone !== undefined ? { phone: patch.phone } : null),
      },
      patient: {
        ...profile.patient!,
        ...(patch.date_of_birth !== undefined ? { date_of_birth: patch.date_of_birth } : null),
        ...(patch.gender !== undefined ? { gender: patch.gender } : null),
        ...(patch.blood_group !== undefined ? { blood_group: patch.blood_group } : null),
        ...(patch.address !== undefined ? { address: patch.address } : null),
        ...(patch.emergency_contact !== undefined ? { emergency_contact: patch.emergency_contact } : null),
        ...(patch.profile_photo_url !== undefined ? { profile_photo_url: patch.profile_photo_url } : null),
      },
    };
    return delay(structuredCloneSafe(profile));
  },
  async uploadProfilePhoto(asset) {
    if (profile.patient) profile.patient.profile_photo_url = asset.uri;
    return delay({ profile_photo_url: asset.uri });
  },
};

// ---- medical history --------------------------------------------------------

const medicalHistoryRepo: MedicalHistoryRepository = {
  async get() {
    return delay({ ...history });
  },
  async upsert(patch) {
    history = { ...history, ...patch };
    return delay({ ...history });
  },
};

// ---- family -----------------------------------------------------------------

const familyRepo: FamilyRepository = {
  async list() {
    return delay(family.map((m) => ({ ...m })));
  },
  async add(member: NewFamilyMember) {
    const created: FamilyMember = { id: nextId(), ...member };
    family = [...family, created];
    return delay({ ...created });
  },
  async update(id, patch) {
    family = family.map((m) => (m.id === id ? { ...m, ...patch } : m));
    const updated = family.find((m) => m.id === id)!;
    return delay({ ...updated });
  },
  async remove(id) {
    family = family.filter((m) => m.id !== id);
    await delay(null, 200);
  },
};

// ---- appointments -----------------------------------------------------------

function to12hMock(hhmm: string): string {
  const [hStr, mStr = "00"] = hhmm.split(":");
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr.slice(0, 2)} ${ampm}`;
}

const appointmentRepo: AppointmentRepository = {
  async listUpcoming() {
    return delay(
      appointments.filter((a) => UPCOMING_STATUSES.includes(a.status ?? "")).map((a) => ({ ...a }))
    );
  },
  async list(tab) {
    const all = appointments.map((a) => ({ ...a }));
    if (tab === "all") return delay(all, 300);
    const wantUpcoming = tab === "upcoming";
    return delay(all.filter((a) => UPCOMING_STATUSES.includes(a.status ?? "") === wantUpcoming), 300);
  },
  async get(id) {
    const found = appointments.find((a) => a.id === id);
    return delay(found ? { ...found } : null, 250);
  },
  async getSlots() {
    const raw = ["10:00", "10:30", "11:30", "12:00", "16:30", "17:00"];
    return delay(raw.map((start) => ({ start, label: to12hMock(start) })), 250);
  },
  async create() {
    const id = `ML-${10000 + Math.floor(Math.random() * 89999)}`;
    return delay({ id, reference: id }, 300);
  },
  async cancel(id) {
    const a = appointments.find((x) => x.id === id);
    if (a) a.status = "cancelled";
    return delay(undefined, 300);
  },
  async reschedule(id, slot) {
    const a = appointments.find((x) => x.id === id);
    if (a) {
      a.slot_date = slot.date;
      a.slot_start = slot.start;
    }
    return delay(undefined, 300);
  },
  async checkIn(id) {
    const a = appointments.find((x) => x.id === id);
    if (a) a.status = "checked_in";
    return delay(undefined, 300);
  },
};

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---- payments (read side) — mirrors the two paid mock appointments ----------
const payments: Payment[] = [
  {
    id: "mock-pay-1",
    amount: 12.6, // 12.000 fee + 5% VAT
    currency: "OMR",
    status: "paid",
    reference: "TX-90021",
    method: "Visa •••• 4421",
    invoiceUrl: null,
    createdAt: "2026-06-16",
    appointment: {
      id: "mock-appt-1",
      reference_number: "ML-3F2A9C01",
      slot_date: "Wed 18 Jun",
      slot_start: "10:30 AM",
      doctor: { full_name: "Dr. Khalid Al Balushi", specialty: "Cardiology" },
      facility: { name: "Royal Hospital · General Care" },
      fee_omr: 12,
    },
  },
  {
    id: "mock-pay-2",
    amount: 15.75, // 15.000 fee + 5% VAT
    currency: "OMR",
    status: "paid",
    reference: "TX-90022",
    method: "Mastercard •••• 8830",
    invoiceUrl: null,
    createdAt: "2026-06-01",
    appointment: {
      id: "mock-appt-2",
      reference_number: "ML-7B1D4E22",
      slot_date: "Mon 2 Jun",
      slot_start: "4:00 PM",
      doctor: { full_name: "Dr. Said Al Hinai", specialty: "Dermatology" },
      facility: { name: "Aster Clinic · Dermatology" },
      fee_omr: 15,
    },
  },
];

const paymentRepo: PaymentRepository = {
  async list() {
    return delay(payments.map((p) => ({ ...p })), 300);
  },
  async get(id) {
    const found = payments.find((p) => p.id === id);
    return delay(found ? { ...found } : null, 250);
  },
  async getByAppointment(appointmentId) {
    const found = payments.find((p) => p.appointment?.id === appointmentId);
    return delay(found ? { ...found } : null, 250);
  },
  async createCheckout() {
    // No hosted gateway in mock — a null URL tells the Summary screen to simulate
    // a successful payment and continue to the confirmation.
    return delay({ checkoutUrl: null }, 300);
  },
  async verify(appointmentId) {
    // Mock has no gateway; surface the seeded mock payment as paid.
    const found = payments.find((p) => p.appointment?.id === appointmentId);
    return delay({ status: "paid", payment: found ? { ...found, status: "paid" } : null }, 300);
  },
};

const documentRepo: DocumentRepository = (() => {
  let docs: PatientDoc[] = [
    { id: "doc-cbc", name: "Blood test — CBC", type: "report", file_url: "mock/cbc.pdf", file_type: "application/pdf", size_bytes: 245760, uploaded_at: "2026-05-02T09:00:00Z", linked_appointment: null },
    { id: "doc-xray", name: "Chest X-Ray", type: "imaging", file_url: "mock/chest-xray.jpg", file_type: "image/jpeg", size_bytes: 1258291, uploaded_at: "2026-04-28T09:00:00Z", linked_appointment: null },
    { id: "doc-rx", name: "Salbutamol prescription", type: "prescription", file_url: "mock/rx.pdf", file_type: "application/pdf", size_bytes: 102400, uploaded_at: "2026-04-12T09:00:00Z", linked_appointment: null },
  ];
  return {
    async list() {
      return delay([...docs]);
    },
    async get(id) {
      return delay(docs.find((d) => d.id === id) ?? null);
    },
    async upload(input: NewDocumentUpload) {
      const doc: PatientDoc = {
        id: nextId(),
        name: input.name,
        type: input.type,
        file_url: input.asset.uri,
        file_type: input.asset.mimeType ?? "image/jpeg",
        size_bytes: null,
        uploaded_at: new Date().toISOString(),
        linked_appointment: null,
      };
      docs = [doc, ...docs];
      return delay(doc, 300);
    },
    async remove(id: string) {
      docs = docs.filter((d) => d.id !== id);
      return delay(undefined, 250);
    },
    async signedUrl(filePath: string) {
      // In mock mode the stored "path" is already a local/asset uri.
      return delay(filePath, 100);
    },
  };
})();

export const mockRepositories: Repositories = {
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
};
