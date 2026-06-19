# MediLink — Backend Migration Report (Step 3)

Live log of the HAMS → MediLink monorepo migration. Source: `D:\New folder (3)\hams-frontend` (unmodified). Target: `D:\Medilink`.

## Result at a glance
| Metric | Value |
|---|---|
| Supabase migrations reused | **121** (verbatim) + **2** additive = **123** |
| Supabase Edge Functions reused | **13** (verbatim) |
| Privileged API routes moved → `backend/` | **35** route handlers |
| Backend lib files copied | **25** |
| Shared modules extracted → `shared/` | **22** files (types, enums, utils, i18n, api contracts) |
| Routes SKIPPED (staff/admin scope) | ~65 (not copied) |
| HAMS source files modified | **0** (copy-only) |
| **Patient backend completion (pre-UI)** | **≈ 88%** (remaining: push transport + re-home query bodies + `npm install`/build verify) |

---

## Stage 1 — Supabase (COPY, unchanged)
**Copied** → `supabase/`: `config.toml`; `migrations/` (121 `.sql`); `functions/` (13 Edge Functions: `send-booking-confirmation`, `generate-invoice`, `generate-health-insights`, `notify-lab-result`, `notify-waitlist`, `poll-refund-status`, `export-user-data`, `purge-user-auth`, + facility/report fns kept as-is); `full_schema 1.sql` → `docs/reference/full_schema.sql`.
**Added (additive):** `20260620000001_device_tokens.sql`, `20260620000002_notification_preferences.sql` (RLS, own-row only).
**Reused as-is:** remote Supabase project (same URL/keys) — relink with `supabase link`; `.temp/` stays gitignored. **No schema fork.**

## Stage 2 — Shared extraction → `shared/src/` (priority #6)
| Extracted | From HAMS | To |
|---|---|---|
| DB types | `src/types/supabase.ts` (5703 ln) | `shared/src/types/supabase.ts` (canonical `Database`) |
| Domain types | `src/types/{facility,global.d}.ts` | `shared/src/types/` |
| Roles/enums | `src/lib/auth/roles.ts` | `shared/src/auth/roles.ts` (canonical — backend dup removed) |
| Constants | `src/constants/clinicTypes.ts` | `shared/src/config/clinicTypes.ts` |
| Utils | `src/lib/{utils,routes}.ts` | `shared/src/utils/{cn,routes}.ts` |
| i18n EN/AR | `src/i18n/messages/*`, `types.ts`, `translate.ts` | `shared/src/config/i18n/*` (internal imports rewritten to relative; stray `lucide-react` import dropped → pure string catalog) |
| **API contracts** | (new, derived from routes) | `shared/src/api/{client,contracts,profile,index}.ts` — `DB` type, `PatientApi`/`BackendApi` contracts, example re-home module |
**Barrels:** `shared/src/index.ts` (full) + `shared/src/mobile.ts` (RN-safe subset — excludes web-only `cn`/tailwind-merge). Deps added: `clsx`, `tailwind-merge`, `@supabase/supabase-js` (types).

## Stage 3 — Privileged routes MOVED → `backend/src/app/api/` (verbatim)
**35 route handlers**, same paths:
- **Payments** (`payments/**`: checkout, [id]/invoice, [id]/refund, get-appointment/[id], unpaid, webhook) — Thawani primary + Stripe.
- **AI** (`ai/**`: symptom-check, suggest-doctor, scan-prescription, schedule-assist).
- **PDF** (`prescriptions/[id]/{generate-pdf,download,share-link}`, `patients/[id]/medical-history/pdf`).
- **Auth side-effects + OTP** (`auth/{signup,send-otp,resend-otp,verify-otp,set-password,google,2fa,session-log}`) — OTP kept server-side per decision #1; existing HAMS auth flow preserved.
- **Calendar/image** (`appointments/[id]/google`, `patients/me/profile-photo`).
- **GDPR** (`users/me/{data-export,account}`).
**Backend libs copied** (25): `lib/supabase/{service,adminClient,api,server,client,browser,middleware}`, `lib/auth/*` (helpers; `roles` now from shared), `lib/{email,sms,audit}/*`, `lib/{utils,routes,licenseUtils}`.
**Imports rewritten:** `@/types/supabase` → `@medilink/shared` (12×), `@/lib/auth/roles` → `@medilink/shared`. All other `@/lib/*` resolve locally (verified — 0 dangling refs). `@medilink/shared` aliased in `backend/tsconfig.json` + `transpilePackages`.

## Stage 4 — RE-HOME (RLS CRUD → direct Supabase) — scaffolded
~55 CRUD routes are **not** copied to backend; their queries live in `shared/src/api/` as typed `DB`-accepting modules (web passes SSR client, mobile passes bearer client — identical RLS). Delivered: `client.ts` (typed `DB`), `contracts.ts` (`PatientApi`/`BackendApi` — the shared API surface), `profile.ts` (worked example: `getMyProfile`, `getMyFamily`). **Remaining module bodies** (doctors, facilities, appointments, records, labs, prescriptions-read, reviews, notifications) are authored against the verified schema during frontend/mobile integration — signatures already fixed in `contracts.ts`.

## Stage 5 — NEW
Additive migrations only (`device_tokens`, `notification_preferences`). Push **dispatch route** (`backend/.../notifications/push`) + FCM/APNs wiring scheduled with mobile (Step 5).

## Stage 6 — Verification (pending — run locally)
1. `npm install` (root) → generates `package-lock.json`, hoists deps.
2. `supabase link` (existing project) → `supabase db push` (additive migrations).
3. `npm run db:types` (regenerate `shared/src/types/supabase.ts`).
4. `npm run build:backend` + `npm run typecheck` → fix any residual import edges (expected: a few `@/lib/utils`/`routes` → `@medilink/shared` swaps to fully dedupe; frontend takes `lib/supabase/{client,server,middleware}` in Step 6).

## SKIPPED (out of MediLink patient scope, ~65 routes)
`admin/*`, `doctor/*`, `doctors/me/*`, `doctors/[id]/{invite,onboarding,status,documents,availability/block}`, most `facilities/[id]/*` (mgmt/reports/earnings/staff/queue), `technician/*`, `technicians/*`, `staff/*`, `queue-items/*`, `refunds/[id]/action`, `waitlist/[id]/claim`, `invitations/*`, `email/bulk`, `send-announcement-email`, `test-email`, `upload-doctor-photo`, `integrations/google/status`; helpers `lib/sidebarConfig`, `lib/services/queueSync`.
