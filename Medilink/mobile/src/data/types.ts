/**
 * Domain models for the UI layer.
 *
 * Screens and hooks depend ONLY on these types — never on Supabase/HAMS row shapes.
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
  slot_date: string | null;
  slot_start: string | null;
  doctor: { full_name: string | null } | null;
  facility: { name: string | null } | null;
  status?: string | null;
}

export interface PhotoAsset {
  uri: string;
  name?: string;
  mimeType?: string;
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
