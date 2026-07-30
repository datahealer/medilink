# Web Frontend — Dynamic Integration Audit

**App:** `@medilink/frontend` (Next.js 15 App Router)
**Branch:** `satyam/web-dynamic`
**Audit date:** 2026-07-02
**Scope:** Every page under `frontend/src/app`. UI is frozen — this audit only concerns **data wiring**, not visual changes.

---

## 0. Architecture reality-check (read this first)

The task brief assumes a **React Query + Repository** stack and an **admin console** (Payments / Reports / Analytics / Users / Roles / Settings). Neither matches this codebase. The findings below are written against what actually exists:

| Assumption in brief | Reality in this repo |
|---|---|
| React Query hooks + mutations | **No React Query anywhere** (not in `frontend`, `shared`, or `mobile`). Not in any `package.json`. |
| "Repository" layer | `@medilink/shared` → `api.*` namespaces (`api.appointments`, `api.doctors`, …) are direct-Supabase modules. **This is the repository layer** and is shared verbatim with mobile. |
| API layer / networking lib | Supabase JS client (`@supabase/ssr` browser client on web, cookie/RLS-backed). No axios/fetch wrapper for data. |
| Admin pages (Payments, Reports, Analytics, Facilities, Users, Roles) | **Do not exist.** This web app is a **patient portal** — the same surface as the mobile app (find doctors, book, lab tests, records, profile). |
| Auth already wired | `AuthContext` + Supabase session refresh middleware exist, **but `sign-in` / `sign-up` are fake** (`router.push('/dashboard')`, no real auth call). |

> ⚠️ **Direct rule conflict.** The brief says *"Use the existing React Query"* **and** *"Do not introduce new state management or networking libraries."* React Query does not exist here, so it cannot be both used and not-introduced. **Resolution adopted by this audit:** follow the *actual* existing architecture — the shared `api.*` layer consumed directly (client components with `useState`/`useEffect`, or Server Components), exactly as the mobile app does. This needs sign-off before Phase 2 (see §7).

### The canonical data path for this repo

```
Client Component ("use client")
   ↓ createBrowserSupabaseClient()          // @/lib/supabase/client
   ↓ api.<domain>.<fn>(db, …)               // @medilink/shared  ← the "repository"
   ↓ Supabase (RLS / RPC / SECURITY DEFINER)
   ↓ Postgres (reused HAMS schema)
```

Server-side side-effects (signup, OTP, 2FA, payments, PDF generation, AI, data-export) live in a **separate Next.js app** at `backend/src/app/api/*` and are called over HTTP.

---

## 1. Counts

| Metric | Count |
|---|---:|
| **Total pages** (`page.tsx`) | **22** |
| Route handlers (`route.ts`) | 1 (`auth/callback`) |
| ✅ Fully Dynamic | 4 |
| ⚠️ Partially Dynamic | 2 |
| ❌ Static (data-bearing, needs wiring) | 7 |
| 🟦 Static-by-design (marketing/informational — no backend applies) | 9 |
| 🚧 Not Implemented (in brief's example list, absent here) | 8 (Payments, Reports, Analytics, Facilities, Users, Roles, Settings, Notifications) |
| Duplicate pages | 0 |

**Overall data-integration progress: ~18%** (4 of 22 fully dynamic; the 9 marketing pages are intentionally static and excluded from the integration backlog, leaving **9 pages** as the real backlog: 7 static + 2 partial).

---

## 2. Page-by-page findings

Legend — Status: ✅ Fully Dynamic · ⚠️ Partially Dynamic · ❌ Static · 🟦 Static-by-design · 🚧 Not Implemented

### Auth module — `src/app/(auth)/*`

| Page | Status | Backend / shared API | Mock data | Forms | Notes | Priority |
|---|---|---|---|---|---|---|
| `sign-in` | ❌ | should use `api.auth.signInWithPassword` + `signInWithGoogle` | none | ✅ validation, ❌ submit is `router.push('/dashboard')` | **Fake auth — highest risk.** No credentials checked. | 🔴 P0 |
| `sign-up` | ❌ | should call `backend /api/auth/signup` (server-side side-effects) | none | ❌ submit is `router.push('/dashboard')` | Fake. Backend endpoint exists. | 🔴 P0 |
| `forgot-password` | ✅ | `supabase.auth.resetPasswordForEmail` | none | ✅ + error/try-catch | Works. Uses supabase directly (not `api.auth.resetPasswordForEmail`) — minor consistency nit. | 🟢 done |
| `otp` | ✅ | `supabase.auth.verifyOtp` + `resend` | none | ✅ + resend loading | Works (signup OTP type). | 🟢 done |
| `reset-password` | ✅ | `supabase.auth.updateUser({password})` | none | ✅ | Works. | 🟢 done |
| `welcome` | 🟦 | — | none | — | Static intro screen (intentional). | — |
| `language` | ⚠️ | i18n locale (`@medilink/shared` config) | locale list | — | Functional locale switch; no backend persistence of preference. | 🟡 P3 |
| `onboarding` | 🟦 | — | slide copy array | — | Informational carousel (intentional). | — |

### Dashboard module — `src/app/dashboard/*` (patient portal)

| Page | Status | Should map to (shared API) | Mock data (hardcoded) | Interactive UI | Missing backend | Priority |
|---|---|---|---|---|---|---|
| `dashboard` (home) | ❌ | `api.appointments.listMyAppointments`, `api.records`, `api.profile.getMyProfile` | `UPCOMING`, `HEALTH_METRICS`, stats `2/5/1`, `"Vartika"`, `SERVICE_CARDS`, articles | none (marquee only) | Health metrics (heart rate/BMI/BP) have **no backend source** → document. | 🔴 P1 |
| `appointments` | ❌ | `api.appointments.*` (list/book/cancel/reschedule), `getAvailableSlots` | `APPOINTMENTS`, `TIME_SLOTS`, `TAKEN` set | 12× `useState` (tabs, calendar, booking modal), search/filter | booking flow ok; needs doctor+facility selection | 🔴 P1 |
| `find-doctors` | ❌ | `api.doctors.searchDoctors`/`getDoctor`, `api.appointments.getAvailableSlots`/`bookAppointment`, `api.favourites` | `DOCTORS`, `SPECIALTIES`, `SLOTS_A/B/C`, `MORNING/AFTERNOON/EVENING` | 10× `useState` (search, specialty filter, calendar, slot pick) | — | 🔴 P1 |
| `records` | ❌ | `api.records.listDocuments`/`getMedicalHistory`, `api.prescriptions.listPrescriptions`, `api.labs.listLabResults` | `RECORDS`, `CATEGORIES` | search + category filter | doc upload → `api.records.addDocument` + `backend .../profile-photo`-style storage | 🔴 P2 |
| `profile` | ❌ | `api.profile.getMyProfile`/`updateMyProfile`, `api.family.*` | prefilled form values, `BLOOD_GROUPS` | edit form (4× `useState`) | profile photo → `backend /api/patients/me/profile-photo` | 🟠 P2 |
| `lab-tests` | ❌ | ⚠️ mismatch — `api.labs` is lab **results**, page is a lab-test **catalog/booking** | `LABS`, `CATEGORIES` | search, category filter, calendar booking | **No "lab test catalog / order lab test" backend exists.** Only results retrieval. → document. | 🟠 P2 |
| `surgeries` | ❌ | **none** | `SURGERIES`, `CATEGORIES` | search, filter, calendar | **No surgeries domain in `shared` or `backend`.** Entire feature has no backend. → document. | 🟡 P3 |

### Marketing / public — `src/app/*`

| Page | Status | Notes |
|---|---|---|
| `/` (home) | 🟦 | Marketing landing (arrays are page copy, not data). No CMS backend. |
| `about` | 🟦 | Static content. |
| `services` | 🟦 | Static content. |
| `for-clinics` | 🟦 | Static content. |
| `contact` | 🟦 (form) | Static content **+ contact form** with a local `handleSubmit` (no submission target). **No contact/lead backend endpoint exists** → document if wiring is desired. |
| `splash` | 🟦 | Redirect/splash screen. |

### Route handlers

| Route | Status | Notes |
|---|---|---|
| `auth/callback` | ✅ | OAuth PKCE code exchange (`exchangeCodeForSession`). Functional. |

---

## 3. Missing / mismatched backend endpoints

Documenting instead of inventing mock behavior (per brief):

1. **Surgeries** — no `shared/api/surgeries.ts`, no `backend/api/surgeries/*`, no schema domain. The entire `surgeries` page has no data source.
2. **Lab-test catalog & ordering** — `api.labs` only *reads results* (`listLabResults`, `getLabResultSignedUrl`). There is no "browse test catalog" or "order a lab test" endpoint. The `lab-tests` page is a booking catalog, so it is only partially serviceable.
3. **Dashboard health metrics** — Heart Rate / BMI / Blood Pressure / Active Rx tiles have no vitals table or endpoint. (Active Rx count *could* derive from `api.prescriptions`.)
4. **Contact form** — no contact/lead/support endpoint.
5. **Locale preference persistence** — `language` page switches i18n at runtime but nothing persists the choice server-side.

## 4. Cross-cutting issues (found during audit)

> ## ⚠️ STALE — both 🔴 items below were RESOLVED. Re-verified 2026-07-30.
>
> This section is the most dangerous kind of stale doc: it states the patient dashboard is
> unprotected. Anyone reading it today would chase a vulnerability that no longer exists, or
> worse, distrust the auth that is actually in place. The 🔴 items are kept verbatim for
> history, struck through, with the evidence that closed them.
>
> - **~~Fake authentication~~ — FIXED.** `frontend/src/app/(auth)/sign-in/page.tsx:30` calls
>   `api.auth.signInWithPassword(supabase, { email, password })`. There is no
>   `router.push('/dashboard')` bypass anywhere in `(auth)/`.
> - **~~Middleware route mismatch~~ — FIXED.** `frontend/src/lib/supabase/middleware.ts` now
>   guards `/dashboard` plus the `/dashboard/*` subtree (appointments, records, payments,
>   profile, notifications, setup, settings) and redirects to `/sign-in`. Verified against a
>   running production build: `GET /dashboard/profile` → `307` →
>   `/sign-in?next=%2Fdashboard%2Fprofile`.
> - The first 🟡 (no client-side guard in the dashboard layout) still stands as written,
>   but its stated consequence no longer applies — the middleware it "relies solely on" is
>   no longer mismatched.
> - The second 🟡 (auth pages calling `supabase.auth.*` directly) is now **partly** addressed:
>   `sign-in` goes through the `api.auth.*` wrapper; `sign-up`, `otp`, `forgot-password` and
>   `reset-password` still call `supabase.auth.*` directly.

- 🔴 ~~**Fake authentication.** `sign-in` and `sign-up` bypass auth entirely (`router.push('/dashboard')`). Any visitor reaches the dashboard. This must be fixed before any "authorization" claim holds.~~
- 🔴 ~~**Middleware route mismatch.** `frontend/src/lib/supabase/middleware.ts` protects `/account`, `/appointments`, `/records`, `/wallet` and redirects to `/login`. The **real** routes are `/dashboard/*` and the sign-in route is `/sign-in`. Result: **the dashboard is effectively unprotected** and the redirect target 404s. Needs correcting to `/dashboard` prefixes + `/sign-in`.~~
- 🟡 **Dashboard layout has no client-side auth guard** (no `useAuth` redirect); relies solely on the middleware (which is no longer mismatched — see the note above).
- 🟡 **Consistency:** working auth pages call `supabase.auth.*` directly rather than the `api.auth.*` shared wrappers. Not a bug; worth normalizing. (Partly done — `sign-in` now uses the wrapper.)

## 5. Mock-data inventory (to be removed during integration)

`dashboard`: `UPCOMING`, `HEALTH_METRICS`, hero stats, `"Vartika"` · `appointments`: `APPOINTMENTS`, `TIME_SLOTS`, `TAKEN` · `find-doctors`: `DOCTORS`, `SLOTS_A/B/C`, `MORNING/AFTERNOON/EVENING` · `lab-tests`: `LABS` · `records`: `RECORDS` · `surgeries`: `SURGERIES` · `profile`: prefilled form values.
(Static config arrays like `MONTH_EN`, `DAY_AR`, `CATEGORIES`, `SPECIALTIES` are UI scaffolding, not data — kept.)

---

## 6. Proposed integration order (Phase 3, module by module)

Real backlog = 9 pages. Suggested sequence (highest value / lowest risk first):

| # | Module | Pages | Blockers |
|---|---|---|---|
| 1 | **Auth** | sign-in, sign-up (+ middleware fix) | none — unblocks everything else |
| 2 | **Profile** | profile | none |
| 3 | **Find Doctors** | find-doctors | none |
| 4 | **Appointments** | appointments + dashboard "upcoming" | depends on doctors |
| 5 | **Records** | records | none |
| 6 | **Dashboard home** | dashboard | health-metrics = documented gap |
| 7 | **Lab tests** | lab-tests | catalog backend gap |
| 8 | **Surgeries** | surgeries | no backend — deferred/documented |

After each module: `npm run typecheck` + `npm run lint`, verify no regressions, commit as `feat(web): integrate <module> module`.

## 7. Decisions needed before Phase 2

1. **Data-fetching pattern** (blocking): confirm we use the existing shared `api.*` layer with client-side `useState`/`useEffect` (mobile-parity), **not** React Query. (Adding React Query violates the "no new libraries" rule.)
2. **Scope**: is the surgeries/lab-catalog/health-metrics work in scope given there is **no backend**? (Recommend: document as gaps, leave UI static with a clear TODO, do not fabricate data.)
3. **Marketing pages**: confirm the 9 static-by-design pages are out of scope (no CMS/contact backend exists).

---

*Phase 2/3 progress is tracked in [`WEB_BACKEND_INTEGRATION_PROGRESS.md`](./WEB_BACKEND_INTEGRATION_PROGRESS.md).*
