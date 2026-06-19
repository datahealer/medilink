# MediLink — HAMS Backend Reuse Report (Step 1, analysis only)

**Source analyzed:** `D:\New folder (3)\hams-frontend` (entire repo, not just `src/`).
**Target:** `D:\Medilink` (empty monorepo to be bootstrapped).
**Scope lens:** MediLink is the **patient** product (Next.js web + React Native mobile). HAMS is a multi-role system (patient · doctor · facility-admin · technician · super-admin); reuse is judged against the **patient** surface.
**Status:** Analysis only. **No files created or moved.** Awaiting approval before Step 2.

---

## 0. Architecture reality (verified — overrides the "NestJS" assumption)
There is **no NestJS** in HAMS (no `@nestjs/*`, no `nest-cli.json`). The backend **is** the Next.js app:
- **Next.js 15 App Router**, React 18, TypeScript.
- **~165 API route handlers** under `src/app/api/**` (~25 domain groups).
- **Supabase** (`@supabase/ssr` + `supabase-js`) — Postgres, 20+ migrations, RLS on every table, RPCs (`book_appointment`, `get_available_slots`, nearby/overbooking/waitlist, health-insights), triggers, Edge Functions.
- Integrations: **Thawani** (Omani gateway — matches MediLink) + **Stripe**, **Google OAuth + Calendar** (`googleapis`), **Gemini + Groq** (AI), **Resend/nodemailer** (email), **pdfkit** (PDF), **bcryptjs**, Redux Toolkit, Tailwind + shadcn/Radix, `react-leaflet` (maps), `recharts`/FullCalendar (staff dashboards).

**Consequence:** we **re-home, don't rewrite**. RLS-safe CRUD → direct Supabase calls from `frontend`/`mobile`; privileged/secret/heavy routes → stay as Next.js handlers in `backend/`. This report's categories follow that line. *(Consistent with HAMS `MEDILINK_RN_MONOREPO_MIGRATION_PLAN.md §0–§1.3.)*

The deciding test per module: **“can a patient client do this safely against Supabase RLS, or does it need a secret / service-role / heavy compute?”**

---

## 1. Reusable As-Is
Carries over unchanged (the route is either deleted in favour of a direct Supabase call from the client/shared layer, or — for the Supabase layer itself — reused verbatim). No logic change.

| Area | Items | Reuse path |
|---|---|---|
| **Supabase platform** | Existing project (`supabase/.temp/linked-project.json`), schema (`full_schema 1.sql`), all **migrations** (20+), **RLS** on every table, **RPCs** (`book_appointment`, `get_available_slots`, nearby, overbooking, waitlist), **triggers**, **Edge Functions**, `config.toml` | `supabase/` at repo root — **do not fork the DB** |
| **Supabase clients** | `lib/supabase/{client,browser,server,middleware}.ts` | → `frontend`/`mobile` (anon, RLS-bound) |
| **Auth (patient)** | Supabase sign-in/up/out, session, OTP (`auth/send-otp`,`verify-otp`,`resend-otp`), `auth/signout`, `auth/session-log`, `auth/google` (initiate); `lib/auth/{getUser,getServerSession,validatePassword,actions,api}`, `context/AuthContext.tsx`, `middleware.ts` (`updateSession`) | Web: SSR cookies · Mobile: bearer tokens — **identical RLS** |
| **Profile & Family** | `me`, `patients/me`, `patients/me/profile`, `patients/me/family`, `patients/me/family/[id]`, `patients/family`, `patients/me/favourites` (+ `hooks/useDoctorFavourites`, `useFacilityFavourites`) | Direct Supabase (RLS) |
| **Doctor discovery** | `doctors` (search), `doctors/[id]`, `doctors/[id]/availability`, `slots` | Direct Supabase + RPC |
| **Facility discovery** | `facilities`, `facilities/nearby` (RPC), `facilities/[id]`, `facilities/[id]/available-slots`, `facilities/[id]/doctors` | Direct Supabase (trim to patient-visible columns via RLS/views) |
| **Appointments (patient)** | `appointments/book` (RPC), `appointments/[id]`, `/cancel-emergency` (own), `/check-in`, `/rebook`, `/ics`, `patients/me/appointments`, `patients/me/appointments/upcoming`, `appointments/emergency/mine` | RLS + booking RPC (atomic — never reimplemented client-side) |
| **Medical records / Labs** | `patients/me/medical-history`, `patients/me/documents` (+`[id]`, attach), `results`, `results/[id]/viewed`, `patients/me/results` | Direct Supabase; signed-URL reads |
| **Prescriptions (read)** | `prescriptions`, `prescriptions/[id]`, `patients/me/prescription-scans` | Direct Supabase |
| **Reviews** | `reviews` (create), `reviews/me`, `reviews/[id]` | Direct Supabase (RLS) |
| **Notifications** | `notifications/me`, `read-all`, `unread-count` + **Supabase Realtime** | Direct Supabase |
| **GDPR toggles** | `users/me/consent`, `users/me/privacy` | Direct Supabase |
| **Waitlist (patient)** | `waitlist`, `waitlist/mine` | Direct Supabase |
| **Types / i18n / constants** | `types/supabase.ts` (generated), `types/facility.ts`, `types/global.d.ts`; `i18n/*` (Provider, messages, `translate`, `useI18n`) EN/AR; `constants/clinicTypes.ts`; `lib/utils.ts`, `lib/routes.ts` | → `shared/` |
| **Storage buckets** | Patient-relevant: `patient-docs`/`patient_documents`, `prescription_scans`, `prescriptions`, `lab-results`, `account_image` (+ RLS policies migration) | Reused; signed-URL reads from client |

---

## 2. Reusable With Minor Changes
Stays a **Next.js privileged route** (secret / service-role / heavy compute) — relocated **verbatim** into `backend/`; "minor changes" = bearer-token/patient-scope verification, payload trimming, env wiring, optional mobile pagination. **No framework rewrite.**

| Area | Items | Why server-side | Change needed |
|---|---|---|---|
| **Payments** | `payments/checkout`, `payments/[id]/invoice`, `payments/[id]/refund`, `payments/get-appointment/[id]`, `payments/unpaid`, `payments/webhook` | Thawani + Stripe **secret keys**, webhook signature | Confirm Thawani is primary for MediLink; verify mobile return URLs |
| **AI (Me Assistant/Insights)** | `ai/symptom-check`, `ai/suggest-doctor`, `ai/scan-prescription`, `ai/schedule-assist` | Gemini + Groq **secret keys** | Re-skin responses to "Me" brand; keep `MOCK_AI` flag |
| **PDF generation** | `prescriptions/[id]/generate-pdf`,`/download`,`/share-link`; `patients/[id]/medical-history/pdf` | `pdfkit` heavy compute | None (move as-is) |
| **Auth side-effects** | `auth/signup` (service-role profile create), `auth/set-password`, `auth/2fa/*`, `auth/google/callback` | service-role / OAuth secret | Patients bypass AAL2 (2FA optional) |
| **Calendar / files** | `appointments/[id]/google` (Calendar sync), `patients/me/profile-photo` (`sharp` resize) | `googleapis` secret / image processing | Keep server; `ics` can also be direct |
| **Email / SMS** | `lib/email/{sendInvoice,sendNotification}`, `lib/sms/sendOtp` | Resend/nodemailer / SMS secret | Move to `backend/lib`; patient templates |
| **Search** | `doctors`/`facilities` search | — | Add **cursor pagination** for mobile lists |
| **Supabase (additive)** | schema | — | +1–2 **additive** migrations (`device_tokens`, `notification_preferences`) |

---

## 3. MediLink-Specific Development (net-new)
Not present in HAMS; build fresh.

| Item | Notes |
|---|---|
| **Push notifications transport** | FCM/APNs dispatch + `device_tokens` table — the **only true rebuild**. Realtime in-app already exists. |
| **React Native (Expo) mobile app** | New client — navigation, theme, i18n, Supabase bearer-token session (SecureStore), API layer, screens. |
| **Patient web frontend** | New Next.js App Router patient portal (HAMS web is the **staff/admin** dashboard — not reused for patient UI). |
| **MediLink design system** | Tokens, components, brand (Agatho/Manrope/29LT Zarid Sans, Me submark) — already produced in `figma/` + `design-doc/`. |
| **Branded UX wrappers** | "Me Care Hub / Me Assistant / Me Health Insights / Me Vault / Facility Messages" over existing AI/records/notifications endpoints. |
| **Auth/onboarding mobile screens** | Splash, Welcome, Onboarding, Language — UI only (auth backend reused). |
| **Offline cache / optimistic UI** | Mobile-only concern over the reused queries. |

---

## 4. Not Required (out of MediLink patient scope)
HAMS staff/admin surfaces — **excluded** from the patient app (kept in HAMS / a future ops console, not migrated to MediLink).

- **Admin:** `admin/*` (audit-logs, earnings(+export), facilities, lab-results, moderation, payouts, reviews, stats).
- **Doctor portal:** `doctor/*`, `doctors/me/*`, `doctors/[id]/{invite,onboarding,status,documents,availability/block}`, `integrations/google/status`.
- **Facility-admin:** most `facilities/[id]/*` (admins, analytics, announcements, branches, calendar, earnings/payouts, logo, patients, photos, queue, refunds, reports, revenue, staff(+metrics), technicians, verify, status, admin-invite/limit).
- **Technician / staff / queue:** `technician/*`, `technicians/*`, `staff/*`, `queue-items/*`, `refunds/[id]/action`, `waitlist/[id]/claim`.
- **Ops messaging/onboarding:** `invitations/*`, `email/bulk`, `send-announcement-email`, `test-email`, `upload-doctor-photo`.
- **Code:** `lib/services/queueSync.ts`, `lib/sidebarConfig.ts`, staff RBAC `lib/auth/{requireFacilityAccess,requireRole,withRole}` (only `roles.ts` extracted to `shared`), `lib/audit*` (admin), staff-only deps (FullCalendar, recharts).

---

## 5. Counts & estimate
- **~165** API routes total → **patient-relevant ~95–100**; of those ~**60–65%** collapse to **direct Supabase** (Category 1) and ~**35–40%** stay as privileged `backend/` routes (Category 2). **~65** routes are **Not Required** (Category 4).
- **Net-new build:** push transport + the two clients’ UI (Category 3). No business-logic rebuilds.
- **Backend completion for MediLink patient scope (pre-UI): ≈ 85–90%** — schema/RLS/RPC/Edge Functions/auth/payments/AI/PDF all reused; remainder is push transport + 1–2 additive migrations + mobile pagination/wiring.

---

## 6. Proposed migration plan (Steps 2–7) — **for approval**
Per the required structure (`backend/ frontend/ shared/ mobile/ supabase/ scripts/ docs/`; **no** `apps/`, `services/`, `packages/`):

1. **Step 2 — Foundation:** root `package.json` npm workspaces `[backend, frontend, shared, mobile]`, single lockfile, `.env.example` (keys from §0), `.gitignore`, `tsconfig.base.json`; create the six dirs.
2. **Step 3 — Backend:** scaffold `backend/` as a Next.js API app; move the **Category 2** privileged routes verbatim + `lib/supabase/{service,adminClient,api}` + `lib/{email,sms}` (service-role/secrets stay here only). Produce a per-route migration summary first.
3. **Step 4 — Shared:** extract `types/supabase.ts`, role/status enums, DTOs, validators, constants, utils to `shared/src/{types,utils,config,auth}` + `index.ts`/`mobile.ts`; rewrite imports.
4. **Step 5 — Mobile foundation:** Expo + React Navigation + theme + i18n + Supabase (bearer) + `@medilink/shared` + API layer. **No screens.**
5. **Step 6 — Web foundation:** Next.js App Router + Tailwind + `@medilink/shared` + Supabase + auth foundation. **No screens.**
6. **Step 7 — `docs/MIGRATION_REPORT.md`:** files copied/modified/skipped, APIs reused, shared/Supabase modules, backend completion %.

**Supabase:** reuse the **existing project** (same URL/keys) — `supabase/` migrations + functions copied unchanged; only additive migrations added.

> ⏸ **Approval gate:** I will not create the monorepo or move/copy any files until you approve this plan (and confirm: (a) reuse the existing Supabase project vs. a new one; (b) Thawani as primary payment gateway; (c) single Next.js app holding pages+privileged API, **or** split `frontend/`+`backend/` as two deployables).
