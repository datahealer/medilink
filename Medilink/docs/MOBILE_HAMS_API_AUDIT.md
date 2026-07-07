# MediLink Mobile ↔ HAMS API Audit

**Date:** 2026-06-23 · **Scope:** Week 1 auth wiring + Week 2 (dashboard, profile, medical
history, family) mobile integration. **Method:** every claim below is read from real code in
`backend/`, `shared/`, `mobile/`, and the HAMS source at `D:\New folder (3)\hams-frontend`.
Endpoints that do not exist in code are marked **BLOCKED**. No APIs were invented.

---

## 0. Architecture finding (read this first)

The HAMS platform is **Supabase-Auth + Postgres-RLS**, *not* a conventional REST API. There are
two distinct data paths, and the existing monorepo already implements both:

| Path | Used for | Transport | Where it lives |
|---|---|---|---|
| **A. Supabase-direct** | All RLS-safe CRUD: sign-in, session, profile, family, medical history, appointments, favourites | `supabase-js` client → Postgres (RLS scopes rows to the caller) | `@medilink/shared` `api.*` modules (`shared/src/api/*.ts`) + mobile client `mobile/src/lib/supabase.ts` |
| **B. Backend REST** | Privileged / service-role work the client must NOT do: signup (bypasses email confirm), OTP send/verify, profile-photo upload | `fetch` with `Authorization: Bearer <supabase access_token>` → Next.js route → service/RLS client | `backend/src/app/api/**` + mobile `apiFetch` (`mobile/src/services/api.ts`) |

The backend explicitly accepts the **mobile bearer token** and exchanges it for an RLS-scoped
client — same identity as a direct query (`backend/src/lib/supabase/api.ts:10-33`).

### Consequence for the requested file list

The task asked for `shared/api-client/http.ts`, `shared/api-client/auth.ts`,
`shared/api-client/patient.ts`, `shared/api-client/family.ts`. **These were intentionally NOT
created.** A REST `http.ts` client would contradict the real backend (which is Supabase-direct +
RLS, not REST). The monorepo already ships the canonical shared client as
`@medilink/shared` `api.*` — `api.auth`, `api.profile`, `api.family`, `api.records`,
`api.appointments`, `api.favourites` (`shared/src/api/*.ts`). Per the plan's "reuse, not
scope-cutting" principle and the task's own allowance ("`shared/api-client/` **or existing
`@medilink/api-client`**"), the mobile app **reuses these** instead of duplicating a parallel
client. Domain types are re-exported from the package root so screens never re-declare HAMS types.

---

## 1. Endpoint audit by area

Legend — **Wired:** integrated in this change · **Reuse:** existing shared module used ·
**BLOCKED:** no endpoint in code.

### Session / current user — **Supabase-direct (Reuse)**
- No `/api/auth/session` or `/api/me` route exists in either backend (confirmed absent).
- Client reads session via `supabase.auth.getSession()` / `getUser()`
  (`shared/src/api/auth.ts:23-33`, mobile `mobile/src/lib/supabase.ts:37-40`).
- Auth: Supabase session (bearer/keychain on mobile). Response: supabase `Session`/`User`.

### Sign up / register — **Backend REST (Wired)**
- `POST /api/auth/signup` — `backend/src/app/api/auth/signup/route.ts:7-86`.
- Auth: **public** (no token). Uses service role to `auth.admin.createUser` with
  `email_confirm: true` (so the account can sign in immediately).
- Body: `{ email, password, full_name?, phone?, role? }`. `role` is forced to `patient`
  (`route.ts:34-41`); password must pass `validatePassword` (≥8, upper, lower, number, special).
- Success: `{ success: true, data: <admin createUser result>, message }` — **no session** is
  returned. Error: `{ success: false, error }` with `400/403/500`.
- ⚠️ Flow note: because signup returns no session, the app must **sign in** with the new
  credentials to obtain a session, *then* call send-otp (which requires auth). Implemented in
  `mobile/src/services/authService.ts` (`signUp` → `signInWithPassword` → `sendOtp`).

### Send OTP — **Backend REST (Wired, auth-required)**
- `POST /api/auth/send-otp` — `backend/src/app/api/auth/send-otp/route.ts`.
- Auth: **requires Supabase session**; role must be `patient`. Body: `{ phone? }` (E.164;
  falls back to `profiles.phone`). Success: `{ success: true }`. Errors: `401/403/404/400/500`.
- ⚠️ The route **stores** the OTP and (per code) does not actually send an SMS yet (provider
  call is commented out in HAMS). Treat delivery as environment-dependent.

### Verify OTP — **Backend REST (Wired, auth-required)**
- `POST /api/auth/verify-otp` — `backend/src/app/api/auth/verify-otp/route.ts:4-80`.
- Auth: requires session; role `patient`. Body: `{ code: string(6), phone? }`.
- On success: marks `profiles.phone_verified = true`, deletes the OTP row, returns
  `{ success: true }`. Errors: invalid/expired `400`, ≥5 attempts `429`, `401/403/404`.

### Google OAuth (login) — **BLOCKED**
- `GET /api/auth/google` + `/callback` exist but are **Google Calendar sync**, not user login
  (`backend/src/app/api/auth/google/route.ts`, `.../callback/route.ts`). There is **no Google
  login endpoint**.
- Real Google *login* would be `supabase.auth.signInWithOAuth({ provider: 'google' })` and
  needs the `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values + deep-link/redirect config — **not present**.
- Handling: the "Continue with Google" button stays **visible but disabled** with a clear
  "Google sign-in is not configured yet" state. No fake success.

### Password reset / set password — **Partial / BLOCKED for patients**
- `POST /api/auth/set-password` exists but is **invitation-based** (doctor/technician/staff
  onboarding) or an *authenticated* self-change — **not a patient forgot-password flow**
  (`backend/src/app/api/auth/set-password/route.ts`).
- Patient reset path is Supabase: `resetPasswordForEmail(email, { redirectTo })`
  (`shared/src/api/auth.ts:36-46`) sends a recovery email; completing it needs
  `updateUser({ password })` **inside a recovery session** established via a deep link.
- Handling: **forgot-password sends the real reset email** and shows a "check your email"
  confirmation. The in-app `reset-password` screen calls the real `updatePassword`, which only
  succeeds if a recovery session exists (deep link). End-to-end mobile reset is **BLOCKED until
  a deep-link scheme is configured** — documented, not faked.

### Logout / token refresh — **Supabase-direct (Wired)**
- MediLink backend has **no** signout route (HAMS has `POST /api/auth/signout`, not copied).
- Mobile uses `supabase.auth.signOut()` (`shared/src/api/auth.ts:18-21`) + clears the query
  cache and routes to sign-in.
- Token refresh: automatic via `autoRefreshToken` + foreground `startAutoRefresh()`
  (`mobile/src/lib/supabase.ts:18-34`). No manual refresh endpoint needed.

### Dashboard data — **Supabase-direct (Reuse, API-dependent)**
- `me`/profile: `api.profile.getMyProfile(db)` → `{ account: profiles, patient: patient_profiles }`
  (`shared/src/api/profile.ts:13-25`).
- Upcoming appointments: `api.appointments.listMyAppointments(db, "upcoming")`
  (`shared/src/api/appointments.ts:14-28`). Booking UI is **out of scope (Week 3)** — dashboard
  shows the next visit read-only, with a polished empty state when none exist.
- Favourites: `api.favourites.listFavourites(db)` exists; not surfaced (discovery is Week 3).

### patients/me (profile) — **Supabase-direct (Reuse)**
- Read: `api.profile.getMyProfile`. Update: `api.profile.updateMyProfile(db, patch)`
  spanning `profiles` (name/phone) + `patient_profiles` (dob/gender/blood_group/address/
  emergency_contact/photo) (`shared/src/api/profile.ts:41-71`).

### Medical history — **Supabase-direct (Reuse)**
- Read: `api.records.getMedicalHistory(db)` → row or `null`. Upsert:
  `api.records.upsertMedicalHistory(db, patch)` (allergies/conditions/medications/surgeries/
  smoking_status/notes) (`shared/src/api/records.ts:14-50`).

### Profile photo upload/read — **Backend REST (Wired)**
- `POST /api/patients/me/profile-photo` (multipart `file`) — exists in MediLink backend
  (`backend/src/app/api/patients/me/profile-photo/route.ts`). Auth: bearer/session (AAL2 helper).
  Max 5 MB; jpeg/png/jpg/webp. Returns `{ success, data: { profile_photo_url } }`.
- Read: the returned **public URL** is stored on `patient_profiles.profile_photo_url`; no
  separate GET needed.

### Family list / add / update / remove — **Supabase-direct (Reuse)**
- List: `api.family.listFamily(db)`; Add: `addFamilyMember`; Update: `updateFamilyMember`
  (HAMS REST lacks PUT — Supabase-direct provides it); Remove: `deleteFamilyMember`
  (`shared/src/api/family.ts:15-71`). Max 5 enforced at DB/HAMS layer.

### Switch active patient — **Client-only (no endpoint)**
- No "active patient" endpoint exists in either backend. "Active patient" is a **client-side
  concept** (who you're booking/acting for). Implemented as local Zustand state
  (`mobile/src/stores/patientStore.ts`), persisted in SecureStore. Documented as client-only.

---

## 2. Summary

**Wired now (real, against HAMS/Supabase):** sign-in, session restore, logout, signup→sign-in→
send-otp→verify-otp, password-reset-email; profile read/update, medical-history read/upsert,
profile-photo upload; family list/add/update/remove; active-patient switch (local).

**BLOCKED / partial (documented, never faked):**
- Google **login** — no endpoint + no client IDs → button disabled.
- Patient **password reset end-to-end** — needs deep-link recovery session (email send works).
- OTP **SMS delivery** — backend stores OTP but SMS provider call is not enabled.
- `patient_profiles` row must exist for the signed-in user for family/medical-history (keyed on
  `patient_profiles.id`). If a signup trigger doesn't create it, those screens show a clear
  error/empty state — flagged as a real-data dependency to verify on staging.

**Dev fallback flag:** `EXPO_PUBLIC_APP_ENV` gates any local mock. No mock is shipped for the
wired paths; the only non-real states are the explicitly-disabled Google button and the
deep-link-pending reset completion.
