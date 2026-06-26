/**
 * Repository interfaces — the contract every data source (mock / real) implements.
 * The UI talks to these, never to Supabase or HAMS directly.
 */
import type {
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
  MedicalHistory,
  MedicalHistoryPatch,
  NewAppointment,
  NewFamilyMember,
  NotificationItem,
  NotificationPrefs,
  PatientProfile,
  PhotoAsset,
  ProfilePatch,
  SessionUser,
  SignInInput,
  SignUpInput,
  Specialty,
} from "./types";

export interface AuthRepository {
  signIn(input: SignInInput): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  sendOtp(phone?: string): Promise<AuthResult>;
  verifyOtp(code: string, phone?: string): Promise<AuthResult>;
  requestPasswordReset(identifier: string): Promise<AuthResult>;
  resetPassword(password: string): Promise<AuthResult>;
  googleSignIn(): Promise<AuthResult>;
  signOut(): Promise<void>;
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
}

/** Read-only discovery data for the dashboard (recents/featured) + specialty grid. */
export interface DiscoveryRepository {
  listSpecialties(): Promise<Specialty[]>;
  recentDoctors(): Promise<Doctor[]>;
  featuredClinics(): Promise<Clinic[]>;
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
}

export interface Repositories {
  auth: AuthRepository;
  patient: PatientRepository;
  medicalHistory: MedicalHistoryRepository;
  family: FamilyRepository;
  appointment: AppointmentRepository;
  discovery: DiscoveryRepository;
  doctor: DoctorRepository;
  notification: NotificationRepository;
}
