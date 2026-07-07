# MediLink — Web UI Scope Audit

**App audited:** `@medilink/frontend` (Next.js 15 App Router) at `Medilink/frontend`
**Data layer:** `@medilink/shared` `api.*` modules → Supabase (RLS/RPC) + a few privileged HTTP routes to `Medilink/backend`
**Audit date:** 2026-07-07
**Method:** Full-source inspection of every `page.tsx`, `route.ts`, shared `api/*` module, middleware and key components. Findings reflect the **current** branch (`merge/vartika-ui`), which is substantially more integrated than the prior audit dated 2026-07-02 (`WEB_DYNAMIC_INTEGRATION_AUDIT.md`, now superseded for the pages it covered).

---

## 1. Executive Summary

The MediLink patient **web** app is a real, working patient portal. The core revenue journey — **register → verify → sign in → discover doctors → view doctor → book → pay (Thawani) → confirm → manage appointments → view records** — is genuinely wired end-to-end against Supabase and the privileged backend, not mocked.

**Headline numbers (patient web only; clinic/admin portals are explicitly out of scope for this app):**

| Metric | Value |
|---|---:|
| Total UI pages (`page.tsx`) | **29** |
| Route handlers (`route.ts`) | 1 (`auth/callback`) |
| Dynamic routes (`[id]`) | 2 (`find-doctors/[id]`, `articles/[id]`) |
| ✅ Fully integrated & working | **14** |
| 🟡 Partially integrated | 3 |
| ❌ Static / needs backend (data-bearing) | 3 |
| 🟦 Static-by-design (marketing/content) | 9 |
| Backend-connected pages (make real data calls) | 16 |
| Whole modules missing vs plan | 3 (Settings, Ratings&Reviews-web, Messaging) |
| Additional pages required for plan completeness | 3–5 core (see §5) |

**Verdict:** The **core patient loop is production-grade.** The app is **not yet feature-complete** against the Delivery Plan V2 (Settings + real Ratings/Reviews missing; several backend endpoints built but not surfaced) and is **partially aligned** with the broader Phase 2 scope doc (telehealth, secure messaging, public SEO pages, favourites, waitlist/check-in/refund UI absent). Estimated **~80% complete** against the Delivery Plan V2 patient-web scope; further from the full Phase 2 doc.

---

## 2. Existing Page Inventory

Legend — ✅ Fully integrated · 🟡 Partial · ❌ Static (data gap) · 🟦 Static-by-design

### Public / marketing (`src/app/*`)
| Route | Purpose | Data source | Status |
|---|---|---|---|
| `/` | Marketing landing | Hardcoded copy arrays | 🟦 |
| `/about` | About/mission/timeline | Hardcoded | 🟦 |
| `/services` | Services overview | Hardcoded | 🟦 |
| `/for-clinics` | Clinic marketing | Hardcoded | 🟦 |
| `/contact` | Contact + form | **Form has no submit target** (local state only) | ❌ |
| `/splash` | Splash → `/welcome` redirect | none | 🟦 |

### Auth flow (`src/app/(auth)/*` + callback)
| Route | Purpose | Data source | Status |
|---|---|---|---|
| `(auth)/welcome` | Entry choice | nav only | 🟦 |
| `(auth)/onboarding` | 3-slide carousel | hardcoded slides | 🟦 |
| `(auth)/language` | EN/AR selection | client i18n (`setLocale`), **no server persistence** | 🟡 |
| `(auth)/sign-in` | Email/pw + Google | `api.auth.signInWithPassword`, `signInWithGoogle` | ✅ |
| `(auth)/sign-up` | Registration | `supabase.auth.signUp` (+ metadata, email redirect) | ✅ |
| `(auth)/otp` | Signup OTP verify + resend | `supabase.auth.verifyOtp` / `resend` | ✅ |
| `(auth)/forgot-password` | Request reset email | `supabase.auth.resetPasswordForEmail` | ✅ |
| `(auth)/reset-password` | Set new password | `supabase.auth.updateUser` | ✅ |
| `auth/callback` (route) | OAuth/email PKCE exchange | `exchangeCodeForSession` | ✅ |

### Dashboard / patient portal (`src/app/dashboard/*` + `payment-success`)
| Route | Purpose | Data source | Status |
|---|---|---|---|
| `/dashboard` | Home hub | `api.profile`, `api.appointments`, `api.prescriptions`, `api.labs`, `api.records`, `api.notifications` (+ `markAllRead`) | 🟡 (real data; **health-metric vitals + marketing tiles hardcoded**) |
| `/dashboard/profile` | Profile + family + med-history + doc vault | `api.profile`, `api.records`, `api.family`, `api.labs`, `api.prescriptions`, Supabase Storage | ✅ |
| `/dashboard/setup` | 4-step onboarding wizard | `api.profile`, `api.records`, `api.family` | ✅ |
| `/dashboard/appointments` | List/filter + cancel + reschedule | `api.appointments.*` (list/slots/cancel/reschedule) | ✅ |
| `/dashboard/find-doctors` | Doctor search + nearby map | `api.doctors.searchDoctors`, RPC `get_nearby_facilities` | ✅ |
| `/dashboard/find-doctors/[id]` | Doctor profile + booking + reviews | `supabase.from("doctors")` (real); **reviews `SEED_REVIEWS` mock, submission not persisted** | 🟡 |
| `/dashboard/records` | Unified records feed | `api.prescriptions`, `api.labs`, `api.records` | ✅ |
| `/dashboard/notifications` | In-app notification centre | `api.notifications.*` (list/mark/delete, optimistic) | ✅ |
| `/dashboard/payments` | Payment history + invoice PDF | `GET {BACKEND_URL}/api/payments` (real) | ✅ |
| `/payment-success` | Post-Thawani verify + recap | `POST {BACKEND_URL}/api/payments/verify` | ✅ |
| `/dashboard/symptom-checker` | AI symptom triage + doctor rec | `POST {BACKEND_URL}/api/ai/symptom-check` (streaming) | ✅ |
| `/dashboard/lab-tests` | Lab-test catalog + booking | **Hardcoded catalog; booking/payment simulated** (no backend domain) | ❌ |
| `/dashboard/surgeries` | Surgery catalog + booking | **Hardcoded catalog; booking/notify simulated** (no backend domain) | ❌ |
| `/dashboard/articles` | Health-library grid | Static `lib/data/articles.ts` | 🟦 |
| `/dashboard/articles/[id]` | Article detail | Static `lib/data/articles.ts` | 🟦 |

**Booking modal** (`components/dashboard/DoctorBooking.tsx`) is a real workflow surface: `api.appointments.bookAppointment` (atomic RPC) → `POST /api/payments/checkout` → redirect to Thawani `checkoutUrl`. (`card`/`cash` intentionally book-as-pending without charging.)

---

## 3. Planned vs Actual Comparison

### Against MediLink Agile Delivery Plan V2 (primary plan)
Plan target: **15 web routes = 11 core responsive + 4 auth.**

| Plan area (web) | Planned | Actual | Status |
|---|---|---|---|
| Splash & Onboarding | 1 | splash/welcome/onboarding/language | ✅ (exceeds) |
| Authentication | 4 | sign-in, sign-up, otp, forgot, reset (5) | ✅ (exceeds) |
| Dashboard | 1 | `/dashboard` | 🟡 (real + fake vitals) |
| Patient Profile | 1 | `/dashboard/profile` | ✅ |
| Family Management | 1 | folded into profile (no standalone) | 🟡 (functional, no dedicated route) |
| Doctor Discovery | 1 | `/dashboard/find-doctors` | ✅ |
| Doctor Profile | 1 | `/dashboard/find-doctors/[id]` | 🟡 (reviews mock) |
| Appointment Booking | 1 | booking modal (`DoctorBooking`) | ✅ |
| Appointments | 1 | `/dashboard/appointments` | ✅ |
| Payments | 1 | `/dashboard/payments` (+ payment-success) | ✅ |
| Document Vault | 1 | folded into profile/records | 🟡 (no standalone route) |
| Lab Results | 1 | folded into records feed | 🟡 (no analyte-detail view) |
| Prescriptions | 1 | folded into records feed | 🟡 (no detail / send-to-pharmacy) |
| Notifications | 1 | `/dashboard/notifications` | ✅ |
| AI Features | 1 | `/dashboard/symptom-checker` | ✅ |
| Ratings & Reviews | 0 web | reviews shown on doctor page (mock) | ❌ (not persisted) |
| Settings | 1 | **none** | ❌ MISSING |

**Route count:** Actual functional route count **meets/exceeds** the planned 15 (29 pages exist). The gap is **module depth**, not route quantity.

### Additional pages that exist beyond the plan
`/dashboard/setup`, `/dashboard/lab-tests`, `/dashboard/surgeries`, `/dashboard/articles`(+`[id]`), `/about`, `/services`, `/for-clinics`, `/contact` — a mix of value-add (setup wizard) and marketing/content.

### Against Phase 2 Scope doc (broader)
The Phase 2 doc scopes a much larger surface (clinic portal, super-admin, telehealth video, secure messaging, public SEO pages). For the **patient web** slice, Phase-2-must-ship items that are **absent or mock** here: secure doctor messaging, telehealth (video/pre-consult/waiting room), AI post-visit summary, ratings & reviews (real), settings + privacy/data-export/delete, public SEO doctor/clinic profile pages, favourites UI, waitlist/web-check-in/refund UI.

---

## 4. Module Coverage

| Module | UI | Backend wired | Status |
|---|---|---|---|
| Authentication (email/pw, OTP, Google, reset) | ✅ | ✅ | ✅ Complete |
| Dashboard home | ✅ | ✅ (partial: fake vitals) | 🟡 Partial |
| Patient Profile | ✅ | ✅ | ✅ Complete |
| Family Management | ✅ (in profile) | ✅ `api.family` | ✅ Complete (no standalone route) |
| Medical History | ✅ | ✅ `api.records` | ✅ Complete |
| Document Vault | ✅ (in profile) | ✅ Storage + `api.records` | ✅ Complete (no standalone route) |
| Doctor Discovery | ✅ | ✅ `api.doctors` + nearby RPC | ✅ Complete |
| Doctor Profile | ✅ | ✅ doctor row | 🟡 Partial (reviews mock) |
| Facility Profile | ❌ | `api.facilities` exists, unused on web | ❌ Missing UI |
| Appointment Booking | ✅ | ✅ atomic RPC | ✅ Complete |
| Appointments (list/cancel/reschedule) | ✅ | ✅ | ✅ Complete |
| Appointments — waitlist/check-in/rebook | ❌ | RPCs exist (`claim_waitlist`, `rebook`), no web UI | ❌ Missing UI |
| Payments (Thawani + invoices) | ✅ | ✅ | ✅ Complete |
| Payments — refund | ❌ | `/api/payments/[id]/refund` exists, no patient UI | ❌ Missing UI |
| Lab Results (view) | ✅ (in records) | ✅ `api.labs` | ✅ Complete (read) |
| Lab Tests (catalog/order) | ✅ | ❌ no backend domain | ❌ Static |
| Prescriptions (view) | ✅ (in records) | ✅ `api.prescriptions` | 🟡 Partial (no detail/share; backend share/pdf endpoints unused) |
| Surgeries | ✅ | ❌ no backend domain | ❌ Static |
| Notifications | ✅ | ✅ `api.notifications` | ✅ Complete |
| Messaging (secure doctor chat) | ❌ | ❌ | ❌ Missing |
| AI — Symptom checker | ✅ | ✅ streaming endpoint | ✅ Complete |
| AI — Doctor suggestion | ✅ (in symptom-checker) | ✅ | ✅ Complete |
| AI — Post-visit summary / schedule-assist | ❌ | `/api/ai/schedule-assist` exists, unused | ❌ Missing UI |
| Ratings & Reviews | 🟡 (mock on doctor page) | `api.reviews.createReview` exists, unused | ❌ Not persisted |
| Favourites | ❌ | `api.favourites` exists, unused | ❌ Missing UI |
| Settings | ❌ | notification prefs endpoint exists | ❌ Missing |
| Privacy / Data export / Delete account | ❌ | `/api/users/me/data-export`, `/account` exist, unused | ❌ Missing |
| Telehealth (video/pre-consult/waiting room) | ❌ | ❌ | ❌ Missing |
| Public SEO doctor/clinic pages | ❌ | data available | ❌ Missing |
| Landing / About / Services / Contact | ✅ | static (contact form dead) | 🟦 by design |
| Articles / Health library | ✅ | static dataset | 🟦 by design |

---

## 5. Missing Pages (per module)

**Appointments** — Current: list, detail card, cancel, reschedule. Missing: **Web check-in**, **Waitlist / join & claim** (RPC exists), **Follow-up rebook UI** (RPC exists), **Refund request** (endpoint exists).

**Payments** — Current: history, invoice PDF, Thawani checkout + verify. Missing: **Refund UI**, saved-cards management.

**Prescriptions** — Current: read-only rows in records feed. Missing: **Prescription detail**, **send-to-pharmacy / 24h share link** (backend `share-link` + `generate-pdf` endpoints unused), **download PDF**.

**Lab Results** — Current: rows in records feed. Missing: **Analyte detail vs reference-range view + AI note**, mark-viewed wiring (`markLabResultViewed` unused).

**Ratings & Reviews** — Current: mocked reviews on doctor page. Missing: **real review submission** (`api.reviews.createReview`), **my-reviews list**, post-visit "rate your visit".

**Settings & Privacy** — Missing entirely: **Settings** (theme/RTL/notification prefs), **Privacy & Data** (export data, delete account, consent) — all have backend endpoints ready.

**Favourites** — Missing **favourite doctors/facilities UI** (`api.favourites` ready).

**Facility Profile** — Missing dedicated **clinic/facility profile page** (`api.facilities` ready).

**Lab Tests / Surgeries** — Catalogs exist as static UI; **no backend domain** — either build ordering backend or keep as informational (documented gap).

**Contact** — Form renders a fake "sent" state; **no lead/support endpoint** — wire or remove the success illusion.

---

## 6. Missing Modules (whole)

1. **Settings / Privacy / Data-export & account-deletion** — required by Delivery Plan V2 ("Settings, appearance & accessibility, privacy, data export") and Phase 2 ("export data, delete account, consent toggles"). Backend endpoints exist and are unconsumed.
2. **Ratings & Reviews (functional)** — required capability; currently mock-only, not persisted despite `api.reviews` existing.
3. **Secure Messaging** — Phase 2 must-ship ("secure doctor messaging, 7-day window"). Absent on web (no UI, no backend surfaced).
4. *(Phase 2 broader, likely fast-follow / clarify scope)* **Telehealth video**, **Public SEO doctor/clinic pages**, **Favourites**, **Facility profile**.

---

## 7. UX Flow Validation (patient journey)

| Step | Works? | Notes |
|---|---|---|
| Signup | ✅ | Real `supabase.auth.signUp` |
| OTP verify | ✅ | Real |
| Login | ✅ | Real + Google OAuth |
| Dashboard | ✅ | Real appts/notifs/profile (vitals cosmetic) |
| Search doctor | ✅ | Real `searchDoctors` + nearby map |
| Doctor details | ✅ | Real doctor; ⚠️ reviews are mock |
| Booking | ✅ | Atomic RPC, overbooking-safe, slot lock |
| Payment | ✅ | Real Thawani hosted checkout |
| Confirmation | ✅ | Real verify endpoint |
| Appointments | ✅ | List/cancel/reschedule real; ⚠️ no check-in |
| Medical Records | ✅ | Real aggregate (Rx + labs + docs) |
| AI | ✅ | Real streaming symptom checker |
| Notifications | ✅ | Real (note: nav-bar bell dropdown is a separate hardcoded list — inconsistent with the real page) |
| Profile | ✅ | Real CRUD + family + vault |
| Settings | ❌ | **No page — journey dead-ends** |

**Route protection:** `middleware.ts` now correctly gates `/dashboard/*` → `/sign-in?next=` (the mismatch flagged in the 2026-07-02 audit is fixed).

**Broken/weak steps:** (1) no Settings destination; (2) doctor-page reviews are fake and unsubmittable; (3) nav-bell notifications hardcoded while the notifications page is real; (4) dashboard health vitals are fabricated (no vitals backend).

---

## 8. Recommendations (priority order)

1. **Build Settings + Privacy/Data pages** — wire notification prefs, theme/RTL, data-export & account-deletion (backend ready). Closes the biggest module gap.
2. **Make Ratings & Reviews real** — replace `SEED_REVIEWS`/local submit with `api.reviews.listMyReviews`/`createReview`; add post-visit rating entry.
3. **Fix consistency defects** — replace `DashboardNav` `NOTIF_ITEMS` with `api.notifications.unreadCount`/list; remove or clearly label dashboard `HEALTH_METRICS` (no data source).
4. **Surface built-but-unused backend** — refund UI, prescription share/PDF, lab analyte detail + mark-viewed, waitlist/rebook/web-check-in, favourites.
5. **Resolve static catalogs** — decide whether Lab-tests/Surgeries ordering gets a backend or becomes informational; wire or remove the Contact form's fake success.
6. **Clarify Phase 2 scope** — telehealth video, secure messaging, public SEO pages: confirm in/out for patient web (Delivery Plan V2 excludes some; Phase 2 doc includes them).

---

## 9. Final Verdict

The MediLink patient **web** app has a **solid, genuinely integrated core** — auth, discovery, booking, payment, appointments, records, notifications and AI triage all hit real Supabase/backend with loading + error states and overbooking-safe atomic booking. This is well beyond a prototype.

However it is **not feature-complete**: **Settings and functional Ratings/Reviews are missing**, several **backend capabilities are built but not surfaced** (refunds, prescription share, waitlist/check-in, favourites, data-export), and a few surfaces remain **mock/static** (lab-tests, surgeries, contact form, dashboard vitals, nav-bell notifications).

- **Ready for production (full patient web):** ❌ No — close the Settings/Reviews gaps and fix the mock inconsistencies first.
- **Core booking-and-payment loop shippable for demo/pilot:** ✅ Yes.
- **Ready for full Phase 2 scope:** ❌ No — telehealth, messaging, public SEO, reviews, settings outstanding.
- **Against Delivery Plan V2 patient-web scope:** ~**80% complete**.
