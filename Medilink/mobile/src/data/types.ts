/**
 * Domain models for the UI layer.
 *
 * Screens and hooks depend ONLY on these types — never on Supabase/backend row shapes.
 * The real repositories (`data/real`) map backend rows → these models; the mock
 * repositories (`data/mock`) construct them directly. This is the boundary that lets
 * us build UI-first with `EXPO_PUBLIC_DATA_MODE=mock` and swap in real APIs per
 * module later without touching a single screen.
 */
import type { MessageKey } from "@/i18n";

export type Gender = "male" | "female" | "other";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
export type FamilyRelation = "spouse" | "child" | "parent" | "sibling" | "other";
export type SmokingStatus = "never" | "former" | "current" | "unknown";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Result of an auth action — carries a stable i18n key, never raw English. */
export interface AuthResult {
  ok: boolean;
  messageKey?: MessageKey;
}

export interface SignInInput {
  email: string;
  password: string;
  remember?: boolean;
}
export interface SignUpInput {
  fullName: string;
  email: string;
  phone: string; // local digits
  dialCode: string; // e.g. "+968"
  password: string;
}

export interface ProfileAccount {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

export interface ProfilePatient {
  id: string;
  date_of_birth: string | null;
  gender: Gender | null;
  blood_group: BloodGroup;
  /** Display-ready string (the real repo flattens the backend's JSON column). */
  address: string | null;
  emergency_contact: string | null;
  profile_photo_url: string | null;
}

export interface PatientProfile {
  account: ProfileAccount | null;
  patient: ProfilePatient | null;
}

export interface ProfilePatch {
  full_name?: string;
  phone?: string;
  date_of_birth?: string | null;
  gender?: Gender | null;
  blood_group?: BloodGroup;
  address?: string | null;
  emergency_contact?: string | null;
  profile_photo_url?: string | null;
}

export interface MedicalHistory {
  allergies: string[];
  conditions: string[];
  medications: string[];
  surgeries: string[];
  smoking_status: SmokingStatus;
  notes: string | null;
}

export interface MedicalHistoryPatch {
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  surgeries?: string[];
  smoking_status?: SmokingStatus;
  notes?: string | null;
}

export interface FamilyMember {
  id: string;
  full_name: string;
  relation: FamilyRelation;
  date_of_birth: string | null;
  gender: Gender | null;
}

export interface NewFamilyMember {
  full_name: string;
  relation: FamilyRelation;
  date_of_birth: string | null;
  gender: Gender | null;
}

export interface Appointment {
  id: string;
  reference_number?: string | null;
  doctor_id?: string | null;
  slot_date: string | null;
  slot_start: string | null;
  slot_end?: string | null;
  type?: "in_person" | "online" | null;
  status?: string | null;
  payment_status?: string | null;
  reason_for_visit?: string | null;
  notes?: string | null;
  /** Consultation fee (OMR) for this appointment's type, from the doctor. */
  fee_omr?: number | null;
  doctor: { full_name: string | null; specialty?: string | null } | null;
  facility: { name: string | null; address?: string | null } | null;
  for_family_member?: { full_name: string | null } | null;
  payment?: { amount: number | null; currency: string | null; status: string | null } | null;
}

export type AppointmentTab = "upcoming" | "past" | "all";

/** A payment record (Thawani). Read-side only — checkout happens on Thawani's hosted page. */
export interface Payment {
  id: string;
  amount: number | null;
  currency: string | null;
  /** unpaid | pending | paid | failed | refunded | partial_refund */
  status: string | null;
  /** Human-facing reference (gateway_ref, else the payment id). */
  reference?: string | null;
  /** Card/gateway label when the gateway returns one (e.g. "thawani"). */
  method?: string | null;
  invoiceUrl?: string | null;
  createdAt?: string | null;
  appointment?: {
    id: string;
    reference_number?: string | null;
    slot_date: string | null;
    slot_start: string | null;
    doctor?: { full_name: string | null; specialty?: string | null } | null;
    facility?: { name: string | null } | null;
    /** Consultation fee (OMR) derived from the doctor's fees for this type. */
    fee_omr?: number | null;
  } | null;
}

/** A bookable time slot: `start` (raw HH:MM) is sent to the RPC, `label` is shown. */
export interface AvailableSlot {
  start: string;
  end?: string;
  label: string;
}

export interface NewAppointment {
  doctorId: string;
  facilityId: string;
  slotDate: string; // YYYY-MM-DD
  slotStart: string; // HH:MM
  type: "in_person" | "online";
  forFamilyMemberId?: string | null;
}

export interface BookedAppointment {
  id: string;
  reference?: string | null;
}

export interface PhotoAsset {
  uri: string;
  name?: string;
  mimeType?: string;
}

// ---- document vault (PDF p28-29) --------------------------------------------

/** Backend `document_type` enum. NOTE: there is no `vaccination` value; the
 *  design's "Vaccinations" category maps to `other` until the enum gains one. */
export type DocumentType = "prescription" | "report" | "imaging" | "insurance" | "other";

export interface PatientDoc {
  id: string;
  name: string;
  type: DocumentType;
  /** Storage object path within the `patient-docs` bucket (not a URL). */
  file_url: string;
  /** MIME type, e.g. "image/jpeg" / "application/pdf". */
  file_type: string;
  size_bytes?: number | null;
  uploaded_at: string | null;
  /** The appointment this document was attached to, when linked. */
  linked_appointment?: {
    slot_date: string | null;
    slot_start: string | null;
    doctor?: { full_name: string | null } | null;
  } | null;
}

export interface NewDocumentUpload {
  name: string;
  type: DocumentType;
  /** Local file to upload to the `patient-docs` bucket. */
  asset: PhotoAsset;
}

// ---- discovery (dashboard recents/featured + Batch-2 doctor search) ----------

export interface Specialty {
  id: string;
  name: string;
  /** Ionicons name used by the specialty grid/chips. */
  icon?: string;
}

export interface Doctor {
  id: string;
  full_name: string;
  specialty: string;
  facility: string;
  /** Real facility id — the booking target (the clinic picker is cosmetic in real mode). */
  facility_id?: string;
  rating: number;
  reviews?: number;
  fee_omr: number;
  distance_km?: number;
  available_today?: boolean;
  /** True for "recently visited" cards on the dashboard. */
  visited?: boolean;
  // Doctor Details (PDF p19)
  gender?: Gender;
  experience_years?: number;
  languages?: string[];
  about?: string;
  slots_today?: string[];
}

export interface Clinic {
  id: string;
  name: string;
  area: string;
  /** Care category shown in the featured card meta, e.g. "Multi-speciality". */
  category?: string;
  doctors_count?: number;
  distance_km?: number;
  rating: number;
  featured?: boolean;
  open_now?: boolean;
}

/** Filters bottom sheet (PDF p18). */
export interface DoctorSearchParams {
  query?: string;
  specialty?: string;
  gender?: Gender | "any";
  maxFee?: number;
  minRating?: number;
  availableToday?: boolean;
  topRated?: boolean;
}

// ---- reviews (PDF p20) ------------------------------------------------------

export interface Review {
  id: string;
  author: string;
  rating: number; // 1..5
  comment: string;
  date: string;
  verified?: boolean;
}
export interface ReviewSummary {
  average: number;
  total: number;
  /** Counts per star bucket, 5 → 1. */
  distribution: { stars: number; count: number }[];
}
export interface DoctorReviews {
  summary: ReviewSummary;
  reviews: Review[];
}

// ---- notifications (PDF p31-32) ---------------------------------------------

export type NotificationKind =
  | "assistant"
  | "appointment"
  | "payment"
  | "lab"
  | "prescription"
  | "facility";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  group: "today" | "earlier";
  unread?: boolean;
}

export interface FacilityMessage {
  id: string;
  source: string;
  preview: string;
  time: string;
  unread?: boolean;
}

export interface NotificationPrefs {
  appointmentReminders: boolean;
  paymentsInvoices: boolean;
  labResults: boolean;
  prescriptions: boolean;
  facilityUpdates: boolean;
  promotions: boolean;
  channels: { push: boolean; email: boolean; sms: boolean };
}
