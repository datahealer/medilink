/**
 * Repository interfaces — the contract every data source (mock / real) implements.
 * The UI talks to these, never to Supabase or the backend directly.
 */
import type {
  AiDoctorSuggestion,
  AiScheduleInput,
  AiScheduleResponse,
  AiVisitSummary,
  Appointment,
  AppointmentTab,
  AuthResult,
  AvailableSlot,
  BookedAppointment,
  Clinic,
  Doctor,
  DoctorReviews,
  DoctorSearchParams,
  FacilityMessage,
  FamilyMember,
  LabResultDetail,
  LabResultItem,
  LabTrendPoint,
  MedicalHistory,
  MedicalHistoryPatch,
  NewAppointment,
  NewDocumentUpload,
  NewFamilyMember,
  NewReviewSubmission,
  FavouriteItem,
  FavouriteTargetKind,
  NotificationItem,
  NotificationPrefs,
  PatientDoc,
  PatientProfile,
  Payment,
  PhotoAsset,
  Prescription,
  PrescriptionShareLink,
  ProfilePatch,
  SessionUser,
  SignInInput,
  SignUpInput,
  Specialty,
} from "./types";

export interface AuthRepository {
  signIn(input: SignInInput): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  sendOtp(email?: string): Promise<AuthResult>;
  verifyOtp(code: string, email?: string): Promise<AuthResult>;
  /** F5 — send a passwordless email login code (enumeration-safe). */
  sendLoginOtp(email: string): Promise<AuthResult>;
  /** F5 — verify the email login code; establishes the session on success. */
  verifyLoginOtp(code: string, email: string): Promise<AuthResult>;
  requestPasswordReset(identifier: string): Promise<AuthResult>;
  resetPassword(password: string): Promise<AuthResult>;
  googleSignIn(): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** F57 — request account deletion (soft-delete + 30-day grace; records retained). */
  deleteAccount(): Promise<AuthResult>;
  /** Restore a persisted session on launch. Resolves to the user, or null. */
  restoreSession(): Promise<SessionUser | null>;
  /** Subscribe to session changes; returns an unsubscribe fn. */
  subscribe(onChange: (user: SessionUser | null) => void): () => void;
}

export interface PatientRepository {
  getProfile(): Promise<PatientProfile>;
  updateProfile(patch: ProfilePatch): Promise<PatientProfile>;
  uploadProfilePhoto(asset: PhotoAsset): Promise<{ profile_photo_url: string }>;
}

export interface MedicalHistoryRepository {
  get(): Promise<MedicalHistory | null>;
  upsert(patch: MedicalHistoryPatch): Promise<MedicalHistory>;
}

export interface FamilyRepository {
  list(): Promise<FamilyMember[]>;
  add(member: NewFamilyMember): Promise<FamilyMember>;
  update(id: string, patch: Partial<NewFamilyMember>): Promise<FamilyMember>;
  remove(id: string): Promise<void>;
}

export interface AppointmentRepository {
  listUpcoming(): Promise<Appointment[]>;
  /** Appointments for a tab (upcoming / past / all), newest first. */
  list(tab: AppointmentTab): Promise<Appointment[]>;
  /** A single appointment by id (scoped to the caller), or null. */
  get(id: string): Promise<Appointment | null>;
  /** Available slots for a doctor on a date (YYYY-MM-DD). */
  getSlots(params: { doctorId: string; date: string; branchId?: string }): Promise<AvailableSlot[]>;
  /** Book an appointment (atomic create). Returns the new appointment id/reference. */
  create(input: NewAppointment): Promise<BookedAppointment>;
  /** Cancel an appointment (atomic RPC; throws with the backend reason on failure). */
  cancel(id: string, reason?: string): Promise<void>;
  /**
   * BP-3 — release a still-pending, UNPAID reservation (void → free the slot).
   * Used on payment cancel/abandon or a checkout-creation rollback; distinct from
   * cancel() (which is for confirmed/paid bookings).
   */
  releaseHold(id: string): Promise<void>;
  /** Reschedule to a new slot (atomic RPC; throws with the backend reason on failure). */
  reschedule(id: string, slot: { date: string; start: string; end: string }): Promise<void>;
  /** Check in to a confirmed appointment (throws with the backend reason on failure). */
  checkIn(id: string): Promise<void>;
}

/** Payments — read side (Thawani checkout is hosted; cards are never stored by us). */
export interface PaymentRepository {
  /** The caller's payments (newest first). */
  list(): Promise<Payment[]>;
  /** A single payment by id (scoped to the caller), or null. */
  get(id: string): Promise<Payment | null>;
  /** The payment for a given appointment, or null. */
  getByAppointment(appointmentId: string): Promise<Payment | null>;
  /**
   * Create a Thawani hosted-checkout session for an appointment. Returns the URL
   * to open in the browser. `checkoutUrl` is null when no gateway is wired (mock).
   * BP-4: the amount is derived SERVER-side from the doctor's fee — never sent by
   * the client.
   */
  createCheckout(input: { appointmentId: string }): Promise<{ checkoutUrl: string | null }>;
  /**
   * Verify a payment on return from Thawani (authoritative session-status check on
   * the backend). Finalizes paid → confirmed server-side and returns the latest status
   * plus a service-role recap (so confirmation doesn't depend on the patient RLS read).
   */
  verify(appointmentId: string): Promise<{ status: string; payment?: Payment | null }>;
  /**
   * Manually (re)generate the invoice for a paid payment whose invoice never
   * generated (transient edge-fn/storage failure). Idempotent server-side: returns the
   * existing invoice if present, else triggers the worker. `invoiceUrl` is null when the
   * invoice is still being generated (status 'queued'/'in_progress') — poll again.
   */
  regenerateInvoice(paymentId: string): Promise<{ invoiceUrl: string | null; status: string }>;
}

/** Read-only discovery data for the dashboard (recents/featured) + specialty grid. */
export interface DiscoveryRepository {
  listSpecialties(): Promise<Specialty[]>;
  recentDoctors(): Promise<Doctor[]>;
  featuredClinics(): Promise<Clinic[]>;
  /** Verified clinics near a point, with real coordinates, for the Map View (PDF p19). */
  nearbyClinics(geo: { lat: number; lng: number; radiusM?: number }): Promise<Clinic[]>;
  /** Verified clinics whose name matches `term` (clinic search — QA #14). */
  searchClinics(term: string): Promise<Clinic[]>;
  /** A single clinic by id for the Clinic Detail screen (QA #14), or null. */
  getClinic(id: string): Promise<Clinic | null>;
}

/** Doctor search / profile / reviews (PDF flows 05–06). */
export interface DoctorRepository {
  search(params?: DoctorSearchParams): Promise<Doctor[]>;
  get(id: string): Promise<Doctor | null>;
  reviews(id: string): Promise<DoctorReviews>;
  /** Clinics with fee pins for the Map view (PDF p19). */
  mapClinics(): Promise<Clinic[]>;
}

/** Notifications center, facility messages and preferences (PDF flow 14). */
export interface NotificationRepository {
  list(): Promise<NotificationItem[]>;
  facilityMessages(): Promise<FacilityMessage[]>;
  getPreferences(): Promise<NotificationPrefs>;
  updatePreferences(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs>;
  /** Mark every unread notification as read. */
  markAllRead(): Promise<void>;
  /** Mark the given facility announcements as read for the caller. */
  markFacilityMessagesRead(ids: string[]): Promise<void>;
}

/** Document Vault (PDF p28-29) — `patient_documents` + the `patient-docs` bucket. */
export interface DocumentRepository {
  /** The caller's documents (newest first), excluding soft-deleted. */
  list(): Promise<PatientDoc[]>;
  /** A single document by id (scoped to the caller), or null. */
  get(id: string): Promise<PatientDoc | null>;
  /** Upload a local file to the bucket, then record it. Returns the new document. */
  upload(input: NewDocumentUpload): Promise<PatientDoc>;
  /** Soft-delete a document. */
  remove(id: string): Promise<void>;
  /** Short-lived signed URL to preview/download a stored object (by storage path). */
  signedUrl(filePath: string): Promise<string>;
}

/** Prescriptions (PDF p30-31) - read + PDF download + share/send-to-pharmacy. */
export interface PrescriptionRepository {
  /** The caller's prescriptions (newest first). */
  list(): Promise<Prescription[]>;
  /** A single prescription by id (scoped to the caller), or null. */
  get(id: string): Promise<Prescription | null>;
  /** Signed URL for the doctor-generated PDF. Throws if not generated yet (patient cannot generate). */
  pdfUrl(id: string): Promise<string>;
  /** Mint/reuse a shareable "send to pharmacy" link (absolute URL, ~24h). */
  shareLink(id: string): Promise<PrescriptionShareLink>;
}

/** Lab Results (PDF p29-30) — report list, detail with analytes, trends + file download. */
export interface LabRepository {
  /** The caller's lab reports (newest first). */
  list(): Promise<LabResultItem[]>;
  /** A single report with its analytes + optional AI insight (scoped to the caller), or null. */
  get(id: string): Promise<LabResultDetail | null>;
  /** Time series for one analyte code (oldest→newest) for trend display. */
  trend(analyteCode: string, limit?: number): Promise<LabTrendPoint[]>;
  /** Mark a report as viewed (idempotent). */
  markViewed(id: string): Promise<void>;
  /** Short-lived signed URL for the report file (Download PDF / Share). */
  signedUrl(storagePath: string): Promise<string>;
}

/** Reviews (PDF p20, p33) - submit a rating/review for a doctor. */
export interface ReviewRepository {
  submit(input: NewReviewSubmission): Promise<void>;
}

/** Favourites (PDF p20) — save/unsave doctors and clinics. `favourites` table + RLS. */
export interface FavouriteRepository {
  /** The caller's favourites, optionally filtered by kind (newest first). */
  list(kind?: FavouriteTargetKind): Promise<FavouriteItem[]>;
  /** Whether a specific target is currently favourited. */
  isFavourite(target: { targetId: string; targetType: FavouriteTargetKind }): Promise<boolean>;
  /** Toggle a favourite. Returns the new state (`true` = now favourited). */
  toggle(target: { targetId: string; targetType: FavouriteTargetKind }): Promise<boolean>;
}

/** AI features (PDF p26-27) - doctor recommendations + the AI visit summary. */
export interface AiRepository {
  /** AI doctor suggestions for free-text symptoms (POST /api/ai/suggest-doctor). */
  suggestDoctors(symptoms: string): Promise<AiDoctorSuggestion>;
  /** The patient's most recent AI-generated visit summary, or null. */
  latestVisitSummary(): Promise<AiVisitSummary | null>;
  /** One turn of the conversational scheduling assistant (POST /api/ai/schedule-assist). */
  scheduleAssist(input: AiScheduleInput): Promise<AiScheduleResponse>;
}

export interface Repositories {
  auth: AuthRepository;
  patient: PatientRepository;
  medicalHistory: MedicalHistoryRepository;
  family: FamilyRepository;
  appointment: AppointmentRepository;
  payment: PaymentRepository;
  discovery: DiscoveryRepository;
  doctor: DoctorRepository;
  notification: NotificationRepository;
  document: DocumentRepository;
  prescription: PrescriptionRepository;
  lab: LabRepository;
  review: ReviewRepository;
  favourite: FavouriteRepository;
  ai: AiRepository;
}
