# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MediLink is a patient-facing healthcare app: **web (Next.js)** + **mobile (Expo)**, built on top of a
**reused, already-live Supabase project from a system called HAMS** (a multi-role healthcare platform —
patient/doctor/facility-admin/technician/super-admin). The guiding principle is "re-home, don't rewrite":
RLS-safe patient CRUD was moved into `shared/src/api/*`; privileged/secret logic was re-homed into
`backend/`. HAMS's own staff/admin web frontend was **not** reused — `frontend/` here is a brand-new
patient-only portal. The Supabase project itself (same URL/keys, same schema) is reused as-is —
**never fork the schema; only additive migrations** (see `supabase/README.md`).

Almost all active development right now is in `mobile/` (check `git log` — it's overwhelmingly
`feat(mobile)`/`fix(mobile)` commits building out screens sprint-by-sprint against the data layer).

## Monorepo layout

npm workspaces, root `package.json` at `Medilink/`:
- `shared/` — `@medilink/shared`, isomorphic API client + types, consumed by backend/frontend/mobile
- `backend/` — `@medilink/backend`, Next.js 15 app, **pure API server** (port 3001)
- `frontend/` — `@medilink/frontend`, Next.js 15 patient web app (port 3000), mostly scaffolding today
- `mobile/` — `@medilink/mobile`, Expo SDK 54 / React Native 0.81 / React 19 / Expo Router 6
- `supabase/` — reused HAMS `config.toml`, `migrations/`, `functions/` (single source of truth for schema)
- `docs/` — root-level architecture/audit docs (see "Where to look" below)

## Commands

Run from the repo root unless noted.

```bash
npm install                       # installs all workspaces
cd mobile && npx expo install     # after install, sync native deps to the Expo SDK version

npm run dev:backend               # backend API on :3001
npm run dev:frontend              # patient web on :3000
npm run dev:mobile                # Expo Metro + QR (or: cd mobile && npm start)

npm run build:backend
npm run build:frontend
npm run build:shared

npm run typecheck                 # tsc --noEmit across all workspaces — must exit 0
npm run lint                      # eslint across all workspaces (mobile: expo lint)

npm run db:push                   # supabase db push — apply pending migrations
npm run db:types                  # regen shared/src/types/supabase.ts from the linked project
supabase migration new <name>     # new additive migration file
```

Per-workspace, equivalent to `npm run <script> --workspace=@medilink/<name>`:
```bash
cd mobile && npm run typecheck    # tsc --noEmit -p tsconfig.typecheck.json (NOT tsconfig.json)
cd mobile && npm run lint         # expo lint
cd backend && npm run typecheck
cd frontend && npm run typecheck
```

**No automated test suite exists yet** (no jest config, no `*.test.*` files, in any workspace).
`docs/TESTING_GUIDE.md` documents manual smoke tests (curl/Postman against `:3001/api/*`, and
`shared/src/api/*` calls from a scratch script) — use it to verify backend changes by hand.
AI routes have **no mock/stub mode** — they always call the real provider (Groq), so a valid
`GROQ_API_KEY` is required to smoke-test them (a missing key yields a graceful 5xx, never fake data).

Full env var reference with PUBLIC/SECRET tags: `.env.example` at the repo root. Full bring-up
sequence and a troubleshooting table (peer conflicts, Metro alias caching, RLS denials, etc.):
`docs/RUNBOOK.md`.

## Architecture

### Two execution tiers (applies everywhere)

- **Shared/RLS tier** — `shared/src/api/*`, called directly from web/mobile against Supabase with
  the user's own session. No secrets. 13 modules, ~49 functions (auth, profile, family, doctors,
  favourites, facilities, appointments, records, labs, prescriptions, notifications, reviews +
  `client.ts`). Each function takes a generic typed `DB` (`SupabaseClient<Database>`) so web and
  mobile just pass different client instances against identical RLS policies — same logic, same
  security boundary, everywhere.
- **Backend tier** — `backend/src/app/api/**/route.ts`, Next.js server routes with secrets /
  service-role Supabase / native libs (`pdfkit`, `sharp`) / third-party APIs (Stripe, Thawani,
  Gemini, Groq, Google Calendar). Only exists for what a client can't safely do under RLS:
  signup/OTP/2FA, payments, PDF generation, AI, push dispatch. See `docs/BACKEND_MODULES.md` for
  the full module → tier → env-var matrix.

Before adding a feature, decide which tier it belongs in: if it's plain CRUD a signed-in patient
can do under their own RLS policies, it's shared/`api/*`; if it needs a secret, service-role
write, or a heavy/native dependency, it's a backend route.

### `shared/` package — two entry points

- `@medilink/shared` (`shared/src/index.ts`) — full surface for web/backend, includes web-only
  utils (`cn`, tailwind-merge).
- `@medilink/shared/mobile` (`shared/src/mobile.ts`) — RN-safe subset, explicitly excludes the
  web-only utils.

Both re-export `types`, `auth`, `config`, the `api` namespace, and flat domain types (`DB`,
`Enums`, `Row`, `MyProfile`, `FamilyMember`, `MedicalHistory`, `PatientDocument`,
`AppointmentTab`). `shared/src/types/supabase.ts` is CLI-generated (`npm run db:types`) — don't
hand-edit it. `shared/src/types/index.ts` currently augments the generated `Database` type with
two tables not yet in codegen (`device_tokens`, `notification_preferences`); that augmentation is
meant to be deleted once they exist remotely and types are regenerated.

### Mobile — repository/data-layer pattern (the most important thing to understand before touching `mobile/`)

Screens **never** call Supabase or backend REST directly and never see HAMS/Supabase row shapes.
They import `repositories` and domain types from `mobile/src/data/index.ts` only. Four pieces:

- `src/data/types.ts` — pure domain models (`Appointment`, `Doctor`, `Payment`, ...).
- `src/data/repositories.ts` — interfaces (`AuthRepository`, `PatientRepository`,
  `AppointmentRepository`, `PaymentRepository`, `DoctorRepository`, `DiscoveryRepository`,
  `NotificationRepository`, etc.), bundled as `Repositories`.
- `src/data/mock/` — full in-memory implementation (seed patient "Aisha Al Harthy" + family),
  with an artificial ~450ms delay so loading states are visible. In mock mode auth starts as
  guest and mock sign-in flips to authed, so every screen is reachable with no backend running.
- `src/data/real/` — wraps the **unchanged** `@medilink/shared` `api.*` (Supabase/RLS) plus
  `apiFetch`/`authService` (backend REST with bearer token) for the parts that need the backend
  tier (signup, OTP, photo upload).

`src/data/index.ts` picks the implementation from `EXPO_PUBLIC_DATA_MODE` (`mock` default |
`staging` | `production`), but **staging/production is not simply "use real everywhere"** — it's
a per-field hybrid: `{...mockRepositories, auth: real.auth, patient: real.patient, ...}`, because
migration off mock happens module-by-module, or even field-by-field within a module (e.g.
`doctor.search`/`doctor.get` are real but `doctor.reviews`/`mapClinics` stay mock; `discovery`
mixes real `featuredClinics`/`recentDoctors` with mock `listSpecialties`). **Read the top comment
in `mobile/src/data/index.ts` before assuming something is wired to the real backend** — it's
kept up to date with exactly what's real vs. mock right now.

**Convention for a new domain:** add types to `types.ts` → an interface to `repositories.ts` (and
to `Repositories`) → a mock implementation → a real implementation → wire it into
`hybridRepositories` in `index.ts`, field-by-field if only part of it is backend-ready yet.

Mobile-specific non-obvious rules:
- Forgot-password completion is BLOCKED (no deep-link recovery session wired) — don't silently
  "fix" this by faking success; the email send is real, completion isn't.
- Google sign-in is permanently disabled client-side (no backend endpoint/client IDs configured).
- Family members and medical history are keyed on `patient_profiles.id` — a new signup needs the
  corresponding DB trigger to have created that row, or those screens legitimately show empty.
- Full detail: `mobile/docs/DATA_LAYER.md`, `mobile/docs/HAMS_MOBILE_INTEGRATION.md`,
  `docs/MOBILE_HAMS_API_AUDIT.md`.

### Mobile — routing (`mobile/app/`, Expo Router)

- Root `app/_layout.tsx`: global `headerShown:false` (every screen renders its own header — needed
  for RTL), provider order SafeArea → Query → Theme → I18n → Auth.
- `app/(app)/_layout.tsx` is the **single auth gate** for everything under it (reads
  `authStore.status`, redirects guests to `/auth/sign-in`) — no nested route or deep link can
  bypass it.
- `app/(app)/(tabs)/_layout.tsx` holds only the 5 tab roots (`dashboard`, `search`, `me`,
  `records`, `profile`) behind a custom `BottomTabBar`. The tab bar must never appear on
  splash/onboarding/auth/OTP/reset routes — this is enforced structurally (those routes live
  outside `(app)`), not via a style flag.
- Everything else under `(app)/` that should push full-screen **without** the tab bar (edit-profile,
  medical-history, family/add, family/[id], patient-switcher, and nested stacks like
  appointments/booking/doctors/payments/records/settings) is declared as a sibling `Stack.Screen`
  directly in `(app)/_layout.tsx`, outside `(tabs)`.
- `search/filters` uses `presentation:"formSheet"` with detents — that's the convention for
  bottom-sheet/filter-style UI, not a one-off.

### Mobile — theming & i18n

- `src/theme/tokens.ts` — raw brand palette/spacing/radii; never imported directly by screens.
- `src/theme/light.ts` / `dark.ts` — semantic `ThemeColors` composed from tokens; dark mode is a
  *derived* palette, not ad-hoc colors (`#0F0A18` base, `#221634` cards per
  `mobile/docs/DARK_MODE_COLOR_AUDIT.md`).
- `src/theme/typography.ts` — `fontFamilyFor(role, weight, isRTL)` maps to specific bundled static
  font files (Agatho for EN headings, Manrope for EN body, single-weight 29LT Zarid Sans for all
  Arabic — it doesn't synthesize weight, so Arabic bold currently renders as regular).
- `ThemeProvider.tsx` merges the persisted Zustand `themeStore` mode (light/dark/system) with
  `useColorScheme()`.
- Per `mobile/docs/DESIGN_FIDELITY_AUDIT.md`: button radius is `radii.md` (14px) — full pill shape
  is reserved for chips only.
- i18n (`src/i18n/`): `setLocale()` flips `I18nManager.forceRTL()` but React Native only fully
  applies the native direction change after an app reload, so it returns a "restart needed" flag.
  `app/language.tsx` is the only caller and shows a restart-now-or-later prompt; the choice is
  persisted to SecureStore. Adding new strings/screens needs no restart; toggling en↔ar mid-session
  leaves layout direction stale until relaunch. `ar.ts` keys are typed against `en.ts` via a
  `Leaves<Messages>` mapped type — a missing Arabic key falls back to the raw key string, not a
  crash.

### Mobile — module resolution gotcha

Metro does **not** read `tsconfig.json` `paths`. Aliases (`@/*` → `src/*`,
`@medilink/shared`, `@medilink/shared/mobile`) are declared in **both**
`mobile/tsconfig.json` and `mobile/babel.config.js` (`module-resolver` plugin) and must be kept
in sync by hand. `react-native-worklets/plugin` must stay the **last** Babel plugin (Reanimated
4/SDK 54 requirement; Expo Router depends on it). If aliases silently break at runtime after an
edit, it's almost always this file drifting from `tsconfig.json` — clear the Metro cache with
`npx expo start -c`.

`mobile/tsconfig.typecheck.json` (used by `npm run typecheck`, not `tsconfig.json` directly) pins
`react`/`react/jsx-runtime` types to mobile's own `@types/react@19`, because the monorepo root
hoists `react-native`'s bundled types which would otherwise resolve against the root's
`@types/react@18` (used by backend/frontend) and create a duplicate React type identity. This
mapping is deliberately kept out of the Metro-visible `tsconfig.json` since `@types/react` has no
runtime entry to alias.

### Frontend (patient web)

Currently mostly scaffolding (`layout.tsx`, `page.tsx`, `providers.tsx`, no feature routes yet).
Dual-path like mobile: RLS-safe CRUD imports `@medilink/shared` and hits Supabase directly with an
SSR/cookie client (`frontend/src/lib/supabase/{client,middleware}.ts`); privileged operations
(payments, OTP/2FA, PDFs, AI, push) call `backend/` over HTTP via `NEXT_PUBLIC_BACKEND_URL`.
`frontend/middleware.ts` runs Supabase's SSR cookie-refresh (`updateSession`) on every route except
static assets.

### Auth

Supabase Auth throughout — no custom JWT. Web uses SSR + cookies (`@supabase/ssr`); mobile uses a
bearer token persisted in `expo-secure-store`. Both call into `shared/src/api/auth.ts`
(`signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange`, ...) for RLS-safe operations.
The backend owns auth side-effects that need secrets/service-role: signup, OTP send/verify/resend,
2FA setup/verify/challenge/disable/recovery, Google OAuth callback, session logging
(`backend/src/app/api/auth/*`, `backend/src/lib/auth/*`).

## Where to look for more detail

- `docs/RUNBOOK.md` — install, env setup, running every app, migrations, troubleshooting table.
- `docs/TESTING_GUIDE.md` — manual smoke tests per backend module (curl/Postman + shared API).
- `docs/BACKEND_MODULES.md` — every module, its tier (shared vs backend), deps, and env vars.
- `docs/DEVELOPMENT_ROADMAP.md` — what's built vs. TODO, known tech debt.
- `mobile/docs/DATA_LAYER.md`, `mobile/docs/HAMS_MOBILE_INTEGRATION.md` — mobile data layer detail.
- `mobile/docs/DESIGN_FIDELITY_AUDIT.md`, `DARK_MODE_COLOR_AUDIT.md`, `FONT_AUDIT.md` — visual
  spec compliance rules referenced above.
- `supabase/README.md` — schema reuse/additive-migration policy.

Note: `mobile/README.md` describes an earlier "Week 1+2 only" state of the app; the actual
`mobile/app/` route tree (appointments, booking, doctors, payments, records, AI, notifications,
settings) is far more built out — trust the code and `git log`, not that README, for current scope.
