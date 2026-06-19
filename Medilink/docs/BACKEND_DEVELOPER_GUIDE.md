# MediLink — Backend Developer Guide

> Start here. This guide gets a brand-new developer productive **without any prior knowledge of HAMS** (the source project MediLink's backend was migrated from). Companion docs: [BACKEND_MODULES.md](./BACKEND_MODULES.md), [API_CATALOG.md](./API_CATALOG.md), [RUNBOOK.md](./RUNBOOK.md), [TESTING_GUIDE.md](./TESTING_GUIDE.md), [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md).

## 1. Project overview
MediLink is a patient-facing healthcare app for **web (Next.js)** and **mobile (Expo / React Native)**, backed by **Supabase** (Postgres + Auth + Storage + Edge Functions) and a **Next.js API backend** for privileged/heavy operations. Patients can find doctors/facilities, book/cancel/reschedule appointments, manage family members, view lab results & prescriptions, manage medical records, pay (Thawani primary, Stripe secondary), and receive notifications.

**Core design principle — "re-home, don't rewrite":**
- **RLS-safe CRUD** (anything a patient may do under Row-Level Security) → executed **directly against Supabase** from web/mobile via the **shared API layer** (`shared/src/api/*`).
- **Privileged/secret/heavy** work (service-role keys, payment secrets, AI keys, PDF generation, OTP/2FA) → **Next.js API routes** in `backend/`.

There is **no NestJS**. The backend is Next.js App Router route handlers.

## 2. Architecture diagram
```
                        ┌───────────────────────────────────────────────┐
                        │                  Clients                       │
   ┌────────────────────┴───────────────┐        ┌──────────────────────┴───────────────┐
   │  frontend/  (Next.js, web, :3000)   │        │  mobile/  (Expo RN)                   │
   │  SSR + cookie Supabase session      │        │  SecureStore + bearer Supabase session│
   └───────┬─────────────────────┬───────┘        └──────┬──────────────────────┬─────────┘
           │ direct (RLS)        │ privileged            │ direct (RLS)         │ privileged
           │                     │ (fetch + cookie)      │                      │ (fetch + Bearer token)
           ▼                     ▼                       ▼                      ▼
   ┌─────────────────────────────────────────────────────────────────────────────────────┐
   │                       shared/  (@medilink/shared) — used by BOTH                      │
   │   src/api/* (typed direct-Supabase modules)   src/types (Database)   i18n / config    │
   └───────┬─────────────────────────────────────────────────────────────┬────────────────┘
           │                                                              │
           ▼                                                              ▼
   ┌───────────────────┐                                   ┌─────────────────────────────┐
   │   Supabase (cloud) │◀──────── service role ───────────│  backend/ (Next.js API,:3001)│
   │  Postgres + RLS    │   (privileged routes only)        │  payments · AI · PDF · OTP  │
   │  Auth · Storage    │                                   │  push dispatch · GDPR        │
   │  Edge Functions    │                                   └─────────────────────────────┘
   │  RPCs (SECURITY     │
   │       DEFINER)      │
   └───────────────────┘
```
See [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) for Mermaid flow diagrams (auth, booking, payment, notifications, AI).

## 3. Monorepo structure
npm workspaces, single root `package.json` + lockfile. Exact top-level layout:
```
Medilink/
├── backend/      # Next.js API (privileged/heavy ops only — no UI). Port 3001.
├── frontend/     # Next.js App Router patient web. Port 3000.
├── mobile/       # Expo / React Native patient app.
├── shared/       # @medilink/shared — types, API layer, i18n, config (web + mobile + backend)
├── supabase/     # config.toml, migrations/ (123), functions/ (13 Edge Functions)
├── scripts/      # repo scripts
├── docs/         # this documentation set
├── package.json  # workspaces + scripts (dev:*, build:*, typecheck, db:push, db:types)
├── tsconfig.base.json
└── .env.example
```

## 4. Workspaces
| Workspace | Package | Role | Key entry points |
|---|---|---|---|
| `backend/` | `@medilink/backend` | Privileged Next.js API | `src/app/api/**/route.ts`, `src/lib/**` |
| `frontend/` | `@medilink/frontend` | Patient web (App Router) | `src/app/`, `src/lib/supabase/`, `src/context/`, `src/i18n/` |
| `mobile/` | `@medilink/mobile` | Patient mobile (Expo) | `App.tsx`, `src/lib/`, `src/services/`, `src/navigation/` |
| `shared/` | `@medilink/shared` | Shared code | `src/api/`, `src/types/`, `src/config/`, `src/auth/` |

Path aliases (configured per-workspace `tsconfig.json`):
- `@medilink/shared` → `shared/src/index.ts` (web + backend entry)
- `@medilink/shared/mobile` → `shared/src/mobile.ts` (RN-safe subset — excludes web-only utils)
- `@/*` → that workspace's `src/*`

Web/backend resolve the shared package via `transpilePackages: ["@medilink/shared"]` in `next.config.ts`. Mobile resolves aliases at Metro runtime via `babel-plugin-module-resolver` in `mobile/babel.config.js`.

## 5. Backend responsibilities (`backend/`)
The backend exists **only** for things a patient client cannot or should not do directly:
- **Secrets:** Thawani/Stripe keys, `SUPABASE_SERVICE_ROLE_KEY`, Google client secret, Gemini/Groq keys, email creds, `INVITE_SECRET`.
- **Service-role DB access:** operations that must bypass RLS (e.g. enqueueing on payment webhook, GDPR export/delete).
- **Heavy compute / native libs:** PDF generation (`pdfkit`), image processing (`sharp`).
- **Auth side-effects:** signup, OTP send/verify/resend, 2FA, session logging, Google OAuth callback.
- **Push dispatch:** fan-out to Expo/FCM/APNs from device tokens.

Backend layout:
- `backend/src/app/api/**/route.ts` — 36 route handlers (see [API_CATALOG.md](./API_CATALOG.md) §B).
- `backend/src/lib/supabase/` — clients: `service.ts` (service role), `server.ts`/`api.ts` (request-scoped, RLS), `adminClient.ts`, `client.ts`/`browser.ts`/`middleware.ts`.
- `backend/src/lib/auth/` — `getServerSession`, `getUser`, `requireRole`, `withRole`, `validatePassword`, etc.
- `backend/src/lib/email/`, `backend/src/lib/sms/`, `backend/src/lib/audit/` — side-effect helpers.
- `backend/next.config.ts` — `serverExternalPackages` keeps `pdfkit`, `@google/generative-ai`, `groq-sdk`, `stripe`, `nodemailer`, `googleapis`, `sharp` server-side.

## 6. Shared package responsibilities (`shared/`)
The single source of truth shared by all clients:
- **`src/api/*`** — the **re-home data layer**: 13 typed modules (auth, profile, family, doctors, favourites, facilities, appointments, records, labs, prescriptions, notifications, reviews) exposing **49 functions** that each take a typed `DB` (Supabase) client. Web passes an SSR/cookie client; mobile passes a bearer client. RLS is identical. Documented in [API_CATALOG.md](./API_CATALOG.md) §A and [API_COMPLETION_REPORT.md](./API_COMPLETION_REPORT.md).
- **`src/types/`** — `supabase.ts` (generated `Database` types) + `index.ts` (augments `Database` with the two additive tables `device_tokens`, `notification_preferences`).
- **`src/auth/`** — role helpers (`STAFF_ROLES`, `isStaff`).
- **`src/config/`** — `APP_NAME`, `SUPPORTED_LOCALES`, clinic types, and EN/AR **i18n** catalogs (`config/i18n`).
- **`src/index.ts`** (web/backend) and **`src/mobile.ts`** (RN-safe) barrels.

## 7. Supabase responsibilities (`supabase/`)
The reused HAMS project (no schema fork — additive migrations only):
- **Postgres + RLS** — all patient data; RLS scopes every row to its owner. The shared API relies on RLS for security.
- **Auth** — email/password, Google OAuth, OTP, 2FA. Web uses cookie sessions; mobile uses bearer tokens.
- **Storage** — buckets `patient-docs` (documents), `lab-results` (lab files), profile photos.
- **RPCs (SECURITY DEFINER)** — atomic/guarded operations: `book_appointment_atomic`, `cancel_appointment_safe`, `reschedule_appointment_atomic`, `rebook_appointment`, `claim_waitlist_appointment`, `get_available_slots`, `get_nearby_facilities`, `get_nearby_branches`, `enqueue_appointment`, … (see [API_CATALOG.md](./API_CATALOG.md) §D).
- **Edge Functions (13)** — async/scheduled jobs: report generation, invoice, health insights, booking confirmation, lab/waitlist notifications, refund polling, GDPR purge (see [API_CATALOG.md](./API_CATALOG.md) §C).
- **Additive migrations** (MediLink-specific): `20260620000001_device_tokens.sql`, `20260620000002_notification_preferences.sql`.

## 8. Where to go next
1. **Set up & run** → [RUNBOOK.md](./RUNBOOK.md)
2. **Module-by-module reference** → [BACKEND_MODULES.md](./BACKEND_MODULES.md)
3. **Every endpoint** → [API_CATALOG.md](./API_CATALOG.md)
4. **Test each module** → [TESTING_GUIDE.md](./TESTING_GUIDE.md)
5. **What's done / what's left** → [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md), [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)
