# HAMS ↔ Mobile Integration (Week 1 auth + Week 2 patient)

How the Expo app talks to the reused HAMS backend. Full endpoint-level detail is in
`docs/MOBILE_HAMS_API_AUDIT.md` (repo root). This file is the engineering how-to.

## Two data paths

| Path | Used by | Transport |
|---|---|---|
| **Supabase-direct** (RLS) | sign-in, session, profile, medical history, family, dashboard appointments | `mobile/src/lib/supabase.ts` + `@medilink/shared` `api.*` |
| **Backend REST** (service-role / bearer) | signup, send-otp, verify-otp, profile-photo upload | `mobile/src/services/api.ts` `apiFetch()` → `EXPO_PUBLIC_API_URL` |

`apiFetch` attaches the Supabase access token as `Authorization: Bearer …`; the backend
(`backend/src/lib/supabase/api.ts`) exchanges it for an RLS-scoped client.

## Key modules

- **Session:** `src/providers/AuthProvider.tsx` bootstraps `supabase.auth.getSession()` into
  `src/stores/authStore.ts` and subscribes to `onAuthStateChange`. The splash screen and the
  `app/(app)/_layout.tsx` gate read `authStore.status` (`loading | authed | guest`).
- **Server state:** TanStack Query (`src/providers/QueryProvider.tsx`). Hooks:
  `src/hooks/queries/useAuth.ts`, `usePatient.ts`, `useFamily.ts`.
- **Local state:** Zustand — `authStore` (session mirror), `patientStore` (active patient,
  persisted), plus existing `theme/locale/onboarding` stores.
- **Transport:** `src/services/authService.ts` (auth), `src/services/api.ts` (`apiFetch`).
- **Responsive:** `src/hooks/useResponsive.ts` (tablet ≥ 768; form/content max widths).

## Auth flows (real)

- **Sign in:** `supabase.auth.signInWithPassword` → session → `authStore` → `/dashboard`.
- **Sign up:** `POST /api/auth/signup` (service role, email auto-confirmed) → sign in to get a
  session → `POST /api/auth/send-otp` → OTP screen → `POST /api/auth/verify-otp` → `/dashboard`.
- **Logout:** `supabase.auth.signOut()` → `useSignOut` clears the active patient + query cache →
  `(app)` gate redirects to sign-in.
- **Forgot password:** `supabase.auth.resetPasswordForEmail` (real email). Completing the reset
  needs a deep-link recovery session — **not yet configured** (documented as BLOCKED).
- **Google login:** no backend endpoint + no client IDs → button **disabled** (no fake success).

## Patient data (Week 2)

- Profile: `api.profile.getMyProfile` / `updateMyProfile`.
- Medical history: `api.records.getMedicalHistory` / `upsertMedicalHistory`.
- Family: `api.family.listFamily` / `addFamilyMember` / `updateFamilyMember` / `deleteFamilyMember`.
- Profile photo: `POST /api/patients/me/profile-photo` (multipart) via `useUploadProfilePhoto`.
- Active patient: **client-only** Zustand (`patientStore`) — no backend endpoint exists.

## Real-data dependency to verify on staging

Family + medical-history are keyed on `patient_profiles.id` (`getMyPatientProfileId`). A new
account must have a `patient_profiles` row (created by a signup DB trigger). If it doesn't, those
screens surface a clear error/empty state. **Verify the trigger exists** with a real test account.

## Routes

```
app/
  splash.tsx            session-aware routing
  welcome / onboarding / language
  auth/  sign-in · sign-up · otp · forgot-password · reset-password
  (app)/                ← auth-gated group (_layout.tsx)
    dashboard.tsx
    profile/  index · edit · medical-history
    family/   index · add · [id]
    patient-switcher.tsx
```

## Environment

See `mobile/.env.example`. Public `EXPO_PUBLIC_*` only — never put service-role keys, JWT
secrets, DB URLs, Google client *secrets*, payment/OTP provider secrets in mobile files.
For a physical phone, `EXPO_PUBLIC_API_URL` must be a staging URL or your laptop LAN IP — not
`localhost`.
