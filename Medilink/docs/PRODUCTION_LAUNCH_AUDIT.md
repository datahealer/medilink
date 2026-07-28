# MediLink Mobile — Production Readiness Audit

**Date:** 2026-07-28 · **Branch:** `feature/ai-completion` · **Method:** verified against the repository, not against prior audit docs.

Every claim below carries repository evidence. Items that **cannot** be verified from the repo (Apple/Expo/Supabase dashboard state) are marked **UNVERIFIABLE — must confirm**, never assumed either way.

---

# Executive Summary

| Metric | Value |
|---|---|
| **Overall completion** | **~88%** |
| **Mobile client code** | **~97%** |
| **Backend dependency** | **~90%** (MediLink+HAMS backend done; queue staff-side + push trigger outstanding — HAMS-owned) |
| **Production configuration** | **~45%** ← the weakest axis and the true gate |
| **Infrastructure** | **~40%** (APNs/FCM, crash reporting, maps key unset) |
| **Testing** | **~10%** (no automated tests anywhere; zero device validation) |
| **Production readiness** | **~55%** |
| **Confidence in this assessment** | **~92%** for code, **~60%** for infrastructure (dashboard state not inspectable) |

**Launch recommendation: READY FOR INTERNAL TESTING** (dev-client / simulator, with `EXPO_PUBLIC_DATA_MODE=staging`).
**NOT ready for TestFlight** until B1–B4 are closed. The application code is in good shape; what is missing is release configuration, credentials, and the fact that **nothing has ever run on a physical device**.

The single most dangerous finding is **B1**: an EAS production build with no environment configuration silently ships in **mock mode** with seeded fake patient data, and simultaneously enables the dev screen gallery. Nothing in the build fails to warn you.

---

# Feature Status

Evidence paths are repo-relative. "Owner" distinguishes MediLink / HAMS / Infra / Config / QA per the brief.

## Core patient flows

| Feature | Status | % | Verified evidence | Remaining work | Owner | Priority |
|---|---|---|---|---|---|---|
| Authentication (email+password, email OTP) | Complete | 100 | `src/services/authService.ts`, `app/auth/*`, backend `api/auth/*` (10 routes) | — | — | — |
| Session management / token refresh | Complete | 100 | `src/lib/supabase.ts:44-60` — proactive refresh when token within 60s of expiry, fixing stale-bearer 401s | — | — | — |
| Sign-out hygiene | Complete | 100 | `authService.signOut` → `clearPushToken()` before session end (RLS-scoped delete while valid) | — | — | — |
| Forgot password | **Partial** | 50 | `authService.ts:193` send works (real email); `resetPassword` at `:203` only succeeds inside a recovery session, and **no deep-link config exists** (`app.json` has no `associatedDomains`/`intentFilters`) | Wire recovery deep link, or hide the flow | MediLink + Config | **High** |
| Google sign-in | Intentionally disabled | n/a | `authService.ts:213` returns `googleNotConfigured`; `sign-in.tsx:248` disables the button when `!isGoogleConfigured` | Nothing (honest disabled state) | — | Low |
| Apple Sign In | Absent | 0 | no `expo-apple-authentication` dep | **Required by App Store §4.8 only if a 3rd-party social login ships.** Google is disabled → not triggered | — | Low |
| SMS OTP | Absent by decision | n/a | tracker 10.1 — blocked on SMS provider provisioning | Out of v1 scope | HAMS/Infra | Low |
| Onboarding | Complete | 100 | `app/onboarding.tsx`, `welcome.tsx`, `splash.tsx`, `language.tsx` | — | — | — |
| Mandatory profile setup gate | Complete | 100 | `app/(app)/_layout.tsx:74-80` — DOB-null = "not onboarded", mirrors web rule, no redirect loop | — | — | — |
| Guest Mode | Complete | 100 | `app/(app)/_layout.tsx:21-33` route allow-list + `<GuestWall/>`; per-action gating via `useGuestGate` | Staging RLS test (T4) | QA | **Critical** |
| Patient Profile | Complete | 100 | `data/real/index.ts` patientRepo; `edit-profile.tsx`; photo upload via backend `patients/me/profile-photo` | — | — | — |
| Family Members | Complete | 100 | real `familyRepo`; `app/(app)/family/{index,add,[id]}.tsx` | — | — | — |
| Medical History | Complete | 100 | real `medicalHistoryRepo`; `app/(app)/medical-history.tsx` | — | — | — |
| Appointments (list/detail/cancel/reschedule) | Complete | 100 | real `appointmentRepo`; `shared/src/api/appointments.ts`; `app/(app)/appointments/*` | — | — | — |
| Booking (slots → review → checkout) | Complete | 100 | `app/(app)/booking/*` (6 screens); `get_available_slots` RPC is single source of truth (`appointments.ts:186`) | Device round-trip (T5) | QA | **Critical** |
| Payments (Thawani hosted WebView) | Complete | 100 | `app/(app)/booking/payment.tsx`, `payment-success.tsx` w/ bounded auto-poll; backend `payments/*` (10 routes) | **Prod checkout host** (C6) + device test (T5) | Config + QA | **Critical** |
| Invoices | Complete | 100 | backend `payments/[id]/invoice{,/regenerate}`; `app/(app)/payments/invoice/[id].tsx`; `retry-invoices` edge fn | — | — | — |
| Refunds | Complete | 100 | `20260722000000_refund_integrity.sql` applied (verified remote); atomic + idempotent RPCs | Verify on staging | QA | High |
| Records / Document Vault | Complete | 100 | real `documentRepo`; buckets `patient-docs`; `records/upload.tsx` (PDF + camera + library) | — | — | — |
| Prescriptions | Complete | 100 | real `prescriptionRepo`; backend PDF + share-link routes | — | — | — |
| Lab Results (+ analyte trends) | Complete | 100 | real `labRepo`; `lab_result_analytes`; `TrendChart` | — | — | — |
| Doctor Search / Details / Reviews | Complete | 100 | real `doctor.search/get/reviews`; `app/(app)/doctors/[id]/*` | — | — | — |
| Clinics | Complete | 100 | real `discovery.searchClinics/getClinic/featuredClinics/nearbyClinics` | — | — | — |
| Favourites | Complete | 100 | real `favouriteRepo` (`favourites` table + RLS) | — | — | — |
| Map View | **Code complete, broken on Android** | 70 | `react-native-maps@1.20.1` installed; `app/(app)/search/map.tsx`; reachable from `search.tsx:102` + `me.tsx:79`. **`doctor.mapClinics` is the only remaining mock** (`data/index.ts:46`) | **`app.json:32` Android Maps key is the literal string `REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY`** → Android map fails. Real pin source still mock | Config + MediLink | **High** |
| Notifications centre + facility messages | Complete | 100 | real `notification.*` (6/6 methods); `app/(app)/notifications/*` | — | — | — |
| Notification preferences | Complete | 100 | `profiles.notification_prefs`; honoured by `sendPush.ts:44` | — | — | — |
| Settings | Complete | 95 | `app/(app)/settings/{index,appearance,notifications}.tsx` | "Export Data"/"Privacy" hidden by decision (tracker 6.7/6.8) | — | Low |
| Localization (EN/AR) | Complete | 100 | `src/i18n/{en,ar}.ts`; `ar.ts` typed against `en.ts` via `Leaves<Messages>` | — | — | — |
| Arabic RTL | Complete | 95 | runtime JS `isRTL` context — **no app restart needed**; 56/64 screens reference `isRTL` | Device sweep (T7); Arabic bold renders regular (single-weight font, documented) | QA | High |
| Theme / dark mode | Complete | 100 | `theme/{tokens,light,dark}.ts`; `ThemeProvider` merges persisted mode + `useColorScheme` | — | — | — |
| Tablet / responsive | Complete | 90 | `useResponsive` (`isTablet`, `contentMaxWidth`, `columns`); used by 52/64 screens; `supportsTablet: true` | Tablet pass (T8) | QA | Medium |

## AI module

| Feature | Status | % | Verified evidence | Remaining work | Owner | Priority |
|---|---|---|---|---|---|---|
| AI Symptom Checker | Complete | 100 | `app/(app)/ai/assistant.tsx` → `services/aiSymptomCheck.ts` (SSE stream); backend route has auth + 5/hr rate limit | — | — | — |
| AI Doctor Recommendation | Complete | 100 | `ai/recommendations.tsx` → `useSuggestedDoctors`; backend auth + rate limited | — | — | — |
| AI Scheduling assist | Complete | 95 | `ai/schedule.tsx` → `useScheduleAssist`; backend auth present | **No rate limit** on `ai/schedule-assist` (cost exposure) | HAMS/Backend | Medium |
| AI Prescription scan | Complete | 95 | backend `ai/scan-prescription` — auth present | **No rate limit / no file-size cap** | HAMS/Backend | Medium |
| AI Health Insights | Complete | 100 | `ai/insights.tsx` → `useVisitSummary`; fabricated vitals chart was removed (tracker 1.1) | — | — | — |
| AI provider config | Complete | 100 | Groq only; no mock/stub — missing key yields graceful 5xx, never fake clinical data | `GROQ_API_KEY` in prod env (C5) | Config | **Critical** |

## Queue module (HAMS-owned backend — verified integrated, NOT missing)

| Feature | Status | % | Verified evidence | Remaining work | Owner | Priority |
|---|---|---|---|---|---|---|
| Queue migrations | **Applied & verified live** | 100 | `supabase migration list` → all 5 (`20260728000001-05`) present as **local AND remote**; `gen types --linked` confirms `get_my_queue_position`, `acknowledge_queue_call`, `realtime_published_tables`, `acknowledged_at/_kind` all exist | — | — | — |
| Queue RPC security | **Verified enforcing** | 100 | live probe as `anon`: both RPCs → `401 / 42501 permission denied`; `GET queue_items` → `200 []` (no rows leak) | Cross-tenant test w/ 2 patient sessions (T6) | QA | **High** |
| Check-In | Complete | 100 | `checkin_my_appointment` wired from 3 entry points; now routes to Live Queue on success | — | — | — |
| Live Queue screen | Complete | 100 | `app/(app)/appointments/[id]/queue.tsx` — waiting/called/done + 5 contract error states; `QueuePositionRing`, `QueueTimeline` | Device test (T9) | QA | High |
| Queue endpoints | Complete | 100 | `backend/.../queue-status/{route,acknowledge/route}.ts` byte-identical to HAMS; live probe returns exact contract envelope `401 {"success":false,"error":{"code":"unauthorized"}}` | Drop `as any` casts **in HAMS first** (avoid divergence) | HAMS | Low |
| Queue realtime | Complete | 100 | `shared/src/api/queue.ts` `subscribeToMyQueue`; `useQueueRealtime` — invalidation-only, foreground-scoped, refetch on resume | Device test | QA | High |
| Acknowledgement | Complete | 100 | `useAcknowledgeQueueCall` — deliberately non-optimistic | — | — | — |
| Queue polling fallback | Complete | 100 | `useQueue.ts` adaptive 10/30/60s, stops at `done`, never in background | — | — | — |
| **Queue staff transitions** | **Absent** | 0 | Nothing writes `status='called'`/`'done'`. `call_next`/`skip`/`recall`/`pause`/`mark_no_show` unbuilt (contract §3.6) | Build staff ops | **HAMS** | **Critical** |
| **Queue push on → called** | **Absent** | 0 | contract §3.3 — trigger + Edge Function unbuilt. MediLink dispatcher + deep-link routing ready and idle | Build trigger/fn | **HAMS** | **Critical** |

## Cross-cutting

| Feature | Status | % | Verified evidence | Remaining work | Owner | Priority |
|---|---|---|---|---|---|---|
| Push notifications (client) | Complete | 100 | `services/push.ts` (permission → token → `device_tokens` upsert; `unique(user_id,token)` confirmed in migration); `usePushNotifications` handles fg/bg/**cold start**; `projectId` resolves from `app.json extra.eas.projectId` | **APNs key + FCM credentials** (I1/I2) | Infra | **Critical** |
| Push dispatch (server) | Complete | 100 | `backend/src/lib/notifications/sendPush.ts` — opt-in check, 100-msg batching, `DeviceNotRegistered` cleanup | — | — | — |
| Deep links | **Partial** | 40 | `scheme: "medilink"` set. Push tap-routing works in-process (`routeForNotificationData`, incl. new `queue` kind) | **No `associatedDomains` / `intentFilters`** → no Universal/App Links; breaks email recovery links | Config | **High** |
| Offline support | Complete | 100 | deps **now installed** (netinfo 11.4.1, persist-client, async-storage); `QueryProvider` drives `onlineManager` from NetInfo; 24h persisted cache, success-only dehydrate, purge on logout; `OfflineBanner` mounted | Airplane-mode device pass (T10) | QA | High |
| Caching | Complete | 100 | `QueryProvider.tsx` — `staleTime` 30s, `gcTime` 24h, version buster `v0.1.0` | Bump buster on release | Config | Low |
| Error handling | Complete | 95 | `ErrorBoundary` mounted at root (`app/_layout.tsx:41`); `ApiError` carries status+body; queue maps every contract code | — | — | — |
| Crash recovery | Complete | 90 | themed/localized ErrorBoundary fallback with Retry | No **crash reporting** (I3) | Infra | **High** |
| **Crash / error reporting** | **Absent** | 0 | no Sentry/Bugsnag/Crashlytics/Datadog anywhere in `src`, `app`, `package.json` | Add before public beta | Infra | **High** |
| **Analytics** | **Absent** | 0 | no Amplitude/Mixpanel/PostHog/Firebase Analytics | Product decision | Product | Medium |
| Logging | Adequate | 90 | 5 unguarded `console.*`, all legitimate (ErrorBoundary, sign-in error, booking warns); data-mode log is inside `if (__DEV__)` | Optional: route to crash reporter | Infra | Low |
| Accessibility | Good | 85 | 69 files carry `accessibilityLabel`/`accessibilityRole`; queue screen adds a11y labels + `announceForAccessibility` on call | Screen-reader sweep (T11); Dynamic Type check | QA | Medium |
| Animations | Complete | 100 | Reanimated 4; `react-native-worklets/plugin` last in `babel.config.js` (SDK 54 requirement) | — | — | — |
| Loading states / skeletons | Complete | 100 | `StateView.tsx` (`LoadingState`/`ErrorState`/`EmptyState`); mock layer has ~450ms delay so states are visible | — | — | — |
| Navigation | Complete | 100 | Expo Router; single auth gate at `(app)/_layout.tsx`; tab bar structurally excluded from auth routes | — | — | — |
| Permissions handling | Complete | 90 | `requestCameraPermissionsAsync` before `launchCameraAsync` (`records/upload.tsx:58`) | Remove unused perms (C8/C9) | Config | Medium |
| Type safety | Complete | 100 | `npm run typecheck` — **all 4 workspaces, 0 errors** (verified this session, incl. after regenerating types) | — | — | — |
| Lint | Clean (mobile) | 100 | `cd mobile && npm run lint` → **0 problems** | backend/frontend `next lint` fails **pre-existing/environmental** (deprecated, no ESLint config → interactive prompt); verified identical with queue routes removed | Infra | Low |
| **Automated tests** | **Absent** | 0 | no jest config, no `*.test.*` in any workspace | Introduce at least payment/auth/queue integration tests | QA | **High** |

---

# Production Configuration Checklist

| # | Item | Status | Required action | Owner |
|---|---|---|---|---|
| **C1** | **`eas.json` has no `env` for any profile** | ❌ **BLOCKER** | A production build with unset `EXPO_PUBLIC_*` falls to `DATA_MODE=mock` (`src/config/env.ts:20`) → ships **seeded fake patient data** ("Aisha Al Harthy") against `http://mock.local`, and `isDev` becomes true (`APP_ENV` defaults to `development`) → **dev screen gallery enabled in production**. Add `env` blocks per profile (or EAS dashboard vars) **and** a build-time assert that production ≠ mock | Config |
| **C2** | `app/dev/design-system-preview.tsx` unguarded | ❌ | `screen-gallery.tsx:29` has `if (!isDev) return <Redirect/>`; `design-system-preview.tsx` has **no guard** → reachable via `medilink://dev/design-system-preview`. Add the same guard or delete both routes for release | MediLink |
| **C3** | `usesCleartextTraffic: true` (`app.json:26`) | ❌ | Allows plaintext HTTP on Android. Remove for production (HTTPS-only) | Config |
| **C4** | Android Google Maps key is a placeholder (`app.json:32`) | ❌ | Literal `REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY` → Android map non-functional. Supply a real restricted key, or hide the Map entry points | Config |
| **C5** | Backend prod secrets | ⚠️ UNVERIFIABLE | Confirm in the deploy target: `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` (**required** — no AI fallback), Thawani keys, `INVITE_SECRET` (guards push route) | Config |
| **C6** | `THAWANI_CHECKOUT_BASE_URL` unset ⇒ **UAT** | ❌ **BLOCKER** | `payments/checkout/route.ts:109` defaults to `https://uatcheckout.thawani.om`. Production must set `https://checkout.thawani.om` or real bookings hit a sandbox | Config |
| **C7** | `THAWANI_WEBHOOK_SECRET` | ⚠️ | `webhook/route.ts:29` — HMAC **skipped when unset** (Thawani re-query remains authoritative). Set it for defence-in-depth | Config |
| **C8** | `RECORD_AUDIO` declared, never used | ❌ | No audio API used anywhere (verified). Both `app.json:28` **and** the `expo-image-picker` plugin auto-add it (`withImagePicker.js:33`). Set `microphonePermission: false` in the plugin config **and** remove from `permissions[]`, else Play Console demands a mic justification | Config |
| **C9** | Unused iOS permission strings | ⚠️ | `NSFaceIDUsageDescription` (`app.json:19`) with **no** `expo-local-authentication` dep; `NSMicrophoneUsageDescription` auto-injected by the picker plugin. Remove both | Config |
| **C10** | `NSCameraUsageDescription` is the plugin default | ⚠️ | Camera **is** used (`records/upload.tsx:60`). Plugin injects the generic `"Allow $(PRODUCT_NAME) to access your camera"` (`withImagePicker.js:6,27`) — **no crash**, but weak for health-app review. Set an explicit purpose string | Config |
| **C11** | No native splash screen | ⚠️ | No `expo-splash-screen` dep, no `splash` key in `app.json`. `app/splash.tsx` is a JS screen — cold start shows blank white first | Config |
| **C12** | Assets incomplete | ❌ | `assets/images/` contains **only `icon.png`**. Missing: Android adaptive icon (fg/bg), splash asset, notification icon (`expo-notifications` has `color` but no `icon`) | Config |
| **C13** | `version: "0.1.0"` | ⚠️ | Bump to a release version. Build numbers are handled (`appVersionSource: remote` + `autoIncrement`) | Config |
| **C14** | No `aps-environment` entitlement | ❌ | Required for APNs. Absent from `app.json` (no `entitlements` block) | Config |
| **C15** | No OTA updates | ⚠️ | No `expo-updates` dep, no channels/`runtimeVersion`. Not a blocker (runtime RTL removed the dependency on it) — but no hotfix path post-launch | Infra |
| **C16** | `account_image` bucket not in migrations | ⚠️ | Used in code but created manually in HAMS (no migration). Confirm it exists in prod with correct RLS | HAMS/Infra |
| **C17** | Privacy manifest (`PrivacyInfo.xcprivacy`) | ❌ | Absent. Apple **requires** it for required-reason APIs (UserDefaults/file timestamps via AsyncStorage/SecureStore) | Config |

---

# Infrastructure Checklist

| # | Item | Status | Action | Owner |
|---|---|---|---|---|
| **I1** | APNs key uploaded via `eas credentials` | ⚠️ UNVERIFIABLE | Requires Apple Developer + Expo dashboard. Push is dead on iOS without it | Infra |
| **I2** | FCM credentials for Android | ❌ | No `google-services.json` in repo; EAS needs an FCM V1 service-account key. Push dead on Android without it | Infra |
| **I3** | Crash reporting | ❌ | None installed. A healthcare app cannot diagnose field crashes blind | Infra |
| **I4** | Supabase Realtime quota/limits for `queue_items` | ⚠️ | Table is published (verified). Confirm concurrent-connection limits on the plan | Infra |
| **I5** | Edge Functions deployed | ⚠️ UNVERIFIABLE | 16 exist in repo (`generate-invoice`, `release-expired-holds`, `retry-invoices`, `notify-waitlist`, …). Confirm each is deployed with its secrets | Infra |
| **I6** | `pg_cron` jobs | ⚠️ | `auto-unavailable-doctors` exists. **No queue end-of-day cleanup** (contract §3.5) — `position` grows unbounded | HAMS |
| **I7** | Backend hosting + prod URL | ⚠️ | `EXPO_PUBLIC_API_URL` must be the deployed HTTPS origin. Confirm host, TLS, `0.0.0.0` bind | Infra |
| **I8** | Rate limiting durability | ⚠️ | In-memory `Map` limiters are per-instance → bypassable on serverless (tracker 7.3) | HAMS/Backend |
| **I9** | Storage bucket policies | ⚠️ | `patient-docs`, `lab-results`, `facility-profile-photo`, `user-exports`, `account_image` — verify RLS in prod | Infra |

---

# Testing Checklist

**Nothing has been executed on a physical device. There is no automated test suite in any workspace.** This is the largest single risk area.

| # | Test | Status | Notes |
|---|---|---|---|
| **T1** | Automated unit/integration tests | ❌ none | At minimum: auth, booking→payment, queue status mapping |
| **T2** | iOS physical device (permissions, keyboard, splash, RTL) | ❌ | **No iOS hardware available** — pre-existing |
| **T3** | Android physical device full regression | ❌ | Shared JS layer covers most logic |
| **T4** | Guest-mode RLS test on staging | ❌ | **Security-critical.** anon may read discovery only; denied on every patient table/RPC |
| **T5** | Payment round-trip incl. WebView return/cancel/close/timeout | ❌ | Real money path |
| **T6** | Queue cross-tenant test (Patient A ↦ B's appointment ⇒ `forbidden`) | ❌ | Contract §4 security gate. `anon` probes pass but don't substitute |
| **T7** | RTL end-to-end en↔ar instant switch | ❌ | Runtime RTL is new |
| **T8** | Tablet layout | ❌ | `supportsTablet: true` ⇒ Apple **will** review on iPad |
| **T9** | Queue on device (realtime, called state, acknowledge) | ❌ | Blocked on HAMS staff ops for called/done |
| **T10** | Offline / airplane mode | ❌ | Verify cached render + banner + no ticking ETA |
| **T11** | Accessibility / screen reader | ❌ | VoiceOver + TalkBack |
| **T12** | Notification delivery fg/bg/killed + tap routing | ❌ | Blocked on I1/I2 |
| **T13** | AI features against real Groq | ⚠️ partial | Verified by code; not load/quota tested |
| **T14** | Backend smoke per `docs/TESTING_GUIDE.md` | ⚠️ partial | Queue routes verified live this session (401 + envelope) |

---

# Release Checklist

| Item | Status |
|---|---|
| Bundle IDs (`com.inzint.medilink` / `com.medilink.app`) | ✅ set |
| EAS `projectId` | ✅ `0aed5a20-…` |
| `ITSAppUsesNonExemptEncryption: false` | ✅ set |
| `autoIncrement` + remote version source | ✅ set |
| App icon | ⚠️ iOS only; Android adaptive icon missing |
| Splash screen | ❌ none |
| Notification icon | ❌ none (colour only) |
| Privacy manifest | ❌ |
| App Store metadata / screenshots / nutrition labels | ❌ |
| Play Data Safety form | ❌ (blocked by C8 mic permission) |
| Review notes + demo account | ❌ |
| Health-app compliance (Apple 1.4.1 / Play Health) | ❌ not prepared — AI symptom checker will draw scrutiny; needs explicit "not medical advice" positioning in metadata |
| Release version bump | ❌ still `0.1.0` |
| `submit.production` config | ⚠️ empty (`ascAppId` etc. unset) |

---

# Blockers

Genuine launch blockers only, priority order.

| # | Blocker | Owner | Why it blocks |
|---|---|---|---|
| **B1** | **Production build ships in mock mode + dev routes exposed** | Config/MediLink | No `env` in `eas.json`; `DATA_MODE` defaults to `mock` and `APP_ENV` to `development`. A signed store build would present **fabricated patient data** and an internal component gallery. Silent — nothing warns. (C1 + C2) |
| **B2** | **Push notifications non-functional end-to-end** | Infra + HAMS | Client is complete, but no APNs key (I1), no FCM credentials (I2), no `aps-environment` entitlement (C14). Also HAMS's `→ called` trigger is unbuilt (contract §3.3) — the decisive queue moment never reaches a backgrounded patient |
| **B3** | **Thawani defaults to UAT checkout** | Config | `THAWANI_CHECKOUT_BASE_URL` unset ⇒ sandbox. Real bookings would not take real payment (C6) |
| **B4** | **Zero device validation, zero automated tests** | QA | No build has run on physical hardware; no test suite exists. Cannot assert the app works (T1–T3, T5) |
| **B5** | **Queue cannot progress** | **HAMS** | No staff surface writes `status='called'`/`'done'` (contract §3.6). Patients check in and wait forever; Called/Completed unreachable. *MediLink side is complete — this is not MediLink work.* |
| **B6** | **Security gates never executed** | QA | Guest-mode RLS test (T4) and queue cross-tenant test (T6) are unrun. Both are PHI-boundary gates |
| **B7** | **`GET /api/ai/health` is unauthenticated, leaks the API-key prefix, and calls Groq on every request** | HAMS/Backend | `ai/health/route.ts:16` returns `keyPrefix` (first 7 chars of `GROQ_API_KEY`) + `NODE_ENV`, and performs a live completion per hit → unauthenticated cost-amplification/DoS. Documented as a debug endpoint. Must be removed or gated |
| **B8** | **No crash reporting** | Infra | Cannot diagnose field crashes in a healthcare app (I3) |
| **B9** | **Store assets incomplete** | Config | No splash, no Android adaptive icon, no notification icon, no privacy manifest → submission will fail or be rejected (C11, C12, C17) |
| **B10** | **`usesCleartextTraffic: true`** | Config | Plaintext HTTP permitted on Android; unacceptable for PHI (C3) |

**Not blockers** (correctly scoped out): forgot-password completion (can hide the flow), Map on Android (can hide entry points), SMS OTP, Apple Sign In (not triggered — no social login ships), OTA updates, analytics.

---

# Nice To Have

- Live Activity / Dynamic Island for queue position (needs a native module)
- Leave-and-return + travel-time "leave now" nudge (needs HAMS columns that don't exist)
- Pre-consultation form while waiting — `pre_consultation_forms` table already exists and is unused
- Analytics / funnel instrumentation
- OTA updates (`expo-updates`) for hotfixes
- `CountryCodePicker` for `PhoneField` (the only real TODO in the codebase, `PhoneField.tsx:18`)
- Arabic bold weight (single-weight 29LT Zarid Sans renders bold as regular — documented)
- Encrypted MMKV instead of AsyncStorage for the PHI query cache
- Queue analytics (`done_at` retained but unconsumed)
- Consolidate `send-otp`/`resend-otp` (divergent expiry 10 vs 5 min); `crypto.randomInt` in `resend-otp`
- Fix hardcoded `Asia/Kolkata` → `Asia/Muscat` in Google Calendar integration

---

# Final Verdict

# READY FOR INTERNAL TESTING

Suitable **now** for internal dev-client/simulator testing with `EXPO_PUBLIC_DATA_MODE=staging` and a locally reachable backend.

**NOT READY for TestFlight, Beta, or Production.**

Blockers in priority order:

1. **B1** — production build ships mock data + exposes dev routes *(highest severity; silent failure)*
2. **B3** — Thawani UAT checkout in production
3. **B7** — unauthenticated `ai/health` leaking key prefix + unbounded Groq calls
4. **B10** — cleartext HTTP allowed on Android
5. **B2** — push non-functional (APNs/FCM/entitlement + HAMS trigger)
6. **B6** — guest-mode RLS and queue cross-tenant security tests unrun
7. **B9** — splash/adaptive icon/notification icon/privacy manifest missing
8. **B8** — no crash reporting
9. **B4** — no device validation, no automated tests
10. **B5** — *(HAMS)* queue staff transitions absent

**Path to TestFlight:** B1, B3, B7, B10, B9, B2, plus C8/C9/C13 — roughly **2–3 days of configuration work**, no feature development. Then B4 device validation and B6 security tests gate Beta. B5 gates the queue feature specifically, and is HAMS-owned.

The code is not the problem. Configuration, credentials and verification are.
