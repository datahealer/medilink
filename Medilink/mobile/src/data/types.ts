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
  /** Verified Arabic name + status (HAMS-authored); UI falls back to `full_name`. */
  full_name_ar?: string | null;
  full_name_ar_status?: string | null;
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
  /** Oman civil number (national ID), 8 digits. Optional. */
  civil_number: string | null;
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
  civil_number?: string | null;
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
  doctor: { full_name: string | null; specialty?: string | null; full_name_ar?: string | null; full_name_ar_status?: string | null } | null;
  facility: { name: string | null; address?: string | null; name_ar?: string | null; name_ar_status?: string | null } | null;
  for_family_member?: { full_name: string | null } | null;
  payment?: { amount: number | null; currency: string | null; status: string | null } | null;
}

export type AppointmentTab = "upcoming" | "past" | "all";

// ---- queue ------------------------------------------------------------------
// HAMS owns every queue calculation (position, people_ahead, ETA, ordering).
// These types mirror the integration contract payload verbatim; the app renders
// them and never derives them. See docs/QUEUE_BACKEND_FOR_MEDILINK.md §2.1.

export type QueueItemStatus = "waiting" | "called" | "done" | "expired";
export type QueueAcknowledgeKind = "seen" | "on_my_way";

/** Which UI state the Live Queue screen renders. Derived only from server flags. */
export type QueuePhase = "waiting" | "called" | "done";

/**
 * Live queue state for one appointment, as returned by
 * `GET /api/patients/me/queue-status`. Field names are kept identical to the
 * contract so a payload change is a compile error rather than a silent drift.
 */
export interface QueueStatus {
  queueItemId: string;
  /** Facility-wide sequence number (display only — not "3rd in line"). */
  position: number;
  /** Doctor-scoped patients ahead. Server-computed. */
  peopleAhead: number;
  /** Integer position currently with the doctor, or null. Never an identity. */
  nowServingPosition: number | null;
  status: QueueItemStatus;
  phase: QueuePhase;
  isCheckedIn: boolean;
  checkedInAt: string | null;
  calledAt: string | null;
  doneAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedKind: QueueAcknowledgeKind | null;
  isWalkin: boolean;
  isOnline: boolean;
  /** Server-computed ETA in minutes; 0 once called. */
  estimatedWaitMinutes: number;
  avgConsultationMinutes: number;
  appointment: {
    id: string;
    referenceNumber: string | null;
    slotDate: string | null;
    slotStart: string | null;
    slotEnd: string | null;
    status: string | null;
    type: string | null;
  };
  doctor: {
    id: string;
    fullName: string | null;
    specialty: string | null;
    /** available | with_patient | on_break | unavailable */
    status: string | null;
    statusUpdatedAt: string | null;
  } | null;
  facility: { id: string; name: string | null };
  /** Authoritative server clock — drive all elapsed/relative time from this. */
  serverTime: string;
}

/**
 * Why a queue read produced no status. Mirrors the contract's error codes so the
 * UI can render the right empty/error state instead of a generic failure.
 */
export type QueueUnavailableReason =
  | "not_in_queue"
  | "not_checked_in"
  | "forbidden"
  | "unauthorized"
  | "server_error"
  | "offline";

/** Thrown by the queue repository when the backend declines the read/write. */
export class QueueUnavailableError extends Error {
  constructor(
    public reason: QueueUnavailableReason,
    message?: string
  ) {
    super(message ?? reason);
    this.name = "QueueUnavailableError";
  }
}

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
    doctor?: { full_name: string | null; specialty?: string | null; full_name_ar?: string | null; full_name_ar_status?: string | null } | null;
    facility?: { name: string | null; name_ar?: string | null; name_ar_status?: string | null } | null;
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
  /** Patient's reason for visit (optional) → appointments.reason_for_visit (6.4). */
  reason?: string | null;
}

export interface BookedAppointment {
  id: string;
  reference?: string | null;
}

export interface PhotoAsset {
  uri: string;
  name?: string;
  mimeType?: string;
  /**
   * Size in bytes when the picker reports it (`ImagePickerAsset.fileSize` /
   * `DocumentPickerAsset.size`). Used to reject a file that is too large BEFORE the
   * upload path materialises it as an ArrayBuffer in JS memory — see the size guard in
   * app/(app)/records/upload.tsx. Optional because a camera capture does not always
   * carry it.
   */
  size?: number | null;
}

// ---- document vault (PDF p28-29) --------------------------------------------

/** Backend `document_type` enum. NOTE: there is no `vaccination` value; the
 *  design's "Vaccinations" category maps to `other` until the enum gains one.
 *  `invoice` is added by migration 20260721000001 for paid-invoice PDFs filed
 *  into the vault. */
export type DocumentType = "prescription" | "report" | "imaging" | "insurance" | "other" | "invoice";

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
  /** Optional appointment to link the document to (e.g. an invoice's appointment). */
  linkedAppointmentId?: string | null;
}

// ---- prescriptions (PDF p30-31) ---------------------------------------------

export interface PrescriptionMed {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
}

export interface Prescription {
  id: string;
  issued_at: string | null;
  medications: PrescriptionMed[];
  instructions: string | null;
  /** Storage path of the generated PDF (present only once a doctor has generated it). */
  pdf_url: string | null;
  doctor: { full_name: string | null; specialty: string | null; full_name_ar?: string | null; full_name_ar_status?: string | null } | null;
  appointment?: { slot_date: string | null; type?: string | null } | null;
}

/** Result of minting a "send to pharmacy" share link (absolute URL). */
export interface PrescriptionShareLink {
  url: string;
  expiresAt: string | null;
}

// ---- AI features (PDF p26-27) -----------------------------------------------

export interface AiSuggestedDoctor {
  id: string;
  full_name: string;
  specialty: string | null;
  rating: number | null;
  fee_omr: number | null;
  /** Clinic / facility name (from suggest-doctor's facility join), or null. */
  clinic: string | null;
}

export interface AiDoctorSuggestion {
  reasoning: string | null;
  urgencyLevel: string | null;
  doctors: AiSuggestedDoctor[];
}

/** The patient's most recent AI-generated visit summary (appointments.patient_summary). */
export interface AiVisitSummary {
  summary: string;
  date: string | null;
  doctorName: string | null;
}

// ---- AI scheduling assistant (F-41, PDF p26) --------------------------------

/** Conversational entity memory round-tripped between turns (mirrors the backend). */
export interface AiScheduleEntities {
  doctor_type?: string | null;
  date_phrase?: string | null;
  time_preference?: string;
}

/** One turn of the schedule-assist conversation sent back for context. */
export interface AiScheduleTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiScheduleSlot {
  /** "HH:MM" local start/end as returned by get_available_slots. */
  start: string;
  end: string;
}

/** A bookable doctor + concrete open slots on a specific date. */
export interface AiScheduleDoctorResult {
  doctorId: string;
  doctorName: string;
  specialty: string;
  rating: number | null;
  feeOmr: number | null;
  slotDate: string;
  slots: AiScheduleSlot[];
  /** True when preferred time-of-day had none, so any-time slots are shown instead. */
  timeFallback: boolean;
}

/** Input for a single scheduling turn. */
export interface AiScheduleInput {
  query: string;
  /** Patient-local date "YYYY-MM-DD" so relative phrases resolve without server UTC drift. */
  clientDate: string;
  history: AiScheduleTurn[];
  pendingEntities?: AiScheduleEntities;
}

/**
 * Normalized schedule-assist reply. The backend's four `data.type` shapes collapse to
 * three UI intents: a conversational message (clarify/info), booking results, or no results
 * (optionally with the next available date). `entities` is fed back on the next turn.
 */
export type AiScheduleResponse =
  | { kind: "message"; message: string; entities: AiScheduleEntities }
  | { kind: "results"; results: AiScheduleDoctorResult[]; entities: AiScheduleEntities }
  | {
      kind: "no_results";
      message: string;
      nextAvailable: { date: string; doctorName: string | null; doctorId: string | null } | null;
      entities: AiScheduleEntities;
    };

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
  /** Verified Arabic name + its status (HAMS-authored); UI falls back to `full_name`. */
  full_name_ar?: string | null;
  full_name_ar_status?: string | null;
  specialty: string;
  facility: string;
  /** Verified Arabic facility name + status; UI falls back to `facility`. */
  facility_ar?: string | null;
  facility_ar_status?: string | null;
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
  /** Verified Arabic clinic name + status (HAMS-authored); UI falls back to `name`. */
  name_ar?: string | null;
  name_ar_status?: string | null;
  area: string;
  /** Care category shown in the featured card meta, e.g. "Multi-speciality". */
  category?: string;
  doctors_count?: number;
  distance_km?: number;
  rating: number;
  featured?: boolean;
  open_now?: boolean;
  /** Real coordinates for the Map View (PDF p19); null when the facility has no geo. */
  latitude?: number | null;
  longitude?: number | null;
}

/** Filters bottom sheet (PDF p18). */
export interface DoctorSearchParams {
  query?: string;
  /** Restrict to one clinic's doctors (clinic detail — QA #14). */
  facilityId?: string;
  specialty?: string;
  gender?: Gender | "any";
  maxFee?: number;
  minRating?: number;
  availableToday?: boolean;
  topRated?: boolean;
  /** Max rows to fetch from the top of the ranked list (pagination — QA #13). */
  limit?: number;
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

/** Input for submitting a doctor rating/review (design p33). */
export interface NewReviewSubmission {
  doctorId: string;
  rating: number; // 1..5
  comment?: string | null;
  /** Selected "what went well" aspect labels, folded into the review text. */
  aspects?: string[];
  appointmentId?: string | null;
}

// ---- favourites -------------------------------------------------------------

/** What a favourite points at (`favourites.target_type`). */
export type FavouriteTargetKind = "doctor" | "facility";

/** A saved favourite (doctor or clinic). */
export interface FavouriteItem {
  id: string;
  targetId: string;
  targetType: FavouriteTargetKind;
  createdAt: string;
}

// ---- notifications (PDF p31-32) ---------------------------------------------

export type NotificationKind =
  | "assistant"
  | "appointment"
  /** Live-queue events (called / next). Deep-links to the queue, not the appointment. */
  | "queue"
  | "payment"
  | "lab"
  | "prescription"
  | "facility"
  | "general";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  group: "today" | "earlier";
  unread?: boolean;
  /** Related appointment id (from the notification `data` payload), for deep-linking. */
  appointmentId?: string | null;
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

// ---- lab results (PDF p29-30) -----------------------------------------------

export type LabFlag = "low" | "normal" | "high" | "abnormal";
export type LabStatus = "normal" | "flagged";

/** Lab Reports list row (design p29). */
export interface LabResultItem {
  id: string;
  test_name: string;
  facility_name: string | null;
  result_date: string | null; // ISO date; falls back to uploaded_at when absent
  uploaded_at: string;
  status: LabStatus;
  flagged_count: number;
}

/** One measured analyte within a report (design p30 analyte rows). */
export interface LabAnalyte {
  id: string;
  analyte_code: string;
  analyte_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  flag: LabFlag;
  measured_at: string;
  display_order: number;
}

/** Full report detail: header + analytes + optional AI "Me insight". */
export interface LabResultDetail extends LabResultItem {
  ai_insight: string | null;
  ai_insight_at: string | null;
  storage_path: string | null;
  file_url: string;
  file_type: string;
  notes: string | null;
  analytes: LabAnalyte[];
}

/** A single point in an analyte's time series (oldest→newest). */
export interface LabTrendPoint {
  measured_at: string;
  value_numeric: number | null;
  unit: string | null;
  flag: LabFlag;
}
