# MediLink Patient Mobile — Architecture Guide

_Onboarding documentation for a senior engineer joining the project. Everything here is derived from the actual code; file paths are given so you can jump straight to the implementation. Where a decision is inconsistent or surprising, it is flagged as **⚠️ Note**._

---

## 0. TL;DR — the mental model

- **Expo (SDK 54) + expo-router** app. Entry is `expo-router/entry` (see `mobile/package.json` `main`); there is no hand-written `index.js`.
- **Two backends, deliberately split:**
  - **Supabase** (Postgres + RLS + Storage) — reached **directly** from the device for all RLS-safe CRUD, via the shared `@medilink/shared` `api.*` modules.
  - **A Next.js 15 API server** at `d:/Medilink/Medilink/backend` (app-router route handlers under `backend/src/app/api/**/route.ts`, dev port **3001**) — reached via `apiFetch` **only** for privileged/heavy work: auth signup + OTP, payments (Thawani), prescription PDF/share links, AI. **There is no Express server and no `server.ts`.**
- **The UI never touches Supabase or the network directly.** Every screen goes: **hook → repository → data layer (mock | real) → (Supabase `api.*` | `apiFetch`)**. The seam is `mobile/src/data/index.ts`.
- **A single env var, `EXPO_PUBLIC_DATA_MODE`, chooses the data source** (`mock` | `staging` | `production`). `mock` = in-memory; `staging`/`production` = the **hybrid** (real where a backend exists, mock for the few gaps).
- **State:** TanStack Query for server data; a handful of small Zustand stores for session mirror + device prefs + cross-screen booking context; React local state for form/UI.

---

## 1. Startup sequence

```
Native launch
  │
  ▼
expo-router/entry                      (package.json "main")
  │
  ▼
app/_layout.tsx  ── RootLayout
  │   useFonts(BRAND_FONT_FILES)  → hold on a violet <View> until fonts load
  │   Provider tree (order matters):
  │     GestureHandlerRootView
  │       └ SafeAreaProvider
  │           └ QueryProvider            (TanStack Query client)
  │               └ ThemeProvider        (light/dark + textScale)
  │                   └ I18nProvider     (en/ar + RTL)
  │                       └ AuthProvider (restores Supabase session → authStore)
  │                           └ <Stack>  (expo-router navigator)
  ▼
app/index.tsx  ──  <Redirect href="/splash" />
  │
  ▼
app/splash.tsx  ── waits until ALL of:
  │     onboardingStore.hasHydrated && themeStore.hasHydrated &&
  │     localeStore.hasHydrated && authStore.status !== "loading"
  │   then routes (after a 1.2s min-visible animation):
  │     authStore.status === "authed"        → /dashboard
  │     onboardingStore.completed            → /auth/sign-in
  │     else                                 → /welcome
  ▼
(app)/(tabs)/dashboard.tsx   OR   auth/sign-in.tsx   OR   welcome.tsx
```

**Key files:** `app/_layout.tsx` (provider tree + Stack), `app/index.tsx` (redirect), `app/splash.tsx` (gate + route decision), `src/providers/AuthProvider.tsx` (session bootstrap).

**How the session is bootstrapped** (`src/providers/AuthProvider.tsx`): on mount it calls `repositories.auth.restoreSession()` → `setSession(user)` in `authStore`, and subscribes to `repositories.auth.subscribe(...)` (Supabase `onAuthStateChange`). Until that resolves, `authStore.status === "loading"`, which is exactly what the splash waits on — so **no patient screen renders before the session is confirmed**.

**Fonts** are loaded in the root layout with `expo-font`'s `useFonts(BRAND_FONT_FILES)` (`src/theme/typography.ts`); rendering is blocked on a brand-violet placeholder view until they're ready (no system-font flash).

⚠️ **Note:** the root layout imports `ThemeProvider` from `@/theme/ThemeProvider`, but individual screens consume theme via the `@/hooks/useTheme` hook. Two entry points for the same context — expected, but worth knowing when tracing theme.

---

## 2. Project structure

```
mobile/
├── app/                     # expo-router routes (file = route). UI only.
│   ├── _layout.tsx          # root layout: providers + Stack
│   ├── index.tsx            # → redirect to /splash
│   ├── splash / welcome / onboarding / language   # public pre-auth screens
│   ├── auth/                # sign-in, sign-up, otp, forgot/reset-password (+ _layout)
│   ├── (app)/               # AUTH-GATED group (see (app)/_layout.tsx)
│   │   ├── (tabs)/          # bottom-tab screens: dashboard, search, me, records, profile
│   │   ├── doctors/ booking/ appointments/ payments/ records/ family/ ai/ rate/ notifications/ settings/
│   │   └── edit-profile, medical-history, patient-switcher, …
│   └── dev/                 # dev-only gallery/preview (gated by isDev)
└── src/
    ├── components/ui/       # presentational, reusable UI (Screen, Card, Button, tab bars, …)
    ├── config/              # env.ts — the ONLY place process.env is read
    ├── data/                # THE DATA SEAM
    │   ├── index.ts         # picks mock vs hybrid; exports `repositories`
    │   ├── repositories.ts  # repository INTERFACES + Repositories type (the contract)
    │   ├── types.ts         # domain types the UI speaks (Doctor, Appointment, LabResult…)
    │   ├── mock/index.ts    # in-memory implementation
    │   └── real/index.ts    # real implementation (Supabase api.* + apiFetch)
    ├── hooks/
    │   ├── queries/         # TanStack Query hooks (one file per domain, see ⚠️ below)
    │   ├── useTheme.ts useLocale.ts useResponsive.ts
    ├── i18n/                # index.tsx (I18nProvider + useI18n), en.ts, ar.ts
    ├── lib/                 # supabase.ts (client), secureStore.ts (chunked keychain adapter)
    ├── providers/           # QueryProvider.tsx, AuthProvider.tsx
    ├── services/            # api.ts (apiFetch), authService.ts, push.ts
    ├── stores/              # Zustand: auth, patient, booking, searchFilter, onboarding, theme, locale (+ persist.ts)
    ├── theme/               # ThemeProvider, colors, typography
    └── utils/               # pure helpers (appointments date formatting, text, platform)
```

**Folder rules of thumb:**
| Folder | Put here | Never put here |
|---|---|---|
| `app/**` | Route components (screens), layouts | Business logic, direct Supabase/fetch calls, mock data |
| `src/components/ui` | Reusable presentational components | Data fetching, navigation decisions |
| `src/data` | Repository contracts + mock/real implementations | React/JSX, hooks |
| `src/hooks/queries` | TanStack Query wrappers around `repositories.*` | Direct Supabase/apiFetch, raw `process.env` |
| `src/services` | Transport (`apiFetch`, auth transport, push) | UI, React Query |
| `src/lib` | Low-level singletons (Supabase client, storage adapter) | Domain logic |
| `src/stores` | Small global client state (session mirror, prefs, cross-screen context) | Server data (that's React Query's job) |
| `src/config/env.ts` | All `process.env` reads | — this is the only file allowed to read env |

⚠️ **Note (hook file inconsistency):** most domains have their own hook file (`useDoctors`, `useFamily`, `useLabs`, `usePrescriptions`, `useRecords`, `useNotifications`, `useDiscovery`, `useAi`), but **appointments and payments hooks live inside `src/hooks/queries/usePatient.ts`** (183 lines) rather than `useAppointments.ts`/`usePayments.ts`. New devs will look for those files and not find them.

---

## 3. Routing (expo-router, file-based)

- **Root Stack** — `app/_layout.tsx`. Headers off globally (`headerShown: false`); each screen renders its own header for RTL control. Public routes (`index`, `splash`, `welcome`, `onboarding`, `language`, `auth`) and the `(app)` group are siblings.
- **Auth gate** — `app/(app)/_layout.tsx`. Because this layout wraps the **entire** `(app)` group, deep links to `/dashboard`, `/profile`, etc. cannot bypass it:
  - `authStore.status === "loading"` → neutral `ActivityIndicator`
  - `status === "guest"` → `<Redirect href="/auth/sign-in" />`
  - `status === "authed"` → renders the inner Stack.
- **Tabs** — `app/(app)/(tabs)/_layout.tsx`: `<Tabs>` with a custom `BottomTabBar`; screens `dashboard, search, me, records, profile`. `backBehavior="history"`.
- **Detail screens live OUTSIDE `(tabs)`** (e.g. `edit-profile`, `family/[id]`, `patient-switcher`) so they push full-screen with no tab bar.
- **Dynamic routes** — `doctors/[id]/index.tsx`, `appointments/[id]/index.tsx`, `booking/[doctorId]/schedule.tsx`, `payments/invoice/[id].tsx`, `rate/[appointmentId].tsx`. Read params with `useLocalSearchParams<{ id?: string }>()`.
- **Presentation modes** — `search/filters` is registered in `(app)/_layout.tsx` as a `formSheet` with detents `[0.65, 0.95]` + grabber (true bottom sheet, falls back to slide-up modal where unsupported).
- **Navigation calls** — screens use `router.push(...)` / `router.replace(...)` from `expo-router` (imperative), not `<Link>`.

---

## 4. State management

| System | Where | Stores what | Use it when |
|---|---|---|---|
| **TanStack Query** | `src/providers/QueryProvider.tsx` + `src/hooks/queries/*` | All **server data** (profile, appointments, payments, docs, labs, rx, notifications, doctors, specialties, AI). | Anything that comes from Supabase/backend. Never mirror it into Zustand. |
| **Zustand** | `src/stores/*` | Small **client** state (see below). | Session status for routing, device prefs, and cross-screen wizard state. |
| **React local state** | `useState`/`useForm` in screens | Ephemeral form + UI state (inputs, toggles, selected slot before submit). | Anything that dies with the screen. |
| **Context providers** | Theme, I18n | Cross-cutting concerns (colors, locale/RTL). | Read via `useTheme()` / `useI18n()`. |

**Zustand stores (`src/stores/`):**
- `authStore.ts` — **session mirror for routing.** `status: "loading" | "authed" | "guest"`, `user`. Driven by `AuthProvider`; read by splash + `(app)/_layout`. Decoupled from Supabase types (uses domain `SessionUser`).
- `patientStore.ts` — **active patient** for the multi-patient (self + family) switcher: `activePatientId`, `activePatientName`. Persisted (`medilink.activePatient`).
- `bookingStore.ts` — **cross-screen booking wizard context** (doctor, clinic, fee/VAT/total, selected slot, confirmed booking). Populated by schedule/review, read by payment/success. Not persisted.
- `searchFilterStore.ts` — doctor-search filter state + `activeFilterCount(f)` helper. Read by `search` + `filters`.
- `onboardingStore.ts` (`completed`), `themeStore.ts` (`mode`, `textScale`), `localeStore.ts` (`locale`) — persisted foundation prefs; each exposes `hasHydrated` so the splash can wait for rehydration.

**Persistence:** `src/stores/persist.ts` provides `secureStorage` (an OS-keychain `StateStorage` for the tiny prefs). The **Supabase session** uses a separate **chunked** keychain adapter, `src/lib/secureStore.ts` (`SecureStoreAdapter`), because a session JWT bundle exceeds SecureStore's ~2KB/value limit.

⚠️ **Note (query-key inconsistency):** `usePatient.ts` mixes a structured `patientKeys` object (`profile`, `medicalHistory`, `appointmentsUpcoming`) with **inline array literals** for the rest (`["appointments","list",tab]`, `["payments","list"]`, `["appointments","slots",…]`). Other domains define their own `*Keys` object (`labKeys`, `notificationKeys`, …). Invalidation still works because prefixes match, but the convention is uneven.

---

## 5. Request flow (screen → backend → UI)

```
User action / screen mount
  │
  ▼
Query hook            src/hooks/queries/*      (useAppointments, usePayments, …)
  │  queryFn / mutationFn call:
  ▼
repositories.<domain>.<method>()   src/data/index.ts  (the seam)
  │  hybrid picks real (or mock) per domain
  ▼
Real repository       src/data/real/index.ts
  │
  ├── RLS-safe CRUD ──► shared api.*  (@medilink/shared/mobile) ──► Supabase client (src/lib/supabase.ts) ──► Postgres + RLS
  │
  └── privileged/heavy ──► apiFetch()  (src/services/api.ts) ──► Next.js /api/* (backend, :3001) ──► Supabase (service role)
  │
  ▼
Response mapped to a DOMAIN type (src/data/types.ts)
  │
  ▼
TanStack Query cache (keyed)  ──►  hook returns { data, isLoading, isError, refetch }
  │
  ▼
Screen re-renders (loading / empty / error / success)
```

Concrete example — **cancel an appointment**:
`appointments/[id]/index.tsx` → `useCancelAppointment().mutate({id, reason})` (`usePatient.ts`) → `repositories.appointment.cancel(id, reason)` (`data/real/index.ts`) → `api.appointments.cancelAppointment(supabase, id, {reason})` (`shared/src/api/appointments.ts`) → `db.rpc("cancel_my_appointment", {p_id, p_reason})` → on success the hook `invalidateQueries(["appointments"])` + `appointmentsUpcoming` → list + dashboard refetch → UI updates.

---

## 6. API architecture

**Two transports, one identity.**

1. **Supabase client** — `src/lib/supabase.ts`. `createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { storage: SecureStoreAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. Auto-refresh is tied to `AppState` (only refreshes in the foreground — the official RN pattern). Exposes `getAccessToken()`. The device holds the anon key + a user JWT; **RLS is the security boundary**.

2. **`apiFetch<T>(path, init)`** — `src/services/api.ts`. A thin typed fetch wrapper for the Next.js backend:
   - **Bearer injection:** reads `getAccessToken()` and sets `Authorization: Bearer <supabase access token>` — so the backend runs under the **same identity** as direct queries.
   - **Headers:** `Accept: application/json`; sets JSON `Content-Type` unless the body is `FormData` (lets fetch set the multipart boundary).
   - **Base URL resolution:** trims `EXPO_PUBLIC_API_URL`; on Android rewrites `localhost`/`127.0.0.1` → `10.0.2.2` (emulator → host). LAN IPs pass through.
   - **Timeout:** 20s via `AbortController`.
   - **Errors:** throws `ApiError(status, message, body)`. Transport failures (no HTTP status — the opaque RN "Network request failed") are re-thrown with the attempted URL + a concrete connectivity hint.
   - **No built-in retry** at this layer — retry policy lives in React Query (`retry: 1` for queries, `0` for mutations).

**Repository pattern** — `src/data/repositories.ts` defines an interface per domain (`AuthRepository`, `AppointmentRepository`, `PaymentRepository`, `LabRepository`, …) and the `Repositories` aggregate. `mock/index.ts` and `real/index.ts` each implement all of them; `index.ts` composes the active set. **The UI depends only on these interfaces**, never on Supabase or fetch — which is what makes mock mode fully offline and the real wiring swappable per domain.

**Backend endpoints actually called via `apiFetch`** (grep-verified in `data/real` + `services`):
`/api/auth/signup`, `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/payments/checkout`, `/api/payments/verify`, `/api/prescriptions/{id}/download`, `/api/prescriptions/{id}/share-link`, `/api/ai/suggest-doctor`.

**Supabase RPCs called via shared `api.*`:** `book_appointment_atomic`, `cancel_my_appointment`, `reschedule_my_appointment`, `checkin_my_appointment`, `rebook_appointment`, `claim_waitlist_appointment`, `get_nearby_facilities`, `get_nearby_branches`. Everything else is direct table reads/writes under RLS.

---

## 7. Where the backend lives (architecture)

```
                         ┌──────────────────────────────────────────┐
                         │            MediLink Patient App            │
                         │              (Expo / RN, this repo)         │
                         │                                            │
   screens → hooks → repositories → data/real/index.ts                │
                         │            │                    │          │
                         │            │ (RLS-safe CRUD)    │ (privileged)
                         │            ▼                    ▼          │
                         │   Supabase JS client       apiFetch()      │
                         └────────────┼───────────────────┼──────────┘
                                      │ anon key +         │ Bearer = same
                                      │ user JWT           │ Supabase JWT
                                      ▼                    ▼
                        ┌───────────────────────┐  ┌────────────────────────────┐
                        │   Supabase (hosted)   │  │  Next.js 15 API server       │
                        │  Postgres + RLS +     │  │  d:/Medilink/Medilink/backend │
                        │  Storage + RPCs       │  │  app-router route handlers    │
                        │                       │  │  (backend/src/app/api/**)     │
                        │                       │◄─┤  runs under SERVICE ROLE for  │
                        │                       │  │  privileged ops (Thawani,     │
                        └───────────────────────┘  │  OTP/SMS, PDF, AI)            │
                                                    └────────────────────────────┘
```

Answers to the explicit questions:
- **`server.ts`? Express?** No. **No `server.ts`, no Express.**
- **Next.js API routes?** Yes — `@medilink/backend` is **Next.js 15** (`backend/package.json`), served on `-p 3001 -H 0.0.0.0`, with app-router handlers at `backend/src/app/api/**/route.ts`.
- **Supabase used directly?** Yes — for all RLS-safe reads/writes, straight from the device.
- **Which requests go where?** Direct-Supabase: profile, family, medical history, appointments (via RPCs), documents, prescriptions (read), labs, notifications, facility messages, specialties, doctors, reviews, discovery, AI visit summary. Via Next.js backend: signup + OTP, payment checkout/verify (Thawani), prescription PDF/share-link, AI suggest-doctor.
- **Auth end-to-end:** see §8.

---

## 8. Authentication

```
Sign in (email/pw)                Sign up
  │                                 │
  ▼                                 ▼
authService.signIn()             authService.signUp()
  │ api.auth.signInWithPassword    │ 1) POST /api/auth/signup (backend, service-role, email auto-confirmed)
  ▼ (Supabase)                     │ 2) api.auth.signInWithPassword (Supabase) → session
Supabase issues JWT               │ 3) POST /api/auth/send-otp (best-effort)
  │ (access + refresh)             ▼
  ▼                               → /auth/otp → POST /api/auth/verify-otp
onAuthStateChange fires           
  │                               Forgot: api.auth.resetPasswordForEmail → email deep link
  ▼                               Reset : api.auth.updatePassword (only inside recovery session)
AuthProvider.setSession(user) → authStore.status = "authed"
  │
  ▼
Session persisted in OS keychain (chunked SecureStoreAdapter)
  │
  ▼
Every request carries the JWT:
   • Supabase client attaches it automatically (RLS)
   • apiFetch injects Authorization: Bearer <access token>
```

- **Transport:** `src/services/authService.ts` is the single auth transport. Deliberate split (documented in its header): **sign-in / session / reset → Supabase-direct**; **signup / send-otp / verify-otp → backend REST**. Errors are mapped to stable i18n keys (`toMessageKey`) so they render in EN/AR; tokens/OTP/passwords are never logged.
- **Access + refresh tokens:** managed by the Supabase JS client. `autoRefreshToken: true` + `persistSession: true`; refresh runs only while the app is foregrounded (`AppState` listener in `src/lib/supabase.ts`).
- **Session persistence:** OS keychain/keystore via the chunked `SecureStoreAdapter` (`src/lib/secureStore.ts`) — chunks values over ~1800 bytes and reassembles on read.
- **Session restore:** on launch, `AuthProvider` → `repositories.auth.restoreSession()` (`data/real/index.ts` → Supabase `getSession`) → `authStore`.
- **Logout:** `useSignOut()` (`src/hooks/queries/useAuth.ts`) → `repositories.auth.signOut()` → `api.auth.signOut(supabase)`, then **`queryClient.clear()`** wipes all cached patient data, then routes to `/auth/sign-in`.
- **Session expiration:** refresh token renews silently in the foreground; if it fails, `onAuthStateChange` emits null → `authStore.status = "guest"` → the `(app)` gate redirects to sign-in on the next navigation.

⚠️ **Note:** Google/Apple sign-in are intentionally **disabled** (`authService.googleSignIn` returns `errors.googleNotConfigured` unless real client IDs are configured, per `env.isGoogleConfigured`). No faked auth.

---

## 9. Data repositories

Contracts in `src/data/repositories.ts`; real impl in `src/data/real/index.ts`; hooks in `src/hooks/queries/*`. Which are wired to real backend is decided in `src/data/index.ts` (see §11).

| Repository | Key methods | Backend | Used by (screens) |
|---|---|---|---|
| **auth** | signIn, signUp, sendOtp, verifyOtp, requestPasswordReset, resetPassword, restoreSession, subscribe, signOut | Supabase + `/api/auth/*` | auth/*, AuthProvider, settings |
| **patient** | getProfile, updateProfile, uploadPhoto | Supabase `profiles`/`patient_profiles` + `account_image` bucket | profile, edit-profile, settings |
| **family** | list, add, update, remove | Supabase `family_members` | me, family/add, family/[id], patient-switcher |
| **medicalHistory** | get, upsert | Supabase `medical_histories` | medical-history, edit-profile |
| **appointment** | list(tab), get, getSlots, create, cancel, reschedule, checkIn | RPCs (`book/cancel/reschedule/checkin_my_appointment`, slots via `doctor_availability`) | appointments/*, booking/* |
| **payment** | list, get, byAppointment, createCheckout, verify | `/api/payments/checkout`, `/api/payments/verify`; reads `payments` | payments/*, booking/payment*, invoice |
| **document** | list, get, upload, remove, signedUrl | Supabase `patient_documents` + `patient-docs` bucket | records, records/document/[id], upload |
| **prescription** | list, get, pdfUrl, shareLink | Supabase `prescriptions` + `/api/prescriptions/{id}/*` | records/prescriptions/* |
| **lab** | list, get, trend, markViewed, signedUrl | Supabase `lab_results` + `lab_result_analytes` + `lab-results` bucket | records/labs/* |
| **notification** | list, facilityMessages, getPreferences, updatePreferences, markAllRead, markFacilityMessagesRead | Supabase `in_app_notifications`, `announcements`, `announcement_reads`, `profiles.notification_prefs` | notifications/*, settings/notifications |
| **doctor** | search, get, reviews, mapClinics | Supabase `doctors` + `doctor_availability` + `reviews`; `mapClinics` ⚠️ **mock** | search, doctors/[id]/*, map |
| **discovery** | listSpecialties, recentDoctors, featuredClinics | Supabase `specialties`, `facilities`, derived from appointments | dashboard, specialties, search/filters |
| **review** | submit | Supabase `reviews` | rate/[appointmentId] |
| **ai** | suggestDoctors, latestVisitSummary | `/api/ai/suggest-doctor`; `appointments.patient_summary` | ai/recommendations, ai/insights |

---

## 10. React Query

**Client** (`src/providers/QueryProvider.tsx`): `queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false }`, `mutations: { retry: 0 }`. Exported as `queryClient` so non-React code (sign-out) can `clear()` it.

**Patterns used across hooks:**
- **Query keys** — mostly array-prefixed. Some domains use a `*Keys` object (`labKeys`, `notificationKeys`, `patientKeys`); others inline literals (see ⚠️ in §4). Prefixes are consistent enough that `invalidateQueries(["appointments"])` catches list + detail + slots.
- **Mutations + invalidation** — every mutation invalidates the relevant prefix on success. Examples: `useVerifyPayment` → invalidates `["payments"]` + `["payments","by-appointment",id]`; `useCreateAppointment` → `patientKeys.appointmentsUpcoming` + `["appointments"]`; `useUploadDocument`/`useDeleteDocument` → `documentKeys.list`; `useMarkLabViewed` → `labKeys.list`; `useSubmitReview`, `useMarkFacilityMessagesRead`, etc.
- **Conditional queries** — detail/trend hooks use `enabled: !!id` (`useLabResult`, `useAnalyteTrend`, `useLabResultSignedUrl`).
- **Optimistic updates** — light: notifications "mark all read" flips a local `allRead` flag optimistically then mutates; profile-prefs toggles mutate immediately. Most flows rely on invalidate-then-refetch rather than cache surgery.
- **Refetch** — `refetchOnWindowFocus` is off (RN has no window focus); data refreshes on remount + after mutations. ⚠️ **There is no pull-to-refresh** anywhere (the `Screen` shell wraps a `ScrollView` but never wires a `RefreshControl`) — a known global UX gap.

---

## 11. Environment configuration

All env is read **only** in `src/config/env.ts` (public `EXPO_PUBLIC_*` — secrets never ship in the bundle).

| Var | Purpose | Used in |
|---|---|---|
| `EXPO_PUBLIC_DATA_MODE` | `mock` \| `staging` \| `production` — chooses data source | `env.ts` → `src/data/index.ts` |
| `EXPO_PUBLIC_API_URL` (fallback `EXPO_PUBLIC_BACKEND_URL`) | Next.js backend origin | `src/services/api.ts` (`resolveBaseUrl`) |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase client | `src/lib/supabase.ts` |
| `EXPO_PUBLIC_APP_ENV` | `development`/`production` → `isDev` | env.ts, dev gating |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | Optional OAuth IDs → `isGoogleConfigured` | authService |

**Mode semantics:** `mock` → `mockRepositories` (fully offline). `staging`/`production` → the **hybrid** in `data/index.ts`. In mock mode, `required()` returns harmless fallbacks so the app never crashes offline; in staging/production a missing Supabase/API var throws at startup.

⚠️ **Note:** `staging` and `production` select the **same hybrid composition** — the only difference is which URLs/keys the `.env` provides. There is no separate "fully real, nothing mock" mode; the hybrid still leaves `doctor.mapClinics` mock (Map View is deferred pending a native map SDK).

---

## 12. Navigation after login (end-to-end journey)

```
Launch → splash (session check)
  → authed?  yes → /dashboard        no → /auth/sign-in (or /welcome if first run)
dashboard → search → filters (bottom sheet) → doctors/[id]
  → booking/[doctorId]/schedule (pick clinic+date+slot)   [bookingStore]
  → booking/[doctorId]/review (confirm patient+reason → book_appointment_atomic)
       mock:  → booking/success
       real:  → booking/payment  (POST /api/payments/checkout → Thawani hosted page)
  → booking/payment-success  (POST /api/payments/verify → poll until paid)
  → /appointments  → appointments/[id]  → cancel | reschedule | check-in | rate
```
Cross-screen booking context is carried in `bookingStore`; the payment step reads `appointment_id` from the route param and confirmation polls `usePaymentByAppointment` + `useVerifyPayment`.

---

## 13. Providers (why each exists)

Order in `app/_layout.tsx` (outer → inner):
1. **GestureHandlerRootView** (`react-native-gesture-handler`) — required at the root for gesture-driven UI (bottom sheets, swipes).
2. **SafeAreaProvider** (`react-native-safe-area-context`) — supplies safe-area insets used by `Screen`, headers, tab bar.
3. **QueryProvider** (`src/providers/QueryProvider.tsx`) — the single TanStack Query client (server cache). Placed above Auth so hooks are available everywhere and sign-out can clear it.
4. **ThemeProvider** (`src/theme/ThemeProvider.tsx`) — light/dark + `textScale`; consumed via `useTheme()`.
5. **I18nProvider** (`src/i18n/index.tsx`) — locale (en/ar) + RTL; consumed via `useI18n()`.
6. **AuthProvider** (`src/providers/AuthProvider.tsx`) — bootstraps + subscribes the Supabase session into `authStore`. Innermost so it can use everything above.

There is **no** separate `BottomSheetProvider` (sheets use expo-router's `formSheet` presentation + gesture-handler) and **no** third-party localization provider (i18n is hand-rolled in `src/i18n`).

---

## 14. App lifecycle

- **Cold start:** native → `expo-router/entry` → root layout (fonts + providers) → splash gates on store hydration + session restore → route. See §1.
- **Warm start / resume:** `AppState` "active" → `supabase.auth.startAutoRefresh()` resumes token refresh (`src/lib/supabase.ts`). Query data may be `stale` (>30s) and refetches on the next screen mount.
- **Background:** `AppState` non-active → `stopAutoRefresh()` (saves battery, avoids background refresh churn).
- **Logout:** `useSignOut` → `api.auth.signOut` → `queryClient.clear()` → `authStore.status = "guest"` → `(app)` gate redirects to sign-in.
- **Session expiration:** silent refresh in foreground; on failure `onAuthStateChange(null)` → guest → redirect on next navigation.

---

## 15. Diagrams

**Startup**
```
App Launch → expo-router/entry → app/_layout (fonts + GestureHandler → SafeArea →
Query → Theme → I18n → Auth) → app/index (redirect) → splash (gate) → dashboard | sign-in | welcome
```
**Request**
```
Screen → Query hook → repositories.<domain>.<method> → data/real →
   (shared api.* → Supabase)  |  (apiFetch → Next.js /api/*) → response → domain type → RQ cache → re-render
```
**Auth**
```
Login → authService → Supabase (JWT) → onAuthStateChange → authStore(authed) →
SecureStore(session) → [Supabase auto-attach | apiFetch Bearer] → authenticated requests
```
**Structure** — see §2.

---

## 16. Best practices (house rules, derived from the code)

- **Never import `supabase`, `apiFetch`, or `@medilink/shared` into a screen.** Go through a `useX` hook → `repositories`. (Verified: no screen imports these directly.)
- **Read env only via `src/config/env.ts`.** Don't sprinkle `process.env`.
- **Server data → React Query; client state → Zustand; ephemeral → `useState`.** Don't mirror server data into Zustand.
- **Every list/detail screen renders `LoadingState` / `ErrorState` (with `onRetry` → `refetch`) / `EmptyState`.**
- **Mutations must invalidate their query prefix on success** so the UI updates automatically.
- **Map responses to domain types** (`src/data/types.ts`) in the repository, not in the screen.
- **Add a new backend-connected feature** by: add the interface method in `repositories.ts` → implement in `real/index.ts` (+ mock) → wire into the hybrid in `data/index.ts` → add a hook in `hooks/queries` → consume in the screen. (This is exactly how Lab Results / Specialties / Facility Messages were added.)

---

## 17. Important files to know

| File | Why it matters |
|---|---|
| `app/_layout.tsx` | Provider tree + root Stack |
| `app/splash.tsx` | Startup gate + first route decision |
| `app/(app)/_layout.tsx` | The auth gate for all private screens |
| `src/data/index.ts` | The mock/hybrid seam — what's real vs mock |
| `src/data/repositories.ts` | Every repository contract |
| `src/data/real/index.ts` | Real implementation (Supabase + apiFetch) |
| `src/config/env.ts` | All env + data-mode logic |
| `src/lib/supabase.ts` | Supabase client + token refresh + `getAccessToken` |
| `src/services/api.ts` | `apiFetch` (Bearer, base-URL, timeout, errors) |
| `src/services/authService.ts` | Auth transport (Supabase + backend split) |
| `src/providers/AuthProvider.tsx` / `QueryProvider.tsx` | Session bootstrap / query client |
| `src/hooks/queries/usePatient.ts` | Profile **+ appointments + payments** hooks (see ⚠️) |
| `docs/mobile-integration-audit.md` / `docs/mobile-runtime-verification.md` | Latest audit + runtime verification |

---

## 18. Common debugging points

- **"Network request failed" / can't reach API:** `EXPO_PUBLIC_API_URL` must be reachable from the device — a LAN IP (not `localhost`) for a physical phone, `10.0.2.2` (auto-rewritten) for the Android emulator; backend must listen on `0.0.0.0:3001`. `apiFetch` re-throws with the attempted URL + this hint.
- **Everything is empty but no error:** you're probably in `DATA_MODE=mock` (dev default) — check the `[MediLink] DATA_MODE=…` log emitted by `src/data/index.ts`, or a missing Supabase/API env in staging.
- **Stuck on splash:** one of the hydration flags never flips (`onboarding/theme/locale.hasHydrated`) or `authStore.status` stays `loading` (session restore threw). Check `AuthProvider` + SecureStore.
- **RLS "permission denied" / empty rows:** the patient identity is `patient_profiles.id` for most tables but `= auth.uid()` for `payments`/notifications — confirm the query's scoping matches the policy.
- **Auth works but backend calls 401:** the Bearer token isn't attached — verify `getAccessToken()` returns a session (SecureStore rehydrated) before `apiFetch`.
- **Payment "processing" forever:** Thawani is a hosted WebView redirect; verification polls `useVerifyPayment`. Confirm `/api/payments/verify` and the webhook that marks the payment paid.
- **Lab tables empty for a real patient:** analytes are populated by the HAMS technician ingestion (provider side); the patient screens are complete but show empty until then.

---

## 19. Where to start (new developer)

1. Read `app/_layout.tsx` → `app/splash.tsx` → `app/(app)/_layout.tsx` to understand launch + gating.
2. Read `src/data/index.ts` + `src/data/repositories.ts` — this is the whole data philosophy in two files.
3. Pick one feature (e.g. Lab Results) and trace it top-to-bottom: `records/labs/index.tsx` → `hooks/queries/useLabs.ts` → `repositories.lab` (`data/real/index.ts`) → `shared/src/api/labs.ts` → Supabase. Do the same for a backend-routed feature (payments) to see the `apiFetch` path.
4. Flip `EXPO_PUBLIC_DATA_MODE=mock` and run to see the app fully offline; then `staging` with real env to see the hybrid.
5. Keep `docs/mobile-integration-audit.md` open — it lists per-screen status and the known deferred items.

---

## 20. Called-out inconsistencies (do not "fix" blindly — noted for awareness)

1. **Appointment/payment hooks live in `usePatient.ts`** instead of `useAppointments.ts`/`usePayments.ts`.
2. **Query-key style is uneven** — `*Keys` objects in some domains, inline array literals in others (esp. `usePatient.ts`).
3. **`staging` vs `production` select the same hybrid**; the difference is only env values, and `doctor.mapClinics` stays mock in both.
4. **No pull-to-refresh** — the `Screen` shell never wires a `RefreshControl`.
5. **Theme is reached two ways** — `ThemeProvider` (root) vs `useTheme` hook (screens); consistent but two entry points.
6. **`bookingStore` vs `patientStore`** both hold "who/what is being acted on" context; know which owns the active-patient id (`patientStore`) vs the in-flight booking (`bookingStore`).
