# Vartika Frontend Integration Audit

**Date:** 2026-07-29 · **Branch:** `development` (post `ae71856`)
**Scope:** every page added or modified by `merge/vartika-ui` (merge base `7d81a81` → `46bdc5e`)

Extends — does not duplicate — [`WEB_DYNAMIC_INTEGRATION_AUDIT.md`](./WEB_DYNAMIC_INTEGRATION_AUDIT.md).
That document's §4 🔴 items (fake auth, middleware route mismatch) are **now resolved**;
this document records what remained after the merge and what was integrated.

---

## 1. Pages audited — 26

`(auth)/layout` · `(auth)/otp` · `(auth)/sign-in` · `(auth)/sign-up` · `about` · `contact` ·
`dashboard` · `dashboard/appointments` · `dashboard/articles` · `dashboard/articles/[id]` ·
`dashboard/find-doctors` · `dashboard/find-doctors/[id]` · `dashboard/lab-tests` ·
`dashboard/notifications` · `dashboard/payments` · `dashboard/profile` · `dashboard/records` ·
`dashboard/settings` (added) · `dashboard/setup` · `dashboard/surgeries` ·
`dashboard/symptom-checker` · `for-clinics` (deleted → restored) · `payment-cancel` (added) ·
`payment-success` · `services` · `splash/layout`

---

## 2. Classification

### ✅ Fully dynamic — 17

| Page | Data source |
|---|---|
`(auth)/sign-in` | `supabase.auth` + `api.auth` |
`(auth)/sign-up` | `supabase.auth.signUp` → OTP → `postSignupDestination` |
`(auth)/otp` | `verifyOtp` → `postSignupDestination` |
`dashboard` | `api.profile`, `api.appointments`, `api.prescriptions`, `api.labs`, `api.records`, `api.notifications` — **+ health snapshot, integrated below** |
`dashboard/appointments` | `api.appointments.*`, `useMyProfile`, check-in RPC |
`dashboard/find-doctors` | `api.doctors.searchDoctors`, `api.specialties.listSpecialties`, `doctor_availability`, favourites |
`dashboard/find-doctors/[id]` | `doctors` + `facilities(name)`, `doctor_availability`, `api.reviews.*` |
`dashboard/notifications` | `api.notifications.*` (incl. `title_ar`/`body_ar`) |
`dashboard/payments` | `GET /api/payments` (raw `fetch`, credentialed) |
`dashboard/profile` | `api.profile`, `api.family`, `api.records` — 25 API calls |
`dashboard/records` | `api.records.*`, `api.prescriptions`, `api.labs` |
`dashboard/settings` | `api.profile`, data export, account deletion, 2FA |
`dashboard/setup` | `api.profile.updateMyProfile` |
`dashboard/symptom-checker` | `POST {BACKEND_URL}/api/ai/symptom-check` (SSE stream) |
`payment-success` | `/api/payments/verify` |
`payment-cancel` | `releaseUnpaidHold` |
`for-clinics` | static marketing content (correct for its purpose) |

### 🟡 Partially dynamic — 2

| Page | Dynamic | Static remainder |
|---|---|---|
`dashboard/lab-tests` | `?q=` seeding, i18n | **`LABS` catalog (16 entries), prices, providers, slots, booking** |
`dashboard/surgeries` | `?q=` seeding, `useMyProfile`, i18n | **`SURGERIES` catalog, prices, hospitals, slots, booking** |

### ⬜ Fully static — 7 (correctly so)

`about` · `contact` · `services` · `dashboard/articles` · `dashboard/articles/[id]` ·
`(auth)/layout` · `splash/layout`

Marketing/legal copy and 8 curated health articles from `lib/data/articles.ts`. There is no
CMS and no `articles` table; static content is the right call for editorial copy. Not a defect.

---

## 3. Integrations completed

### 3.1 🔴 Dashboard Health Snapshot — fabricated clinical data removed

**The most serious finding.** `dashboard/page.tsx` rendered a hardcoded array to *every*
patient regardless of identity:

```
Heart Rate     72 bpm    Normal
BMI            22.4      Healthy
Blood Pressure 118/78    Normal
Active Rx      2         Ongoing
```

A patient could read "Blood Pressure 118/78 · Normal" as their own reading. This is the same
class of defect already fixed on mobile (`MOBILE_COMPLETION_TRACKER` item 1.1, **Critical**),
and it was flagged 🔴 P1 in the earlier web audit (§3.3, §5) but never closed.

**Verified: heart rate, BMI and blood pressure cannot be sourced.** No vitals/measurements
table exists in any of the 152 migrations, and `medical_histories` has no height or weight
(only `allergies`, `conditions`, `medications`, `surgeries`, `smoking_status`, `notes`).

**Resolution — all four cards now show real data, layout untouched:**

| Card | Source |
|---|---|
Blood Group | `patient_profiles.blood_group` (`"unknown"` sentinel → "Not set") |
Prescriptions | `api.prescriptions.listPrescriptions` |
Allergies | `medical_histories.allergies` via `api.records.getMedicalHistory` |
Lab Reports | `api.labs.listLabResults`, with `flagged_count > 0` surfaced as the badge |

No new API client, hook or endpoint. The page already ran one `Promise.all`; medical history
was added to it as a seventh call. The 4-up grid, gradients, badges, RTL and Arabic strings are
unchanged.

### 3.2 🟠 Global search silently dropped the user's query

`SiteSearch` has always linked to `/dashboard/find-doctors?q=<term>`
(`SiteSearch.tsx:137`), but `find-doctors` initialised `search` to `""` and **never read the
param** — so searching from the global box landed on a full, unfiltered doctor list.

Fixed by seeding state from `?q=` on mount, using the exact `Suspense` + `useSearchParams`
pattern `lab-tests` and `surgeries` already use (page split into `FindDoctorsPage` wrapper +
`FindDoctorsInner`). No new dependency or convention.

### 3.3 🟠 Dead symptom tiles on the dashboard

The six "A doctor for every concern" tiles were `<button>` elements with **no `onClick`** —
they looked interactive and did nothing.

Now `<Link>`s to `/dashboard/find-doctors?q=<specialty>`, reusing the convention fixed in §3.2.

Deliberately **not** replaced with the `specialties` table: these are symptom-led prompts
("Cold, cough or fever"), not clinical specialty names. Swapping them would change the
section's meaning — a redesign, which was out of scope. Each entry gained a `q` field mapping
the complaint to the specialty the doctor search understands.

### 3.4 🔴 `/dashboard/settings` was unprotected

`dashboard/settings` was **added** by Vartika, so it was never added to
`PROTECTED_PREFIXES` in `lib/supabase/middleware.ts`, and the page has no client-side guard.
A signed-out visitor reached the account-management shell containing GDPR data export,
account deletion and 2FA.

Server reads still failed under RLS, so **no PHI leaked** — but every action broke obscurely
and the UI should never have rendered. Added to `PROTECTED_PREFIXES`.

---

## 4. Backend endpoints still missing

Documented, **not** mocked over. Aligns with `WEB_DYNAMIC_INTEGRATION_AUDIT.md` §3.

| # | Missing | Blocks | Notes |
|---|---|---|---|
| 1 | **Surgeries domain** | `dashboard/surgeries` | No `api.surgeries`, no procedures table, no ordering endpoint. The whole page has no data source. |
| 2 | **Lab-test catalog + ordering** | `dashboard/lab-tests` | `api.labs` only *reads results* (`listLabResults`, `getLabResultSignedUrl`). No catalog browse, no order placement. `lab_results` is patient results (`patient_id`, `file_url`, `uploaded_by`), not a bookable catalog. |
| 3 | **Contact form** | `contact` | No contact/lead/support endpoint. |
| 4 | **Locale persistence** | language switch | Runtime-only; nothing persists server-side. |
| 5 | **Articles/CMS** | `dashboard/articles` | No `articles` table. Static is acceptable for editorial copy. |
| 6 | Vitals / measurements | Health Snapshot | Closed by §3.1 by using data that *does* exist. Heart rate / BMI / BP would need a new domain. |

Both in-code gap comments (`lab-tests/page.tsx:11`, `surgeries/page.tsx:11`) are accurate and
were left in place.

---

## 5. Production blockers

| # | Blocker | Severity |
|---|---|---|
| **B1** | **`lab-tests` and `surgeries` fake a completed purchase.** The final step's button is `onClick={() => setBooked(true)}` (`lab-tests:423`, `surgeries:479`). It creates no appointment, takes no payment and persists nothing — then shows a success screen. A patient can complete a "Pay OMR 25" or "Pay OMR 4,500" flow and receive confirmation for a booking that **does not exist**. Providers ("Al Shifa Diagnostics", "Royal Ortho & Spine Centre") and slots are fabricated. **Cannot be integrated — no catalog/ordering backend (§4.1, §4.2).** Must be gated behind a feature flag, converted to an enquiry/"contact clinic" flow, or removed from navigation before any public release. Left unchanged here because fixing it means either building a backend or changing the UX — both beyond "connect to existing backend", and the choice is a product decision. |
| **B2** | `sign-up` Terms of Service and Privacy Policy are `href="#"` (`sign-up:153,157`). Consistent with the outstanding client dependency for legal documents (see `PRODUCTION_DEPENDENCIES_AUDIT.md` §10) — both stores require a public privacy-policy URL. |
| **B3** | Migration `20260729000000_notification_bilingual_content.sql` is committed but **not applied**. Until `supabase db push` runs, `title_ar`/`body_ar` do not exist and `shared/src/api/notifications.ts:8` selects them explicitly → PostgREST `42703 undefined_column`, breaking the notifications list on **web and mobile**. |

---

## 6. Explicitly not changed

- **Vartika's UI preserved.** No redesign; every change is data-layer or a dead control made
  functional. Card visuals, gradients, spacing, grids untouched.
- **RTL and Arabic intact.** Every string added carries an Arabic counterpart; no `flex-row-reverse`
  or `text-right` removed.
- **No duplication.** No new API client, hook, store or repository. Reused `api.profile`,
  `api.prescriptions`, `api.labs`, `api.records`, the existing `Promise.all`, the existing
  `?q=` convention and the existing `Suspense` pattern.
- **Static presentation config kept** — `MONTH_EN`, `DAY_AR`, `GRADS`, `CATEGORIES`,
  `STATUS_META`, `TABS`, `PAY_METHODS` are UI scaffolding, not data.
- **Marketing pages left static** — `about`, `contact`, `services` are copy, correctly static.
