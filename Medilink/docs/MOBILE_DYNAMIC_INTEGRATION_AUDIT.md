# MediLink Mobile — Dynamic Integration Audit & Completion Plan

_Audit date: 2026-06-26. No new screens. Goal: make every **already-built** screen production-dynamic where the backend exists; identify genuine backend gaps._

Surfaces audited: mobile screens (`mobile/app`), data layer (`mobile/src/data`), shared transport (`mobile/shared/src/api`), HAMS backend (`d:\New folder (3)\hams-frontend`).

---

## Headline finding

The **shared API layer is far more complete than the mobile real-repositories wire up.** Most "static" screens are static only because the real repo method returns a stub (`[]`), even though `mobile/shared/src/api/*` already exposes a working function backed by a live HAMS endpoint / Supabase table. Phase 3 is therefore mostly **wiring + row→domain mapping**, not backend construction.

Genuine backend gaps (need new shared fn and/or HAMS work): **per-doctor public reviews list + rating distribution**, **specialty/category list endpoint**, **recently-visited doctors**, **facility-messages inbox**.

---

## Phase 1 — Screen inventory (30 built / 20 stub)

Built screens render real UI; **stub** screens render `<ScreenPreview>` (registry `built:false`) — they are **not** screens yet, so the "no new screens" rule means they are out of scope until separately approved.

### Built screens and their data dependence

| Screen | Status | Repo methods used | Notes |
|---|---|---|---|
| Splash / Welcome / Onboarding / Language | ✅ dynamic | local stores only | No backend needed |
| Auth: sign-in / sign-up / otp / forgot | ✅ real (hybrid) | `auth.*` | Email auth + session live; OTP/Google per earlier scope |
| **Dashboard** | 🟡 partial | `patient.getProfile` ✅real · `appointment.listUpcoming` 🟡mock · `discovery.recentDoctors`/`featuredClinics`/`listSpecialties` ❌mock-stub | Greeting/profile real; **discovery + upcoming still mock** |
| Profile | 🟡 partial | `patient.getProfile` ✅real · `medicalHistory.get` 🟡mock · `family.list` 🟡mock | Profile real; history/family mock (real impl exists, not routed) |
| Edit Profile | 🟡 partial | `patient.*` ✅real · `medicalHistory.upsert` 🟡mock | |
| Me (family) / Family add / Family edit / Patient switcher | 🟡 mock | `family.*` | **Real impl exists**, hybrid routes to mock |
| Medical History | 🟡 mock | `medicalHistory.*` | **Real impl exists**, hybrid routes to mock |
| Doctor Search / Filters / Specialties / Map | 🟡 partial | `doctor.search` ✅real · `discovery.listSpecialties` ❌mock · `doctor.mapClinics` ❌mock | Search real; specialties + map pins mock |
| Doctor Details | ✅ real | `doctor.get` | Live |
| Doctor Reviews | 🟡 mock | `doctor.reviews` | **Backend gap** — no per-doctor reviews+distribution endpoint |
| Booking: schedule / review / success | 🟡 mock | `doctor.get` ✅ · slots = `DEFAULT_SLOTS` mock · confirm = local `bookingStore` mock | Booking **create + slots not wired** (backend exists) |
| Notifications / Facility messages | 🟡 mock | `notification.list` / `facilityMessages` | **Stub in real repo**; shared API exists for notifications |
| Settings / Notification prefs / Appearance | 🟡 partial | `notification.getPreferences/updatePreferences` ❌mock-stub; `auth.signOut` ✅ | Prefs stubbed in real repo |

**Boundary check:** ✅ Zero violations — no screen imports `@medilink/shared`, `supabase`, or the api service directly. All data flows UI → hooks → repositories. State handling (loading/error+retry/empty) is present on essentially all data-driven built screens.

---

## Phase 2 — Backend gap analysis (per stubbed capability)

| Capability (mobile) | Shared API exists? | HAMS backend exists? | Verdict |
|---|---|---|---|
| Profile get/update + photo | ✅ `profile.*`, `apiFetch` | ✅ `/api/patients/me` | **Already real** |
| Family CRUD | ✅ `family.*` | ✅ `/api/patients/me/family` | **Wire only** (real impl exists, route in hybrid) |
| Medical history get/upsert | ✅ `records.getMedicalHistory/upsert` | ✅ `/api/patients/me/medical-history` | **Wire only** (real impl exists) |
| Appointments upcoming/past | ✅ `appointments.listMyAppointments` | ✅ RPC + `/api/appointments` | **Wire only** (real impl exists) |
| Available slots | ✅ `appointments.getAvailableSlots` | ✅ `/api/slots`, `doctor_availability` | **Connect** (add repo method) |
| Book appointment | ✅ `appointments.bookAppointment` (RPC `book_appointment_atomic`) | ✅ `/api/appointments/book` | **Connect** (add repo method; replaces `bookingStore.confirm()`) |
| Notifications list | ✅ `notifications.listNotifications` (+ unreadCount/markRead) | ✅ `in_app_notifications` | **Connect** (real repo currently stub) |
| Notification preferences | ✅ `notifications.getPreferences/updatePreferences` | ✅ `notification_preferences` table / profiles.notification_prefs | **Connect** — ⚠️ verify field shape (mobile prefs model vs backend `{push,email,sms,categories}`) |
| Featured clinics / facilities | ✅ `facilities.listFacilities`, `nearbyFacilities` | ✅ `/api/facilities`, `facilities` table | **Connect** (map facility→Clinic) |
| Map clinics (fee pins) | ✅ `facilities.listFacilities/nearbyFacilities` | ✅ | **Connect** |
| Recently-visited doctors | ⚠️ derive from `appointments.listMyAppointments("past")` | ✅ appointments table | **Derive** — no dedicated endpoint; build from past appts (unique doctors) |
| Specialty / category list | ❌ no list fn (only a `specialty` *filter*) | ⚠️ derivable from `doctors.specialty` distinct | **Gap** — derive client-side from a doctor query, or add a shared helper |
| Per-doctor reviews + distribution | ❌ `reviews` only has `listMyReviews` (own) + `createReview` | ⚠️ `/api/reviews` GET is facility/admin-oriented; `doctors.avg_rating`+`review_count` exist but no public per-doctor review **list** or **histogram** | **Real gap** — needs a shared `reviews.listForDoctor(doctorId)` + distribution (verify RLS allows patient read), possibly a HAMS endpoint |
| Facility messages (inbox) | ❌ | ⚠️ `/api/facilities/[id]/announcements` exists but is broadcast-out, not a patient inbox feed | **Gap** — product/endpoint decision needed |

**Net:** ~9 capabilities are *wire-only or connect* (backend ready). ~4 are real gaps. **No database tables are missing for the core journey.**

---

## Phase 3 — Proposed execution (batched, each its own commit, mock stays default)

> Mechanism: extend `mobile/src/data/real/index.ts` with real impls + row→domain mappers, then expand the `hybridRepositories` composition in `src/data/index.ts`. `DATA_MODE=mock` (dev default) is unchanged; only staging/production pick up the new wiring. Each batch keeps mock as fallback for anything not yet connected so no screen goes empty.

- **Batch A — Dashboard priority** (you named this): `discovery.featuredClinics` → `facilities.listFacilities`; `discovery.recentDoctors` → derived from past appointments; `appointment.listUpcoming` → route real; specialties → derive or keep mock pending decision.
- **Batch B — Profile cluster**: route `family.*` + `medicalHistory.*` to the **existing** real impls (Profile, Me, Family add/edit, Patient switcher, Medical History).
- **Batch C — Notifications**: wire `notification.list`, `getPreferences`, `updatePreferences` (verify prefs field mapping).
- **Batch D — Booking real**: add `availability.getSlots` + `appointment.create` repo methods; wire schedule screen slots + replace `bookingStore.confirm()` with the real RPC. ⚠️ Terminal "Appointments list/details" screens are **stubs (not built)** — booking can complete and route to dashboard, but the appointments-list destination can't be made dynamic without building that screen (out of scope under "no new screens").
- **Gaps to resolve separately**: per-doctor reviews list+distribution (Doctor Reviews screen stays mock until then); specialties list source; facility-messages inbox.

---

## Constraints I cannot lift myself

- **No staging credentials / test user** and **no emulator/device** on my side → I can write and typecheck/lint the integration, but **cannot run it or verify real responses**. Device verification against staging remains yours.
- Wiring is safe for dev (mock is default); risk is only in **staging with an unseeded DB** → screens could show empty/error states. The per-batch mock-fallback design mitigates this.
