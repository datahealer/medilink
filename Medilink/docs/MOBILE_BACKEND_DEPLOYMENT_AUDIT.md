# MediLink — Mobile Backend Deployment Audit

**Scope:** what must be deployed so the existing TestFlight (iOS/Expo) build can reach a live backend instead of mock data. **Web (`frontend/`) is explicitly excluded from this deployment.**
**Method:** read-only inspection of the repository, plus live verification against the actual linked Supabase project via the Supabase CLI and direct REST queries using credentials already present in this checkout (`backend/.env.local`). No code was modified, nothing was deployed, no infrastructure was created.
**Date:** 2026-07-07

---

## ⚠️ Read this first — a finding that changes what "deploy the backend" will actually achieve

I inspected `mobile/src` directly and found **no product screens exist in this repository's mobile app**. This is not an inference — it's stated by the project's own documentation and independently confirmed by reading the code:

- `docs/FOUNDATION_REPORT.md:3`: *"**No product UI screens** were built — only providers, configuration, clients, and navigation/routing scaffolding."*
- `docs/FOUNDATION_REPORT.md:122-125` (§9, "What is intentionally NOT built"): *"Product UI screens (auth screens, home, appointments, records, account)... Status: monorepo foundation complete & wired — **ready for UI/feature development**."*
- `docs/DEVELOPMENT_ROADMAP.md:13`: `[░░░░░░░░░░] Mobile UI screens TODO`
- Direct code check: `mobile/src/screens` contains only a `.gitkeep`. `mobile/src/navigation/RootNavigator.tsx` renders a literal `Placeholder` component with text like *"Signed in — app screens pending"* / *"Signed out — auth screens pending"* instead of any real screen.
- A repo-wide search for mock data in mobile (`mock|Mock|MOCK`) returns **zero matches** in `mobile/src` — there is no in-memory mock dataset to "switch off" in the mobile app as currently checked in.
- The generic backend-call helper `mobile/src/services/api.ts` (`apiFetch()`) exists but **is never called from anywhere** — no screen invokes payments, AI, bookings, or anything else, because no screens exist yet.

**What this means concretely:** if the TestFlight build you already have shows real screens with data (even mock data), that binary was **not built from this repository's current `mobile/` source** — it must come from a different branch, an unmerged local working copy, or a separate codebase. Deploying the backend, by itself, will not change what that TestFlight build displays, because nothing in this repo's mobile source currently calls the backend or Supabase for any feature. I'm flagging this because it directly affects your stated objective ("TestFlight app stops using mock data") — you should reconcile this discrepancy (find out where the TestFlight binary's source actually lives) before or alongside doing the backend deployment work below, which stands on its own as valid, necessary infrastructure work regardless.

The rest of this document proceeds on the assumption that the backend-deployment question is still worth answering precisely on its own merits — it is real, well-defined work needed before *any* future mobile build (from wherever its source ends up) can go live.

---

## 1. Repository Architecture

```
medilink/                          (npm workspaces root, private, Node >=20)
├── backend/     @medilink/backend   Next.js 15 — API-only (no pages/UI), privileged/heavy ops
├── frontend/    @medilink/frontend  Next.js 15 — patient web app (OUT OF SCOPE for this deployment)
├── mobile/      @medilink/mobile    Expo SDK 51 / React Native 0.74.5 — scaffolding only, no screens
├── shared/      @medilink/shared    Plain TypeScript library, NOT compiled — consumed as raw .ts source
├── supabase/                        Migrations (124 files) + 13 Edge Functions + config.toml — ALREADY LIVE
├── docs/                            Documentation (audits, reports, runbook)
└── scripts/                         Empty (.gitkeep only) — "populated as needed"
```

Root `package.json` workspaces: `["shared", "backend", "frontend", "mobile"]`. There is no root README; `docs/RUNBOOK.md` is the closest thing to a setup guide, and it documents **local development only** — it contains no hosting/production-deploy commands.

## 2. Per-folder deployment classification

| Folder | Deployable on its own? | Requires its own deployment for this task? | Library only? | Bundled into another project? | Required for mobile backend? |
|---|:---:|:---:|:---:|:---:|:---:|
| `backend/` | ✅ Yes — standalone Next.js server (`next start`) | ✅ **Yes — this is the deployment** | No | No | ✅ Yes — this *is* "the backend" |
| `frontend/` | ✅ Yes — standalone Next.js server | ❌ No (explicitly excluded per your instructions) | No | No | ❌ No — mobile never calls it |
| `mobile/` | N/A — not server-deployable; distributed as an app binary via EAS/App Store | N/A (you said the TestFlight build already exists) | No | No | N/A — it's the *consumer*, not a deployable service |
| `shared/` | ❌ No — has no server, no build output, nothing to run | ❌ No | ✅ Yes — pure TypeScript source library | ✅ Yes — transpiled directly into `backend/`'s and `frontend/`'s Next.js build (`transpilePackages`), and into `mobile/`'s Metro bundle (via Babel aliasing) | ✅ Indirectly — its code runs *inside* backend's bundle and (for direct-Supabase calls) inside mobile's own bundle; there is nothing to deploy separately |
| `supabase/` | ✅ Yes (via Supabase CLI: `db push`, `functions deploy`) | 🟢 **Already done** — verified live, see §6 | No — it's your actual database + edge functions | No | ✅ Yes — this is the data layer both backend and mobile ultimately depend on |

### Why `shared/` needs no independent deployment

`shared/package.json` has `"main": "src/index.ts"`, `"exports": {".": "./src/index.ts", "./mobile": "./src/mobile.ts"}`, and **no `build` script at all** — only `typecheck`. It is never compiled to a `dist/`. Every consumer transpiles the raw TypeScript source directly at their own build time:
- `backend/next.config.ts` and `frontend/next.config.ts` both set `transpilePackages: ["@medilink/shared"]`.
- `mobile/babel.config.js` uses `babel-plugin-module-resolver` to alias `@medilink/shared` → `../shared/src/index.ts` and `@medilink/shared/mobile` → `../shared/src/mobile.ts` directly (Metro doesn't read tsconfig `paths`, so this mirrors it at the bundler level).

**Note:** root `package.json` defines a `build:shared` script (`npm run build --workspace=@medilink/shared`), but since `shared/package.json` has no `build` script, running it today fails with npm's "missing script" error. This is a pre-existing inconsistency, not something blocking your deployment (nothing actually needs `shared/`'s compiled output), but worth knowing if you run `npm run build:shared` expecting it to work.

### Why `shared` contains API code at all

`shared/src/api/*` holds the "repository layer" — typed functions that take a Supabase client and run direct-Supabase queries/RPCs under RLS (e.g. `api.appointments.bookAppointment`, `api.doctors.searchDoctors`). This is intentional so that **web and mobile share one implementation of every plain-CRUD operation** instead of each re-writing the same queries. `shared/src/mobile.ts` re-exports an RN-safe subset (skipping web-only utilities like `cn`/tailwind-merge) of the same `api` namespace, plus `i18n` and typed `Database`. Both `shared/src/index.ts` (web/backend) and `shared/src/mobile.ts` do the identical `export * as api from "./api/index"` — mobile and web are meant to call **the exact same functions**.

### `@medilink/shared` import graph

```
                         shared/src/index.ts  (web + backend entry)
                         shared/src/mobile.ts (RN-safe subset entry)
                                    │
      ┌─────────────────────────────┼─────────────────────────────┐
      │                              │                              │
 frontend/                      backend/                        mobile/
 imports:                       imports:                        imports:
 - i18n, Locale                 - Database (types)               - Database (type only,
 - Database (typing)            - @medilink/shared everywhere    src/lib/supabase.ts:4)
 - api.* (heavily —             the shared api.* is NOT called   - i18n, SUPPORTED_LOCALES,
   dashboard, appointments,     from backend routes — backend    Locale (src/i18n/index.tsx:13)
   find-doctors, records,       does its own direct Supabase     - api.* — available via
   notifications, profile,      queries with a service-role      @medilink/shared/mobile but
   payments, etc.)              client for privileged operations NOT imported anywhere yet
                                                                    (no screens exist to call it)
```

Only **two** files in `mobile/src` import `@medilink/shared` today: `mobile/src/lib/supabase.ts` (type-only, for the Supabase client generic) and `mobile/src/i18n/index.tsx` (translation catalogs). The `api` namespace is available to mobile but has zero current call sites — confirming again there's no feature code consuming it yet.

## 3. Backend Architecture — every path traced

There are **two distinct paths**, exactly as the plan for a previous phase of this project already documented (`docs/API_CATALOG.md`, `docs/FOUNDATION_REPORT.md §5`) — and both apply equally to mobile once mobile has screens:

**Path A — plain CRUD (majority of features):**
```
Mobile App
  ↓ shared/src/api/*  (api.appointments.*, api.doctors.*, api.profile.*, api.records.*, api.labs.*, …)
  ↓ mobile/src/lib/supabase.ts — @supabase/supabase-js client, Bearer-token session (SecureStore)
  ↓ Supabase directly — PostgREST + RPC calls, enforced by Row-Level Security
  ↓ Database (Postgres) — same project, same RLS, same schema web already uses
```
This is "Mobile App → shared API → Supabase directly → Database" — **no backend Next.js app in the loop at all.** This path is already 100% live today (Supabase is fully deployed — §6) — mobile would only need real screens calling these functions to use it; no backend deployment is required for this path.

**Path B — privileged/heavy/secret operations:**
```
Mobile App
  ↓ mobile/src/services/api.ts → apiFetch() → fetch(`${EXPO_PUBLIC_BACKEND_URL}${path}`, {Authorization: `Bearer <token>`})
  ↓ Backend Route (Next.js, backend/src/app/api/**)  ← THIS is what needs deploying
  ↓ (depending on route) Supabase RPC / service-role table write / external API (Thawani, Google, Groq, SMTP)
  ↓ Database / third-party service
```
This is "Mobile App → shared API (thin fetch wrapper) → Backend Route → Supabase RPC/Database (or external service)". Anything touching payments, AI, PDF generation, 2FA, email, or GDPR export goes through this path, because those need secrets (`SUPABASE_SERVICE_ROLE_KEY`, `THAWANI_SECRET_KEY`, `GROQ_API_KEY`, etc.) that must never ship inside the mobile bundle.

**The only thing this deployment task is actually about is standing up Path B's box — `backend/` — somewhere mobile can reach it, and correcting mobile's env var so it knows the address.**

## 4. Deployment Requirements — what's needed per feature

| Feature | Needs `backend/` deployed? | Needs anything else? |
|---|:---:|---|
| Stop using mock data (generally) | N/A per §0 finding — mobile has no data-fetching screens to redirect yet | Reconcile the TestFlight source discrepancy first |
| Booking (search doctors, book/cancel/reschedule appointments) | ❌ No | Path A only — already live via Supabase; mobile just needs `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` (already correctly set in `mobile/.env`) |
| Payments (checkout, webhook, verify) | ✅ **Yes** | `backend/` deployed + real `THAWANI_*` secrets + Thawani's webhook configured to point at the deployed backend's public URL (not localhost) |
| Notifications (list/read, in-app) | ❌ No (read path is Path A, direct Supabase) | Already live |
| Notifications (server-dispatched push) | ✅ **Yes**, for the dispatch route | `backend/` deployed + `INVITE_SECRET` set (currently **absent** from `backend/.env.local` — the route will reject every call until this exists) + EAS `projectId` configured in `mobile/app.json` (currently empty) for push tokens to resolve at all |
| AI (symptom check, doctor suggestion, prescription scan, schedule assist) | ✅ **Yes** | `backend/` deployed + a real `GROQ_API_KEY` (confirmed the only AI provider actually wired up — see §8), and `MOCK_AI` set to `false` (currently `MOCK_AI=true` in `backend/.env.local`, meaning AI responses are stubbed even once deployed, unless this is changed) |
| Webhooks (Thawani payment confirmation) | ✅ **Yes** | Backend must be on a **publicly reachable HTTPS URL** — Thawani cannot call `localhost`. This is also why `backend/src/app/api/payments/verify/route.ts` exists as a client-callable fallback for exactly this "webhook can't reach a local/LAN backend" situation (its own doc comment says so verbatim) |
| Auth (signup, OTP, 2FA, password) | ✅ Mostly yes (`/api/auth/*` routes are backend-hosted) | `backend/` deployed; some auth (session refresh, `getUser`) is direct-Supabase and needs nothing extra |
| Records/labs/prescriptions (viewing) | ❌ No | Path A, already live |
| Prescription PDF/share, medical-history PDF, profile-photo upload | ✅ Yes | `backend/` deployed (uses `pdfkit`/`sharp`, kept server-side deliberately) |
| GDPR data export / account deletion | ✅ Yes | `backend/` deployed → triggers `export-user-data`/`purge-user-auth` Edge Functions (already live) |
| Google Calendar sync | ✅ Yes | `backend/` deployed + `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` (currently absent from `backend/.env.local`) |

**Bottom line: `backend/` is the one and only service you need to deploy for this task.** Supabase (database, RLS, RPCs, Edge Functions, Storage) is already fully live and requires no action.

## 5. Backend API Route Inventory

All **37** routes under `backend/src/app/api/**/route.ts`, confirmed via direct file listing plus a full read of every handler this session:

| Route | Method | Purpose | Auth | External deps | Mobile-callable? |
|---|---|---|---|---|---|
| `/api/ai/scan-prescription` | POST | OCR/extract meds from a prescription photo via vision LLM | Session (manual `getUser()`, no AAL2) | Groq (vision model), `sharp` | ✅ Yes |
| `/api/ai/schedule-assist` | POST | Conversational booking assistant — parses intent/date/specialty | Session (manual `getUser()`) | Groq, `chrono-node`, Supabase RPCs | ✅ Yes |
| `/api/ai/suggest-doctor` | POST | Symptom→specialty→doctor recommendation, rate-limited 5/hr | Session (manual `getUser()`) | Groq, `MOCK_AI` flag | ✅ Yes |
| `/api/ai/symptom-check` | POST | Streaming (SSE) AI symptom triage | ⚠️ **None — public/unauthenticated** | Groq (2 calls) | ✅ Yes, but unauthenticated |
| `/api/appointments/[id]/google` | POST | Create a Google Calendar event | `getAal2UserOrThrow` | `googleapis` | 🟡 Maybe |
| `/api/auth/2fa/challenge` | POST | Start an MFA TOTP challenge | `getUserOrThrow` | Supabase Auth MFA | ❌ Patients never hit AAL2 (`getAal2UserOrThrow`'s own logic: "Patients are never subject to AAL2 enforcement") |
| `/api/auth/2fa/disable` | POST | Disable 2FA | `getUserOrThrow` | Supabase Auth MFA | ❌ Same |
| `/api/auth/2fa/recovery/generate` | POST | Generate 10 one-time recovery codes | `getUserOrThrow` | `bcryptjs` | ❌ Same |
| `/api/auth/2fa/recovery/use` | POST | Redeem a recovery code (rate-limited 5/10min) | `getUserOrThrow` | `bcryptjs` | ❌ Same |
| `/api/auth/2fa/setup` | POST | Enroll a new TOTP factor | `getUserOrThrow` **+ staff-only role guard** | Supabase Auth MFA | ❌ Staff-only |
| `/api/auth/2fa/verify` | POST | Verify TOTP (rate-limited 5/5min) | `getUserOrThrow` | Supabase Auth MFA | ❌ Same as challenge |
| `/api/auth/google/callback` | GET | OAuth callback → stores tokens, redirects to **frontend** | Manual `getUser()` | Google OAuth | ❌ Browser redirect flow, web-only |
| `/api/auth/google` | GET | Redirects to Google's consent screen | None | Google OAuth | ❌ Web-only |
| `/api/auth/resend-otp` | POST | Resend phone-verification OTP | Manual `getUser()` + role=patient | SMS send is **commented out** (Twilio) | ✅ Yes |
| `/api/auth/send-otp` | POST | Generate/send phone OTP | `getUserOrThrow` | ⚠️ Returns the OTP in plaintext in the JSON response (dev leftover) | ✅ Yes |
| `/api/auth/session-log` | POST | Fire-and-forget login audit entry | Manual `getUser()` (non-fatal) | audit lib | ✅ Yes |
| `/api/auth/set-password` | POST | Set password (invite-token or self-service) | HMAC invite token **or** `getUserOrThrow` | ⚠️ Fires an internal call to `/api/notifications/admin-password-set`, which **does not exist** — dead reference, silently swallowed | ✅ Yes (self-service path) |
| `/api/auth/signup` | POST | Patient self-registration | Public (service-role) | Supabase admin auth | ✅ Yes |
| `/api/auth/verify-otp` | POST | Verify phone OTP | Manual `getUser()` + role=patient | Supabase | ✅ Yes |
| `/api/notifications/push` | POST | Server-to-server push fan-out | Shared secret `x-internal-secret == INVITE_SECRET` (not user auth) | Expo push API | ❌ Server-to-server only — dispatches *to* mobile, never called *by* it |
| `/api/patients/[id]/medical-history/pdf` | GET | Generate a medical-history report | `getAal2UserOrThrow` + role/ownership | Edge Function `generate-patient-report` | ✅ Yes |
| `/api/patients/me/profile-photo` | POST | Upload profile photo | `getAal2UserOrThrow` | Storage (`account_image`) | ✅ Yes |
| `/api/payments/[id]/invoice` | GET | Redirect to stored invoice URL | ⚠️ **None — no auth/ownership check at all** (IDOR: any payment UUID resolves) | Supabase | 🟡 Reachable, not a typical direct call |
| `/api/payments/[id]/refund` | POST | Process a refund per facility policy | `getAal2UserOrThrow` | **Thawani** refund API | 🟡 Staff/admin action typically |
| `/api/payments/checkout` | POST | Create a Thawani checkout session | `getAal2UserOrThrow` | **Thawani** | ✅ Yes — core payment flow |
| `/api/payments/get-appointment/[id]` | GET | Fetch appointment fee for checkout | `getAal2UserOrThrow` | Supabase | ✅ Yes |
| `/api/payments` | GET | List the current patient's payments | `getAal2UserOrThrow` | Supabase | ✅ Yes |
| `/api/payments/unpaid` | GET | List unpaid appointments | `getAal2UserOrThrow` | Supabase | ✅ Yes |
| `/api/payments/verify` | POST | Client-side fallback to finalize a Thawani payment on redirect return | `getAal2UserOrThrow` | **Thawani** session-status API | ✅ Yes — mobile calls this after returning from checkout |
| `/api/payments/webhook` | POST | Thawani payment confirmation | ⚠️ **None — no signature/secret verification on the incoming webhook at all** | Edge Function `generate-invoice`, **nodemailer/Gmail SMTP** | ❌ Payment-gateway webhook only, never called by any app client |
| `/api/prescriptions/[id]/download` | GET | Signed URL to download a prescription PDF | `getAal2UserOrThrow` + ownership | Storage | ✅ Yes |
| `/api/prescriptions/[id]/generate-pdf` | POST | Generate/cache a prescription PDF | `getAal2UserOrThrow` **+ doctor-only ownership** | `pdfkit` | ❌ Doctor-only, not patient mobile |
| `/api/prescriptions/[id]/share-link` | GET | 24h public share token/link | `getAal2UserOrThrow` + ownership | Supabase | ✅ Yes |
| `/api/users/me/account/cancel-deletion` | POST | Cancel a pending self-deletion request | `getAal2UserOrThrow` | audit log | ✅ Yes |
| `/api/users/me/account` | DELETE | Request account deletion (30-day grace) | `getAal2UserOrThrow` (blocks staff) | audit log | ✅ Yes |
| `/api/users/me/data-export/[id]` | GET | Poll a specific export request | `getAal2UserOrThrow` + ownership | audit log | ✅ Yes |
| `/api/users/me/data-export` | GET, POST | List/request GDPR export (rate-limited 2/24h) | `getAal2UserOrThrow` | Edge Function `export-user-data` | ✅ Yes |

### Real security gaps found while reading these routes — flag before going live

These aren't deployment blockers in the "won't run" sense, but they are genuine issues to fix before this backend is publicly reachable and processing real payments/patient data:

1. **`/api/payments/webhook` has no Thawani signature or secret verification.** It trusts `client_reference_id` from the raw request body. Once this backend has a public URL, anyone who can guess or observe an appointment id could POST a fake "paid" event to it.
2. **`/api/ai/symptom-check` is fully unauthenticated** — any caller (not just app users) can hit it, incurring Groq API cost with no rate limit tied to a user.
3. **`/api/payments/[id]/invoice` has no auth or ownership check** — an IDOR: any valid payment UUID returns its invoice URL to anyone.
4. **`/api/auth/send-otp` returns the OTP itself in the plaintext JSON response** — explicitly commented as a dev-only leftover in the code; must not ship to production as-is.
5. `/api/auth/set-password` fires an internal call to `/api/notifications/admin-password-set`, a route that **does not exist** in this codebase — currently a harmless swallowed failure, but a latent bug.

### Features that bypass the backend entirely (direct Supabase, Path A)

Everything in `shared/src/api/*`: `auth` (sign-in/out, session), `profile`, `family`, `doctors`, `favourites`, `facilities`, `appointments` (list/book/cancel/reschedule/rebook/claim-waitlist — via RPCs, but called directly against Supabase, no backend hop), `records`, `labs`, `prescriptions` (read/list only), `notifications` (list/mark-read/preferences), `reviews`. This is the majority of the app's functionality by screen count.

## 6. Supabase — already live, verified directly

I checked this against the actual linked project (`supabase/.temp/project-ref` = `zojrwuvxrkmgnlwyuypg`, which matches the URL already configured in both `backend/.env.local` and `mobile/.env` — confirming all three point at the same one project):

| Item | Status | Evidence |
|---|---|---|
| SQL migrations | ✅ **All 124 local migration files match a remote entry** | `supabase migration list` — every `Local` timestamp has an identical `Remote` timestamp, none pending |
| RPCs (`book_appointment_atomic`, `cancel_appointment_safe`, `claim_waitlist_appointment`, etc.) | ✅ Live | Defined in the already-applied migrations above |
| RLS policies | ✅ Live | Defined in the already-applied migrations above |
| Edge Functions (13 total) | ✅ **All 13 report `ACTIVE`** | `supabase functions list` — `send-booking-confirmation`, `generate-invoice`, `notify-waitlist`, `generate-report`, `generate-patient-report`, `poll-refund-status`, `generate-revenue-report`, `generate-facility-patients-report`, `notify-lab-result`, `broadcast-announcement`, `generate-health-insights`, `export-user-data`, `purge-user-auth` |
| Storage buckets | ✅ Live (9 buckets) | Direct Storage API query — `account_image`, `patient-docs`, `doctor-photos`, `invoices`, `reports`, `lab-results`, `facility-photos`, `user-exports`, `facility-profile-photo` all exist, dated back to March–April 2026 |
| Storage RLS policies | ✅ Live (part of the applied migrations) | Same migrations that create the buckets also set their policies |

**You do not need to run `db:push`, `functions deploy`, or any Supabase CLI command.** The database side of this system is fully provisioned and has real data in it already (I found and traced a real recent payment row during a prior debugging session against this exact project).

One caveat from `docs/RUNBOOK.md:98` / `docs/DEVELOPMENT_ROADMAP.md:10`: these docs describe "123 migrations" — the actual count on disk and applied remotely is **124** (one additional migration, `20260702000000_grant_reschedule_cancel_appointment_rpcs.sql`, postdates when those docs were written). Not a blocker, just a documentation drift to note.

## 7. Deployment Configuration Found in the Repository

I searched the entire repo (excluding `node_modules`) for every category requested:

| Artifact | Found? |
|---|---|
| `Dockerfile` / `docker-compose*` | ❌ None (only an unrelated third-party `node_modules/recast/.devcontainer/Dockerfile`) |
| `.github/workflows/*` (GitHub Actions) | ❌ None — no `.github` directory exists at all |
| `vercel.json` / `.vercel/` | ❌ None |
| `Procfile` | ❌ None |
| `ecosystem.config.js` (PM2) | ❌ None |
| `nginx.conf` | ❌ None |
| `*.tf` / `cdk.json` / `Pulumi.yaml` | ❌ None |
| `eas.json` | ❌ **None anywhere in the repo** — no EAS build profiles exist |
| `app.json` (mobile) | ✅ Exists, but `extra.eas.projectId` is an **empty string** — EAS isn't linked to a project |

**Conclusion: this repository has zero deployment/CI/IaC tooling of any kind committed.** This is explicitly self-reported in `docs/DEVELOPMENT_ROADMAP.md:16`: `[░░░░░░░░░░] Production deployment TODO`, with every item in its "Definition of ready for production" checklist unchecked, including *"Prod env configured; Thawani/Stripe webhooks pointed at prod backend"* and *"EAS builds submitted; web/backend deployed."* You are choosing a hosting provider and deployment method from scratch — the repo doesn't prescribe one (no Vercel project, no Dockerfile to build from, nothing).

`backend/next.config.ts` has no `output: "standalone"` and nothing suggesting a specific target platform. `backend/package.json`'s scripts (`dev`/`build`/`start` = `next dev/build/start -p 3001`) are standard Next.js commands that work on any Node ≥20 host (Vercel, Render, Railway, a plain VM with PM2, a container you build yourself, etc.) — the repo simply hasn't picked one yet. `serverExternalPackages: ["pdfkit", "@google/generative-ai", "groq-sdk", "stripe", "nodemailer", "googleapis", "sharp"]` in `next.config.ts` confirms this needs a real Node.js server runtime (not a pure edge/serverless-only runtime), since `sharp` and `pdfkit` are native/binary-dependent packages.

## 8. Required Environment Variables

For `backend/` to run in production with every feature live (from `.env.example`, cross-checked against what's actually set in `backend/.env.local` today):

| Variable | Currently set locally? | Needed for |
|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Privileged writes (payments, notifications, etc.) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Thawani success/cancel redirect URLs (`checkout/route.ts`) — **must be the deployed backend's public URL in prod, not localhost** |
| `THAWANI_BASE_URL` / `THAWANI_SECRET_KEY` / `THAWANI_PUBLISHABLE_KEY` | ✅ | Payments (confirmed the actual code paths only read these three — `THAWANI_API`/`THAWANI_API_KEY` from `.env.example` are unused in `backend/src`) |
| `MOCK_AI` | ✅ (currently `true`) | Must be set to `false` in prod, or AI responses stay stubbed |
| `GROQ_API_KEY` | ❌ **Missing** | Real AI responses — required if `MOCK_AI=false`. **Correction to `.env.example`'s framing:** only Groq is actually wired up in `backend/src` — `GEMINI_API_KEY`/`@google/generative-ai` is an installed dependency but not referenced by any route handler; don't spend time provisioning it for this task |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | ❌ **Missing** | **Confirmed unused** — declared in `.env.example` and `stripe` is an installed dependency, but no route handler actually references these vars. Skip unless you're adding Stripe support yourself |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | ❌ **Missing** | Google Calendar sync (`/api/appointments/[id]/google`, `/api/auth/google*`) — web-only flow (OAuth redirect targets the frontend), low priority for mobile |
| `EMAIL_USER` / `EMAIL_PASS` | ❌ **Missing** | Invoice email sending (`sendInvoiceEmail`, called from the payments webhook, via nodemailer/Gmail SMTP) |
| `EMAIL_FROM` | ❌ **Missing** | Declared in `.env.example` but **confirmed not actually used** in `sendInvoice.ts` — the from-address is hardcoded to `EMAIL_USER` there. Safe to skip |
| `INVITE_SECRET` | ❌ **Missing** | Dual purpose: guards `/api/notifications/push` (**that route rejects every call until this is set**) and signs invite-token links in `/api/auth/set-password` |
| `FRONTEND_URL` / `NEXT_PUBLIC_FRONTEND_URL` | ❌ **Missing** | CORS allow-list in `backend/src/middleware.ts` (see below) — without these, only `http://localhost:3000` is allowed to call the backend cross-origin |
| `ENABLE_API_DOCS` | ✅ (present, undocumented in `.env.example`) | Unclear purpose — not referenced in any route handler; verify before relying on it |

### Backend middleware — CORS only, not auth

`backend/src/middleware.ts` gates every `/api/:path*` request, but **only for CORS** — it answers `OPTIONS` preflight and reflects `Access-Control-Allow-Origin` for an allow-list built from `http://localhost:3000` plus `NEXT_PUBLIC_FRONTEND_URL`/`FRONTEND_URL`. **It performs no authentication check of its own** — each route individually calls `getUserOrThrow`/`getAal2UserOrThrow` (and, per §5's security findings, a few call neither). This matters for mobile specifically: native app requests aren't subject to browser CORS at all, so this middleware is effectively a web-only concern — but you should still set `FRONTEND_URL`/`NEXT_PUBLIC_FRONTEND_URL` correctly once `frontend/` is eventually deployed, so it isn't accidentally locked out.

For `mobile/` (only 3 vars are actually read by the app, per `mobile/src/config/env.ts`):

| Variable | Currently set in `mobile/.env`? | Note |
|---|:---:|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Correct, matches the live project |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Correct |
| `EXPO_PUBLIC_BACKEND_URL` | ❌ **Missing** | The app throws `Missing required env var: EXPO_PUBLIC_BACKEND_URL` at boot without it. `mobile/.env` instead defines an unused `EXPO_PUBLIC_API_URL=http://192.168.31.198:3001` (a LAN IP, not a public URL) — this variable name is never read anywhere in `mobile/src`. **Once `backend/` is deployed, set `EXPO_PUBLIC_BACKEND_URL` to its public HTTPS URL and rebuild** (Expo env vars are baked in at build time, not runtime-configurable post-build) |

`mobile/.env` also sets `EXPO_PUBLIC_APP_ENV` and `EXPO_PUBLIC_DATA_MODE=staging` — neither is read anywhere in `mobile/src` today (confirmed via grep); they describe a planned mock/staging/production data-source toggle that has no implementation yet.

## 9. Build Commands

```bash
# From repo root (installs all 4 workspaces via the shared lockfile):
npm install

# Backend build (this is what you'd deploy):
npm run build:backend
# = npm run build --workspace=@medilink/backend
# = (inside backend/) next build
```
`shared/` needs no separate build step (see §2) — Next.js transpiles it directly as part of `build:backend`.

## 10. Run Commands

```bash
# Local dev, for reference (not production):
npm run dev:backend          # next dev -p 3001

# Production run, once built:
cd backend && npm run start  # next start -p 3001
```
There is no repo-provided process manager config (no PM2 `ecosystem.config.js`, no systemd unit, no Dockerfile `CMD`) — whatever host you choose will need `npm run start` (or `next start -p <port>`) wired into its own process-supervision mechanism (platform-managed on Vercel/Render/Railway, or something you configure yourself on a VM).

## 11. Deployment Order

1. **Reconcile the TestFlight source discrepancy** (§0) — confirm where the binary's actual source lives before investing further, since deploying `backend/` alone won't change what that build shows.
2. **Fill in missing backend env vars** (§8) — at minimum `INVITE_SECRET` (push is fully broken without it) and a decision on `MOCK_AI`/`GROQ_API_KEY` (AI stays fake without it). Google OAuth and email vars only if those specific features are needed at launch.
3. **Choose a host for `backend/`** — the repo doesn't prescribe one; any Node ≥20-capable platform works (`next build && next start`).
4. **Deploy `backend/`** to that host, with `NEXT_PUBLIC_APP_URL` set to its own public URL (used in Thawani's `success_url`/`cancel_url`).
5. **Point Thawani's webhook configuration** at `https://<deployed-backend>/api/payments/webhook` (currently nothing external can reach a local backend — this is a live blocker for real payments).
6. **Set `EXPO_PUBLIC_BACKEND_URL`** to the deployed backend's public URL in mobile's build-time env, then rebuild the mobile app (Expo bakes `EXPO_PUBLIC_*` in at build time).
7. **Configure EAS** (`eas.json` + a real `extra.eas.projectId` in `app.json`) if you intend to produce the next TestFlight build via EAS Build — currently absent, so `eas build`/`eas submit` cannot run reproducibly yet.
8. Supabase needs no action — already live (§6).

## 12. Blockers Before Deployment

| # | Blocker | Where |
|---|---|---|
| 1 | **No product screens exist in `mobile/` to call any backend or Supabase feature** — the core premise of "stop using mock data" doesn't have code to act on in this repo state | `mobile/src/screens` (`.gitkeep` only), `docs/FOUNDATION_REPORT.md §9` |
| 2 | `EXPO_PUBLIC_BACKEND_URL` is not set in `mobile/.env` (an unrelated, unused `EXPO_PUBLIC_API_URL` is set instead) — app throws on boot once it does reach code that imports `mobile/src/config/env.ts` | `mobile/.env`, `mobile/src/config/env.ts:21-24` |
| 3 | `INVITE_SECRET` is unset — `/api/notifications/push` unconditionally rejects every request until it exists | `backend/.env.local`, `backend/src/app/api/notifications/push/route.ts:26-27` |
| 4 | No hosting target chosen, no Dockerfile/CI/IaC exists — you're deciding infrastructure from a blank slate | Confirmed across the whole repo, §7 |
| 5 | `eas.json` doesn't exist and `app.json`'s `extra.eas.projectId` is empty — EAS builds/push tokens won't work until configured | `mobile/app.json:27` |
| 6 | `MOCK_AI=true` locally — even after deploying, AI endpoints return stubbed data unless this and the real API keys are set | `backend/.env.local` |
| 7 | Thawani webhook cannot reach a non-public backend — real payment confirmation requires the backend's URL to be genuinely public before testing real payments | Architectural, confirmed via `payments/verify/route.ts`'s own doc comment describing exactly this gap |
| 8 | `backend/.env.local` is missing Google/email vars documented as required for those specific (lower-priority, web-oriented) features — Stripe/Gemini vars can be ignored entirely, confirmed unused in code | `backend/.env.local` vs actual `backend/src` references |
| 9 | **`/api/payments/webhook` has no signature/secret verification** — before this backend is publicly reachable, anyone could POST a fake "paid" event for a guessed appointment id | `backend/src/app/api/payments/webhook/route.ts` |
| 10 | **`/api/ai/symptom-check` is fully unauthenticated** and **`/api/payments/[id]/invoice` has no ownership check (IDOR)** — both are reachable by anyone once the backend is public | Same route files, §5 |
| 11 | **`/api/auth/send-otp` returns the OTP in plaintext in its response** — an explicit dev-only leftover that must not reach production | `backend/src/app/api/auth/send-otp/route.ts` |

---

**Nothing in this repository was modified, deployed, or provisioned as part of this audit.** All Supabase-state claims (§6) were verified via live `supabase` CLI commands (`migration list`, `functions list`) and direct authenticated REST calls against the actual linked project, using credentials already present in this checkout — no new access was created.
