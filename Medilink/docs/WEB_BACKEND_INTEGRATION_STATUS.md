# MediLink Web — Backend Integration Status

**App:** `@medilink/frontend` · **Date:** 2026-07-07 · **Branch:** `merge/vartika-ui`

**How data flows in this repo:**
```
Client Component ("use client")
  → createBrowserSupabaseClient()        // @/lib/supabase/client (SSR cookie/RLS)
  → api.<domain>.<fn>(db, …)             // @medilink/shared  = the repository layer
  → Supabase (RLS + SECURITY DEFINER RPC) → Postgres (reused HAMS schema)

Privileged side-effects (signup, OTP, payments, AI, PDF, data-export)
  → fetch {NEXT_PUBLIC_BACKEND_URL}/api/*  // separate Next.js app: Medilink/backend
```
There is **no React Query**; pages use `useState`/`useEffect` with the shared `api.*` layer (mobile parity). The shared modules were inspected and are **all real Supabase operations — no stubs**. Atomic booking/cancel/reschedule use SECURITY DEFINER RPCs (`book_appointment_atomic`, `cancel_appointment_safe`, `reschedule_appointment_atomic`), giving real overbooking protection.

Legend — ✅ Fully integrated & working · 🟡 Partial · ❌ Static / not wired

---

## 1. Full Integration Table

| Page | UI Exists | Backend Connected | Fully Working | Mock/Static Data | Status |
|---|:---:|:---:|:---:|---|:---:|
| `(auth)/sign-in` | ✅ | ✅ `api.auth.signInWithPassword` + Google | ✅ | — | ✅ |
| `(auth)/sign-up` | ✅ | ✅ `supabase.auth.signUp` | ✅ | — | ✅ |
| `(auth)/otp` | ✅ | ✅ `verifyOtp`/`resend` | ✅ | — | ✅ |
| `(auth)/forgot-password` | ✅ | ✅ `resetPasswordForEmail` | ✅ | — | ✅ |
| `(auth)/reset-password` | ✅ | ✅ `updateUser` | ✅ | — | ✅ |
| `auth/callback` (route) | ✅ | ✅ `exchangeCodeForSession` | ✅ | — | ✅ |
| `(auth)/language` | ✅ | 🟡 client i18n only | 🟡 | locale list | 🟡 |
| `(auth)/welcome` | ✅ | ❌ nav only | n/a | — | 🟦 |
| `(auth)/onboarding` | ✅ | ❌ | n/a | slide copy | 🟦 |
| `/dashboard` (home) | ✅ | ✅ profile/appts/rx/labs/docs/notifs | 🟡 | **HEALTH_METRICS vitals, marketing tiles** | 🟡 |
| `/dashboard/profile` | ✅ | ✅ profile/family/records/storage | ✅ | height/weight/blood UI-only fields | ✅ |
| `/dashboard/setup` | ✅ | ✅ profile/records/family | ✅ | — | ✅ |
| `/dashboard/appointments` | ✅ | ✅ list/slots/cancel/reschedule | ✅ | — | ✅ |
| `/dashboard/find-doctors` | ✅ | ✅ `searchDoctors` + nearby RPC | ✅ | SPECIALTIES filter list | ✅ |
| `/dashboard/find-doctors/[id]` | ✅ | 🟡 doctor real; reviews not wired | 🟡 | **SEED_REVIEWS + local-only submit** | 🟡 |
| `/dashboard/records` | ✅ | ✅ rx + labs + documents | ✅ | — | ✅ |
| `/dashboard/notifications` | ✅ | ✅ list/mark/delete (optimistic) | ✅ | — | ✅ |
| `/dashboard/payments` | ✅ | ✅ `GET /api/payments` | ✅ | cosmetic per-row fields | ✅ |
| `/payment-success` | ✅ | ✅ `POST /api/payments/verify` | ✅ | — | ✅ |
| `/dashboard/symptom-checker` | ✅ | ✅ `POST /api/ai/symptom-check` (stream) | ✅ | example prompts | ✅ |
| `/dashboard/lab-tests` | ✅ | ❌ no backend domain | ❌ | **full catalog + simulated booking** | ❌ |
| `/dashboard/surgeries` | ✅ | ❌ no backend domain | ❌ | **full catalog + fake "notify sent"** | ❌ |
| `/dashboard/articles` | ✅ | ❌ static dataset | n/a | all content | 🟦 |
| `/dashboard/articles/[id]` | ✅ | ❌ static dataset | n/a | all content | 🟦 |
| `/` landing | ✅ | ❌ | n/a | copy arrays | 🟦 |
| `/about` | ✅ | ❌ | n/a | copy | 🟦 |
| `/services` | ✅ | ❌ | n/a | copy | 🟦 |
| `/for-clinics` | ✅ | ❌ | n/a | copy | 🟦 |
| `/contact` | ✅ | ❌ **form has no target** | ❌ | fake success state | ❌ |
| `/splash` | ✅ | ❌ redirect | n/a | — | 🟦 |

**Shared component surfaces (not routes but workflow-bearing):**
| Component | Backend | Status |
|---|---|---|
| `DoctorBooking` (booking modal) | `api.family`, `getAvailableSlots`, `bookAppointment` (atomic), `POST /api/payments/checkout` → Thawani | ✅ |
| `NearbyDoctorsMap` | RPC `get_nearby_facilities` + doctors | ✅ |
| `SiteSearch` | live doctor search; static lab/surgery/page/article indexes | 🟡 |
| `DashboardNav` | real profile + `signOut`; **notification bell = hardcoded `NOTIF_ITEMS`** | 🟡 |

---

## 2. Backend Connected (fully working)

**Authentication** — sign-in (`api.auth.signInWithPassword` + `signInWithGoogle`), sign-up (`supabase.auth.signUp` with metadata + email redirect), OTP verify/resend, forgot/reset password, OAuth callback PKCE exchange. Loading + error states present. Route protection via `middleware.ts` (`/dashboard` → `/sign-in?next=`).

**Dashboard home** — parallel real reads: `api.profile.getMyProfile`, `api.appointments.listMyAppointments("upcoming")`, `api.prescriptions.listPrescriptions`, `api.labs.listLabResults`, `api.records.listDocuments`, `api.notifications.listNotifications`; write `markAllRead`. (Partial only because of cosmetic hardcoded vitals/marketing.)

**Profile** — `getMyProfile`/`updateMyProfile`, `getMedicalHistory`/`upsertMedicalHistory`, `listDocuments`/`addDocument`/`deleteDocument`/`getDocumentSignedUrl`, Supabase Storage upload (`patient-docs`), full `api.family` CRUD. Optimistic updates with rollback.

**Setup wizard** — profile update + medical-history upsert + family add on finish.

**Appointments** — `listMyAppointments("all")`, `getAvailableSlots` (real availability), `cancelAppointment`, `rescheduleAppointment`. Skeleton loaders + error banner.

**Find doctors** — `searchDoctors`; nearby map via `get_nearby_facilities` RPC + doctors.

**Records** — aggregates `listPrescriptions` + `listLabResults` + `listDocuments`.

**Notifications** — `listNotifications`, `markAllRead`, `markRead`, `deleteNotification`, optimistic + rollback.

**Payments** — history from `GET /api/payments` (cookie-authed); invoice preview/download/print client-side (jspdf/html2canvas). Checkout via `POST /api/payments/checkout` → Thawani hosted page; verification via `POST /api/payments/verify` (finalizes payment→paid, appointment→confirmed, idempotent with webhook).

**AI** — `POST /api/ai/symptom-check` streaming (urgency, conditions, remedies, recommended doctors → real booking modal).

---

## 3. Partial

- **Dashboard home** — real data + **fabricated `HEALTH_METRICS`** (heart rate/BMI/BP/Active Rx) with no vitals backend; marketing/service arrays hardcoded.
- **Doctor profile `[id]`** — doctor row real; **reviews are `SEED_REVIEWS` and "Leave a Review" only mutates local state** (never calls `api.reviews.createReview`).
- **`(auth)/language`** — switches i18n at runtime; **no server-side persistence** of preference.
- **SiteSearch** — doctor results live; lab/surgery/page/article results from static indexes.
- **DashboardNav bell** — real profile/sign-out; **notification dropdown hardcoded** (`NOTIF_ITEMS`), inconsistent with the real notifications page.
- **Prescriptions/Lab results (in records)** — read paths real; detail/share/analyte/mark-viewed not surfaced.

---

## 4. Static (data-bearing, needs backend)

- **`/dashboard/lab-tests`** — hardcoded `LABS` catalog; booking/payment simulated (`setBooked(true)`). No lab-test catalog/order backend exists (documented gap).
- **`/dashboard/surgeries`** — hardcoded `SURGERIES`; booking + "SMS/Email sent ✓" simulated. No surgeries domain in backend.
- **`/contact`** — contact form `handleSubmit` discards input and shows a fake "Message sent!"; no lead/support endpoint.

*(Static-by-design — not counted as gaps: landing, about, services, for-clinics, splash, welcome, onboarding, articles, articles/[id].)*

---

## 5. Broken / Inconsistent

- **Nav notification bell** shows 5 hardcoded notifications + fake unread badge while `/dashboard/notifications` uses the real `api.notifications` — contradictory sources.
- **Dashboard vitals** present fabricated medical numbers to the patient — should be removed or backed by data.
- **Contact form** simulates success — misleading.
- **OTP resend** swallows errors (try/finally, no catch); **reset-password** has no explicit recovery-session guard and English-only error strings.

---

## 6. Backend Built But NOT Consumed by Web

These endpoints/modules exist in `Medilink/backend` or `@medilink/shared` but no web page calls them — ready to wire:

| Capability | Where | Suggested consumer |
|---|---|---|
| Refunds | `/api/payments/[id]/refund`, `/api/payments/[id]/invoice`, `/api/payments/unpaid` | Payments / appointment cancel |
| Prescription PDF & share link | `/api/prescriptions/[id]/{generate-pdf,download,share-link}` | Prescription detail page |
| Data export & account deletion | `/api/users/me/{data-export,account}` | Settings / Privacy page |
| 2FA | `/api/auth/2fa/*` | (admin/doctor scope — likely N/A for patient web) |
| Google Calendar add | `/api/appointments/[id]/google` | Appointment detail |
| Push tokens/prefs | `/api/notifications/push`, `api.notifications.getPreferences/updatePreferences` | Settings |
| AI suggest-doctor / schedule-assist / scan-prescription | `/api/ai/*` | Discovery / post-visit / vault |
| Reviews | `api.reviews.listMyReviews/createReview` | Doctor page / My Reviews |
| Favourites | `api.favourites.*` | Doctor cards / favourites list |
| Facilities | `api.facilities.*` | Facility profile page |
| Waitlist / rebook | `claim_waitlist_appointment`, `rebook_appointment` RPCs | Appointments |
| Lab mark-viewed | `api.labs.markLabResultViewed` | Records / lab detail |

---

## 7. Totals & Percentages

**Denominator = 20 data-bearing/functional pages** (all 29 minus 9 static-by-design marketing/content).

| Metric | Count | % of 20 |
|---|---:|---:|
| ✅ Fully integrated & working | 14 | 70% |
| 🟡 Partial | 3 | 15% |
| ❌ Static / not wired | 3 | 15% |
| **Backend integration (full=1, partial=0.5)** | **15.5 / 20** | **~78%** |

**Across all 29 pages** (marketing counted as complete-by-design):
| Metric | Count |
|---|---:|
| Backend-connected (make real calls) | 16 |
| Fully working | 14 |
| Partial | 3 |
| Static needing backend | 3 |
| Static-by-design (OK) | 9 |
| Route handlers working | 1/1 |

**Shared `api.*` module integrity:** 12/12 domains are real Supabase ops (auth, profile, family, doctors, favourites, facilities, appointments, records, labs, prescriptions, notifications, reviews). **0 stubs.**

**Overall backend integration (patient web): ~78%** of the functional surface; **~95%** of the *implemented* functional surface is real (only lab-tests/surgeries/contact are non-wired, and those lack a backend domain).
