# MediLink — Core Flow API Integration Report

**Date:** 2026-06-25
**Scope:** the core patient journey only — Sign in/session → Dashboard → Doctor Search → Doctor Details → Availability/slots → Booking Review → Create Appointment → Appointment Success.
**Status:** inspection only. **No integration code changed. No secrets added.** Payment stays mock.

> Headline: the booking backend **already exists** in the shared package (`shared/src/api/*`, direct Supabase + SECURITY-DEFINER RPCs). Auth, profile, family, medical-history and appointment-list are **already wired** in the mobile real repos. The discovery → search → details → slots → create-appointment path is **implemented in the backend but not wired** at the mobile repository boundary (`src/data/real/index.ts`), and booking is currently faked client-side in `bookingStore.confirm()`.

---

## 1. Existing API architecture

- **Supabase client** — `src/lib/supabase.ts`: `createClient<Database>` using `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Session persisted in the OS keychain via a chunked `SecureStoreAdapter` (`src/lib/secureStore.ts`); `autoRefreshToken`, `persistSession`, foreground-gated refresh. Exposes `getAccessToken()`.
- **Shared API package** — `@medilink/shared/mobile` → `shared/src/api/*` (`auth`, `profile`, `family`, `records`, `appointments`, `doctors`, `reviews`, `facilities`, `favourites`, `labs`, `prescriptions`). These are typed Supabase-direct calls + RPCs against the HAMS database (re-homed from the HAMS REST routes). This is the real backend surface.
- **REST client** — `src/services/api.ts`: `apiFetch<T>(path, init)` → `${EXPO_PUBLIC_API_URL}${path}` with `Authorization: Bearer <supabase token>`. Used only for a few Next.js routes: `/api/auth/signup`, `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/patients/me/profile-photo`.
- **Auth/session handling** — `src/services/authService.ts` wraps `api.auth.*` (Supabase) + the REST OTP/signup routes; normalizes errors to i18n `messageKey`. Session restore via `api.auth.getSession` / `onAuthStateChange`.
- **Env files** — `mobile/.env` (real, not printed) and `mobile/.env.example`. Var **names** (no values): `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_DATA_MODE`, `EXPO_PUBLIC_API_URL` (fallback `EXPO_PUBLIC_BACKEND_URL`), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_EXPO_PROJECT_ID`. Read & validated in `src/config/env.ts` (mock-mode fallbacks; staging/production throw on missing required vars).
- **Mock vs real selection** — `src/data/index.ts`: `repositories = EXPO_PUBLIC_DATA_MODE === "mock" ? mockRepositories : realRepositories`. UI/hooks depend only on `repositories` + `src/data/types.ts` — never on Supabase row shapes.
- **Does a real data layer exist?** Yes — `src/data/real/index.ts`. Wired today: **auth, patient profile, medical history, family, appointment-list**. Stubbed to empty/default in real mode: **discovery (specialties/recents/featured), doctor (search/get/reviews/mapClinics), notifications**. UI components never call APIs directly (rule already honored).

---

## 2. Core journey endpoint audit

| # | Capability | Backend (shared/REST) | Method | Auth | Status | Mobile change to connect |
|---|---|---|---|---|---|---|
| 1 | Sign in / session restore | `api.auth.signInWithPassword`, `getSession`, `onAuthStateChange`; REST `/api/auth/signup`,`/send-otp`,`/verify-otp` | Supabase auth + REST POST | public sign-in; token after | **Confirmed + wired** | None — verify against staging env |
| 2 | Current patient profile | `api.profile.getMyProfile` / `updateMyProfile`; REST `/api/patients/me/profile-photo` | Supabase select/update; multipart POST | required | **Confirmed + wired** | None |
| 3 | Dashboard data (specialties, recents, featured clinics) | none for specialties/recents/featured; doctors via `searchDoctors` | — | required | **Missing / Partial** — real `discoveryRepo` returns `[]`; no shared endpoints for specialties/recents/featured | Needs backend source (or derive recents from appointments + a specialties table); then wire `discoveryRepo` |
| 4 | Doctor search | `api.doctors.searchDoctors(db, q: DoctorSearch)` | Supabase `from("doctors")…` | required | **Confirmed available, NOT wired** (real stub → `[]`) | Map row→`Doctor`; point `doctorRepo.search` at it |
| 5 | Doctor details | `api.doctors.getDoctor(db, id)` → `doctors.*, facilities(name)` + `doctor_availability[]` | Supabase joined select | required | **Confirmed available, NOT wired** (real stub → `null`) | Map → `Doctor`; derive facility + availability |
| 6 | Clinic / location data | `getDoctor` returns `facility_id` + `facilities(name)`; `doctor_availability` branches; `api.facilities.*` | Supabase | required | **Partial** — a doctor's facility is available via `getDoctor`; standalone clinics list **uncertain** | Build booking clinic options from the doctor's facility/availability, not `mapClinics` |
| 7 | Availability / slots | `api.appointments.getAvailableSlots(db, { doctorId, date, branchId? })` → `AvailableSlot[]` (`{start, end?}`); template minus booked | Supabase `doctor_availability` + `appointments` | required | **Confirmed available, NOT wired** — no repo method; UI uses static `Doctor.slots_today` | Add a repo method; `schedule` screen fetches per selected date instead of `slots_today` |
| 8 | Create appointment | `api.appointments.bookAppointment(db, BookAppointmentInput)` → RPC `book_appointment_atomic` | Supabase RPC (atomic) | required | **Confirmed available, NOT wired** — `bookingStore.confirm()` fakes it | Add `BookingRepository.createBooking`; call after payment (payment stays mock now) |
| 9 | Booking confirmation / ID | return value of `book_appointment_atomic` (Json — appointment row/id) | Supabase RPC | required | **Partial/Mock** — fake `ML-#####` id + client-computed totals | Map RPC result → `BookingConfirmation`; feed the success screen |

`BookAppointmentInput` = `{ doctorId, facilityId, slotDate: "YYYY-MM-DD", slotStart: "HH:MM[:SS]", type, forFamilyMemberId?, isEmergency? }`. Also available (later batches): `cancelAppointment`, `rescheduleAppointment`, `rebookAppointment`, `claimWaitlistAppointment`, `listMyAppointments`.

---

## 3. Mock-to-real repository design

The boundary already exists (`src/data/repositories.ts` interfaces; mock & real both implement them; `src/data/index.ts` swaps by env). UI never changes — only the repo implementation does. Proposed additions in **bold**.

```ts
// EXISTING — already implemented in both mock and real
interface AuthRepository {
  signIn(input: SignInInput): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  restoreSession(): Promise<SessionUser | null>;
  subscribe(onChange: (u: SessionUser | null) => void): () => void;
  signOut(): Promise<void>;
  // …otp/reset/google
}

interface PatientRepository {
  getProfile(): Promise<PatientProfile>;
  updateProfile(patch: ProfilePatch): Promise<PatientProfile>;
  uploadProfilePhoto(asset: PhotoAsset): Promise<{ profile_photo_url: string }>;
}

// EXISTING interface — real impl needs WIRING (currently returns [])
interface DoctorRepository {
  search(params?: DoctorSearchParams): Promise<Doctor[]>;   // → searchDoctors
  get(id: string): Promise<Doctor | null>;                  // → getDoctor
  reviews(id: string): Promise<DoctorReviews>;              // ⚠ needs backend (see §4)
  mapClinics(): Promise<Clinic[]>;
  // PROPOSED additions (availability lives with the doctor):
  // getAvailableSlots(doctorId: string, dateISO: string): Promise<TimeSlot[]>;
  // facilitiesFor(doctorId: string): Promise<ClinicOption[]>;
}

// EXISTING interface — real impl returns [] (dashboard)
interface DashboardRepository /* = DiscoveryRepository */ {
  listSpecialties(): Promise<Specialty[]>;
  recentDoctors(): Promise<Doctor[]>;
  featuredClinics(): Promise<Clinic[]>;
}

// PROPOSED NEW repo — wraps the existing backend RPCs
interface BookingRepository {
  getDoctorSchedule(doctorId: string, dateISO: string): Promise<TimeSlot[]>; // → getAvailableSlots
  facilitiesFor(doctorId: string): Promise<ClinicOption[]>;                  // → getDoctor/facilities
  createBooking(input: CreateBookingInput): Promise<BookingConfirmation>;    // → bookAppointment
}

interface CreateBookingInput {
  doctorId: string; facilityId: string; dateISO: string; slotStart: string;
  type: "in_person"; forFamilyMemberId?: string;
}
interface BookingConfirmation { id: string; slotDate: string; slotStart: string; status: string; }
interface TimeSlot { start: string; end?: string; }       // raw "HH:MM"; UI formats to AM/PM
interface ClinicOption { id: string; name: string; distanceKm?: number; }
```

`bookingStore.confirm()` is replaced by `repositories.booking.createBooking(...)`; the success screen reads the returned `BookingConfirmation`. The screens themselves do not change.

---

## 4. Gaps and risks

- **Doctor reviews (per doctor): MISSING/UNCERTAIN.** `shared/src/api/reviews.ts` only has `listMyReviews` + `createReview` — no "reviews + summary for a doctor id". `DoctorRepository.reviews(id)` needs either a new backend query/RPC (aggregate rating + distribution) or it stays mock. Not on the core booking path, so it can lag.
- **Dashboard discovery: MISSING backend.** No shared endpoints for specialties / recent doctors / featured clinics. Options: add a specialties table/view + a "recent doctors" query (from past appointments) + a "featured clinics" flag. Until then, Dashboard discovery rows must stay mock or be hidden in real mode.
- **Model mismatches (mock → real):**
  - `Doctor`: mock is flat (`specialty: string`, `facility: string`, `fee_omr`, `slots_today: string[]`). Real `doctors` row has ids/joins (`facilities(name)`), a different fee column, and **no `slots_today`** — availability comes from `getAvailableSlots(doctorId, date)`. A row→`Doctor` mapper is required; the `schedule` screen must switch from `Doctor.slots_today` to per-date fetched slots.
  - Slot format: backend returns `"HH:MM"` (24h); UI shows `"10:30 AM"`. Add a `formatSlot()` at the mapping layer (don't push presentation into the repo).
  - `Appointment`: real `listMyAppointments` selects a much richer row (doctor/facility/family_member/payments) than the mock `Appointment` — extend the mapper when the Appointments module is built.
- **Slot-locking / overbooking:** handled server-side — `book_appointment_atomic` enforces slot uniqueness atomically, and `getAvailableSlots` already subtracts pending/confirmed/checked-in bookings. Mobile must handle the **"slot taken" race**: on booking error, surface a clear message and refresh the slot grid.
- **Duplicate booking prevention:** disable "Proceed/Confirm" while a create is in flight; ignore double-taps; treat the RPC as the single source of truth (no client-side id minting in real mode).
- **Required error states (per screen):** search/details/slots need loading + empty + error + retry; create-appointment needs in-flight, slot-conflict, auth-expired, and network-failure states; session-expired should route to sign-in.
- **Backend changes needed before mobile can fully integrate:** (a) doctor-reviews aggregation; (b) dashboard specialties/recents/featured source; (c) confirm the `book_appointment_atomic` return payload includes appointment `id` + status (and amounts if the success screen should show server totals).
- **Secrets — never in the Expo app:** only the **public** `EXPO_PUBLIC_SUPABASE_ANON_KEY` + URL belong in the client (RLS + SECURITY-DEFINER RPCs enforce access). Never embed the Supabase **service-role** key, Thawani **secret** key, or any server-only credential in the app or `EXPO_PUBLIC_*`. Payment/Thawani secrets stay server-side (payment remains mock here).

---

## 5. Recommended integration order

Connect per-repo behind `EXPO_PUBLIC_DATA_MODE` so each step is independently testable and reversible; do **not** flip everything at once.

1. **Verify the already-wired base** — run `staging` env and confirm Auth/session + Patient profile work end-to-end (no code change). Establishes the token + RLS path.
2. **Doctor Search → Doctor Details** (read-only, backend ready): wire `doctorRepo.search`/`get` to `searchDoctors`/`getDoctor` + a row→`Doctor` mapper. Unblocks the journey, lowest risk. **← recommended first connection step.**
3. **Availability / slots** (read-only): add `getAvailableSlots` to the repo; switch the `schedule` screen from `slots_today` to per-date fetch + `formatSlot()`.
4. **Create appointment** (the only write): add `BookingRepository.createBooking` → `bookAppointment`; replace `bookingStore.confirm()`; implement slot-conflict + duplicate-submit handling; keep payment mock (Review → mock payment → create on success, or create directly with a "payment pending" status per backend contract).
5. **Dashboard discovery + doctor reviews last** — require backend additions (§4); until then keep mock or hide in real mode.

Screens connectable first without blocking others: **Doctor Search and Doctor Details** (step 2). Booking create (step 4) depends on slots (step 3), which depends on details (step 2).
