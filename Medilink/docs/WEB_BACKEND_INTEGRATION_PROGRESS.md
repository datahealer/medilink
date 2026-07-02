# Web Backend Integration — Progress Tracker

**Branch:** `satyam/web-dynamic` · **Started:** 2026-07-02
**Architecture:** shared `api.*` layer (repository) → Supabase (RLS/RPC). **No React Query** (see audit §0).
**Companion doc:** [`WEB_DYNAMIC_INTEGRATION_AUDIT.md`](./WEB_DYNAMIC_INTEGRATION_AUDIT.md)

---

## Module status

| Module | Pages | Status | APIs Connected | Remaining | Notes |
|---|---:|---|---|---|---|
| Auth | 5 | ✅ | 5/5 | 0 | sign-in→`api.auth.signInWithPassword`+Google; sign-up→`supabase.auth.signUp`→OTP; middleware routes fixed |
| Profile | 1 | ✅ | 1/1 | 0 | `api.profile`, `api.records` (medical history), stats from appointments/labs/prescriptions |
| Find Doctors | 1 | ✅ | 1/1 | 0 | `api.doctors.searchDoctors`, `api.appointments.getAvailableSlots`/`bookAppointment` |
| Appointments | 1 | ✅ | 1/1 | 0 | `api.appointments` list/cancel/reschedule + getAvailableSlots |
| Records | 1 | ✅ | 1/1 | 0 | `api.prescriptions` + `api.labs` + `api.records.listDocuments` (aggregated feed) |
| Dashboard home | 1 | ⚠️ | 1/1 live data | 0 | greeting/stats/upcoming live; vitals + marketing intentionally static |
| Lab tests | 1 | 🚧 blocked | 0/1 | — | no catalog/order backend — documented in-code + audit |
| Surgeries | 1 | 🚧 blocked | 0/1 | — | no surgeries backend at all — documented in-code + audit |
| Marketing (public) | 9 | 🟦 | n/a | 0 | static-by-design, out of scope |

**Status (2026-07-02): 6 of 8 modules integrated (Auth, Profile, Find Doctors, Appointments, Records, Dashboard home). 2 blocked on missing backends (Lab tests, Surgeries) — documented, not mocked. `npm run typecheck` green after every module.**

---

## Per-module checklist (filled in as each module is completed)

Template per module: ☐ Correct API · ☐ Payload · ☐ Response mapping · ☐ Permissions · ☐ Loading · ☐ Error · ☐ Empty · ☐ Success · ☐ Cache/refresh after mutation · ☐ Search · ☐ Filters · ☐ Pagination · ☐ CRUD · ☐ `typecheck` · ☐ `lint` · ☐ UI unchanged

### 1. Auth — ✅ done (2026-07-02)
- **sign-in** → `api.auth.signInWithPassword(supabase, {email,password})`; Google via existing `signInWithGoogle()`; `router.refresh()` so middleware/SSR see the new session. Added loading + inline error box (styling copied from forgot-password — no layout change).
- **sign-up** → `supabase.auth.signUp({email,password,options:{data:{full_name,phone}}})` (shared api omits signUp by design; metadata feeds the `patient_profiles` provisioning trigger) → redirects to `/otp?email=`. Added loading + error box.
- **middleware** → fixed route mismatch: protects `/dashboard`, redirects to `/sign-in`; public prefixes now match the real `(auth)` routes.
- Checklist: ✅ API ✅ payload ✅ mapping ✅ loading ✅ error ✅ success ✅ UI unchanged ✅ typecheck. (search/filter/pagination/CRUD/empty = N/A for auth.)
- **Note:** ESLint is not installed/configured in this repo; `next lint` only offers interactive setup. Validation gate = `npm run typecheck` (green). Not adding ESLint (would be new tooling).
### 2. Profile — ✅ done (2026-07-02)
- **Load** on mount via `Promise.all`: `api.profile.getMyProfile` (profiles + patient_profiles), `api.records.getMedicalHistory` (allergies/conditions), and counts from `listMyAppointments('past')` / `api.labs.listLabResults` / `api.prescriptions.listPrescriptions` for the stat tiles.
- **Save** via `api.profile.updateMyProfile` (name split→full_name, phone, dob, gender, blood_group, emergency_contact JSON) + `api.records.upsertMedicalHistory` (allergies/conditions arrays).
- Enum mapping: gender label↔`male/female/other/prefer_not_to_say`; blood-group display `−` (U+2212) ↔ DB ASCII `-`.
- Hero initials now derived from real name; stat tiles use real counts; loading shell + inline error banner + saving state added (styling matches existing saved-banner).
- Checklist: ✅ API ✅ payload ✅ mapping ✅ loading ✅ error ✅ empty (blank fields) ✅ success ✅ refresh (updateMyProfile returns fresh profile) ✅ UI unchanged ✅ typecheck.
- **Documented gaps (not mocked):** `email` (auth-managed — field kept, not persisted), `height`/`weight` (no DB column — field kept, not persisted).
### 3. Find Doctors — ✅ done (2026-07-02)
- **List** via `api.doctors.searchDoctors(supabase, {limit:100})`, mapped to a `Doctor` view-model (initials from name, cycling avatar gradients, fee parsed from `fees` JSON, rating/reviews, `available` from `status==='available'`, hospital from `facilities.name`). Client-side specialty + search filtering kept identical.
- **Booking modal** now fetches real availability via `api.appointments.getAvailableSlots` when a date is picked (24h→12h display; already-taken slots excluded server-side) and books via `api.appointments.bookAppointment` (`type: in_person`).
- Loading skeletons, error state, and a "no available times" empty-state added; calendar `TODAY` now real (was pinned 2026-06-29).
- **Shared change (additive):** added `review_count` to `doctors` `LIST_SELECT` so the rating count is real (benefits mobile too; non-breaking).
- Checklist: ✅ API ✅ payload ✅ mapping ✅ loading ✅ error ✅ empty ✅ success ✅ search ✅ filters ✅ create(book). Pagination = single fetch capped at 100 (documented).
- **Notes/gaps:** DB has no Arabic doctor names or consult-mode → `ar` mirrors `en`, `type` defaults to In-clinic. Specialty filter matches DB `specialty` strings exactly.
### 4. Appointments — ✅ done (2026-07-02)
- **List** via `api.appointments.listMyAppointments(supabase, "all")` → `Appt` view-model (status enum→label, type enum→label, relative date, 12h time, doctor/facility from embeds). Hero counts + tab filtering now from real data.
- **Cancel** via `api.appointments.cancelAppointment` → reload. **Reschedule** modal loads real slots (`getAvailableSlots`, +30min end fallback) and commits via `api.appointments.rescheduleAppointment` → reload.
- Removed local `cancelled`/`rescheduled` shims (server is source of truth); added list loading skeletons, error banner, per-row cancelling state, and "no available times" empty-state.
- **Shared change (additive):** added `specialty` to the appointments doctor embed so the spec label is real.
- Checklist: ✅ API ✅ payload ✅ mapping ✅ loading ✅ error ✅ empty ✅ success ✅ refresh after mutation ✅ filters(tabs) ✅ CRUD (cancel/reschedule). Pagination N/A (full list).
### 5. Records — ✅ done (2026-07-02)
- **Aggregated feed** built from three real sources in parallel: `api.prescriptions.listPrescriptions` (→ Prescriptions), `api.labs.listLabResults` (→ Lab Results), `api.records.listDocuments` (→ Imaging/Summaries via `document_type` map). Merged and sorted by date desc; gradients assigned post-sort.
- Category tabs + search filter now run over real data; download button still generates a client-side text summary (unchanged, no backend needed).
- Added loading skeletons + error state; existing empty state retained.
- Checklist: ✅ API ✅ mapping ✅ loading ✅ error ✅ empty ✅ search ✅ filters(categories). 
- **Notes/gaps:** "Vaccinations" category has no backend source (always empty). "Share" button is a no-op (prescription share-link is a privileged backend op, not wired). `medications` JSON parsed defensively for title/tags.
### 6. Dashboard home — ✅ done (2026-07-02)
- **Greeting** uses the real first name (`api.profile.getMyProfile`). **Hero stats** (Upcoming / Records / Pending) computed from real appointments + prescriptions/labs/documents counts. **Upcoming section** shows the next 3 real appointments (`listMyAppointments('upcoming')`) with loading skeleton + empty state.
- **Intentionally left static (documented gaps / not data):** `HEALTH_METRICS` (Heart Rate/BMI/BP/Active Rx — no vitals backend), and all marketing/nav sections (services, specialties, how-it-works, clinic types, articles, marquee, quick-actions) — these are page content/navigation, not backend data.
- Checklist: ✅ API ✅ mapping ✅ loading ✅ empty ✅ success. 
- **Decision:** vitals kept static per agreed "document & leave" rule (3 of 4 tiles have no source).
### 7. Lab tests — 🚧 blocked (no backend)
- No lab-test catalog or ordering endpoint exists (`api.labs` only reads results). Left static per the "document, don't mock" decision; added an in-code BACKEND GAP banner above the catalog data pointing to the audit. **To unblock:** add a `lab_test_catalog` table + `api.labs.listCatalog`/`orderLabTest` (or a backend `/api/labs/*` route), then wire like find-doctors.

### 8. Surgeries — 🚧 blocked (no backend)
- No surgeries domain exists anywhere (schema/shared/backend). Left static; added an in-code BACKEND GAP banner. **To unblock:** design the surgeries domain (table + shared `api.surgeries` + booking), then integrate.

---

## Documented backend gaps (not to be mocked)

- Surgeries domain (no schema/API)
- Lab-test catalog & ordering (only results retrieval exists)
- Dashboard vitals (heart rate / BMI / BP)
- Contact form endpoint
- Locale preference persistence

## Commit log

_(appended as modules land — format: `feat(web): integrate <module> module`)_
