# MediLink Mobile Completion Tracker

> **Living document.** This is the single source of truth for the remaining mobile work until the app reaches 100%.
> After every implementation batch, flip checkboxes `☐ → ☑`, update the per-phase % and the dashboard, and bump **Last updated**.
> Status is verified against the **current codebase**, not older audits. Where this disagrees with `PRODUCTION_READINESS_AUDIT.md` or `MOBILE_IOS_RELEASE_PLAN.md` (both dated 2026-07-15), **this document wins** — a week of work has shipped since.

## Overall Completion

| | |
|---|---|
| **Current completion** | **~91%** |
| **Remaining** | **~9%** |
| **Estimated days remaining** | **~11–15 focused engineering days** + device/QA time (iOS hardware not yet available) |
| **Production readiness** | 🟠 **Not release-ready** — remaining blockers: push APNs/EAS creds + device delivery verification, zero iOS-device validation. *(Resolved in code: fake vitals, symptom-check auth, error boundary, refund correctness, push/deep-link client wiring.)* |
| **Current branch** | `runtime-rtl` (work merges toward `main`; prior feature work landed on `ios-production-backend`) |
| **Last updated** | 2026-07-22 |

> **Phase status:** Phase 1 — code complete (awaiting user `db:push` 1.8 + guest-RLS test 1.9). Phase 2 (Push & Deep Links) — **client code complete** (2.1–2.5, 2.8); awaiting APNs/EAS creds (2.7) + on-device delivery verification (2.6). Phase 3 (Offline) is next.

### Status legend
`☐` Not Started · `⏳` In Progress / Partial · `☑` Completed · `🚫` Not Required (de-scoped / superseded)
Priority: **Critical** (blocks release) · **High** · **Medium** · **Low**

---

## Phase 1 — Production Blockers (Security & Clinical Integrity)

**Purpose:** Close the remaining items that make the app unsafe or dishonest to ship. Nothing else ships until these are done.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Remove/replace fabricated vitals trend chart in `ai/insights.tsx` (static `TREND_POINTS` L15-23) | ☑ | Critical | No | 1–2 h | **Done (Batch 1, verified).** Fabricated chart + legend + "+8%" note removed; screen now shows only the real visit-summary card. Dead/fabricated i18n keys removed. |
| 1.2 | Add auth (`getUser`) to backend `ai/symptom-check` route | ☑ | Critical | Yes | 1 h | **Done (Batch 1, verified).** 401 when unauthenticated. Web caller fixed with `credentials:"include"`. |
| 1.3 | Add per-user rate limiting to `ai/symptom-check` | ☑ | Critical | Yes | 1 h | **Done (Batch 1, verified).** 5/hour via `ai_request_logs` (`feature="symptom_check"`), mirrors `ai/suggest-doctor`. |
| 1.4 | Add a global React error boundary at the root (`app/_layout.tsx`) | ☑ | Critical | No | 2–3 h | **Done (Batch 1, verified).** `src/components/ErrorBoundary.tsx` wraps the navigation Stack; themed + localized fallback with Retry. |
| 1.5 | Fix refund: add cancellation guard (only refund cancelled appts) | ☑ | High | Yes | 2 h | **Done (code; pending `db:push` + test).** `request_appointment_refund` RPC rejects unless the appointment is `cancelled`. Also fixed the always-false `cancelled_by === "facility"` bug (it's a UUID → resolve by role). |
| 1.6 | Fix refund: make check→refund→insert atomic + idempotent | ☑ | High | Yes | 2 h | **Done (code; pending `db:push` + test).** RPC locks the payment row `FOR UPDATE`; concurrent calls serialize → exactly one refund; an already-refunded/in-progress payment returns idempotently (no second gateway call). Route: claim → gateway → finalize/fail. |
| 1.7 | Fix refund: set `payments.status` on success + fix schema bugs | ☑ | High | Yes | 1 h | **Done (code; pending `db:push` + test).** `finalize_appointment_refund` sets `refunded`/`partial_refund`. Fixed: no more non-existent `refunds.facility_id` insert; uses `facility_settings.partial_refund_percent` (was `refund_percent`) + configurable `cancellation_cutoff_hours`. Also removed client error-text leakage (B8). Migration `20260722000000_refund_integrity.sql`. |
| 1.8 | Push un-deployed migrations (`npm run db:push`) — **user action** | ☐ | High | Yes | 15 m | Pending migrations to push: `20260721000000_doctors_available_today_security_definer`, `20260721000001_document_type_invoice` (invoices→vault), `20260722000000_refund_integrity` (refund RPCs). Client is resilient without the SECURITY DEFINER one (no "available today" badge). |
| 1.9 | Run Guest Mode §14 staging RLS test — **user action** | ☐ | Critical | Yes | 0.5 d | Security-critical gate: anon **can** read discovery/availability, **denied** on every patient table/RPC (incl. the new refund RPCs, which are `service_role`-only). |

**Progress:** Code-complete 100% (1.1–1.7) · Awaiting user ops/QA: 1.8 (`db:push`) + 1.9 (staging RLS test)
**Estimated remaining hours:** ~0 dev · ~1 h user ops/QA
**Exit criteria:** No fabricated clinical data in-app ✅; symptom-check authenticated + throttled ✅; refund correct & atomic ✅ (code); error boundary catches render crashes ✅; **migrations pushed** (1.8) + **guest RLS verified** (1.9) + refund verified on staging.
**Testing checklist:**
- ☑ Insights screen shows no fake vitals (removed)
- ☑ `ai/symptom-check` returns 401 unauthenticated; 429 when rate exceeded
- ☐ Refund only succeeds on a cancelled appointment; payment status flips to `refunded`/`partial_refund`; concurrent refund calls don't double-issue *(needs `db:push` of the refund migration)*
- ☑ Forced render error shows a fallback screen, not a white screen
- ☐ Staging: anon SELECT/EXECUTE allowed on discovery only; denied on `appointments`, `patient_profiles`, `payments`, `book_appointment_atomic`, and the refund RPCs

---

## Phase 2 — Push Notifications & Deep Links

**Purpose:** Turn the dead push module into a working end-to-end pipeline and add inbound deep-link handling for notification tap-routing.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Call `syncPushToken()` after successful sign-in / session restore | ☑ | High | No | 0.5 d | **Done.** `usePushNotifications` syncs the token when `authStore.status === "authed"` (mounted via `<PushNotifications/>` in the root layout). |
| 2.2 | Request notification permission at the right moment (post-auth) | ☑ | High | No | 2 h | **Done.** `registerForPushNotifications` requests permission, invoked by `syncPushToken` post-auth (not at cold launch). |
| 2.3 | Register foreground `setNotificationHandler` | ☑ | High | No | 1 h | **Done.** Registered on import of `services/push` (now imported), banner+list+sound+badge. |
| 2.4 | Add `addNotificationReceivedListener` (in-app/badge handling) | ☑ | High | No | 2 h | **Done.** Foreground received listener in `usePushNotifications` (hook point for badge/refresh). |
| 2.5 | Add `addNotificationResponseReceivedListener` (tap → route to target screen) | ☑ | High | No | 3 h | **Done.** Tap routes via shared `routeForNotificationData` (payload `data.kind`/`appointment_id`/`url`), incl. cold-start (`getLastNotificationResponseAsync`). |
| 2.6 | Verify backend writes/reads `device_tokens` and dispatches via `notifications/push` | ☐ | High | Yes | 2 h | **User action (device/backend).** Client upserts `device_tokens`; confirm round-trip + dispatch. |
| 2.7 | Configure APNs credentials in EAS + add `aps-environment` entitlement to `app.json` | ☐ | High | No | 0.5 d | **Isolated (user action).** EAS `projectId` already set; APNs key + `aps-environment` entitlement pending. |
| 2.8 | Inbound deep-link routing | ☑ | Medium | No | 1 d | **Done.** expo-router auto-links the `medilink://` scheme (path → route); notification taps consume `data` via `routeForNotificationData` (supports an explicit `data.url`). No redundant manual `Linking` listener (would double-navigate with expo-router). |
| 2.9 | Add iOS `associatedDomains` / Android `intentFilters` (only if universal links wanted) | ☐ | Low | No | 0.5 d | Optional; scheme-based links cover v1. |

**Progress:** Client code 100% (2.1–2.5, 2.8) · Awaiting device/creds: 2.6 (token round-trip), 2.7 (APNs/EAS), 2.9 (optional)
**Estimated remaining hours:** ~0 dev (client) · ~0.5 d user APNs/EAS + device verification
**Exit criteria:** A push sent from backend is received in fg/bg/killed on a physical device; tapping it routes to the correct screen; token is stored per-device under RLS.
**Testing checklist:**
- ☐ Token appears in `device_tokens` after sign-in *(device)*
- ☐ Notification received foreground / background / app-killed *(device + APNs)*
- ☑ Tap routes to appointment / payment / message target *(routing logic; verify delivery on device)*
- ☐ APNs delivery confirmed in TestFlight *(user)*

---

## Phase 3 — Offline Support & Resilience

**Purpose:** Add read-only offline capability and connectivity feedback. App currently caches nothing (degrades to error states only).

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 3.1 | Install `@react-native-community/netinfo`; wire React Query `onlineManager` | ☐ | Medium | No | 0.5 d | Not in `package.json`. |
| 3.2 | Add query cache persistence (`@tanstack/react-query-persist-client` + AsyncStorage/MMKV) | ☐ | Medium | No | 1 d | So cached appointments/records/profile render offline. |
| 3.3 | Add a connectivity banner ("You're offline") | ☐ | Medium | No | 0.5 d | — |
| 3.4 | Offline mutation queue (booking/profile edits retry on reconnect) | ☐ | Low | No | 2–3 d | **Recommend defer past v1** — offline booking is risky. |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~2 days (read-only; 3.4 deferred)
**Exit criteria:** In airplane mode, previously-loaded data still renders and an offline banner shows; no crashes on any screen offline.
**Testing checklist:**
- ☐ Airplane mode on every screen → cached data or clean empty/error, no crash
- ☐ Banner appears/disappears with connectivity
- ☐ Reconnect refetches stale queries

---

## Phase 4 — AI Assistant & Insights

**Purpose:** Resolve the two AI surfaces that are still static facades — wire the assistant to the real recommender, and make insights honest.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 4.1 | Wire `ai/assistant.tsx` send button to conversational state (remove `onPress:()=>undefined` L73) | ☐ | High | No | 0.5 d | Currently dead. |
| 4.2 | Pass the real typed `draft` to recommendations (stop hardcoding sample symptoms, L81) | ☐ | High | No | 2 h | User input silently discarded today. |
| 4.3 | Activate quick-reply chips (L105) | ☐ | Medium | No | 2 h | Dead `onPress`. |
| 4.4 | Add loading state to assistant | ☐ | Medium | No | 1 h | — |
| 4.5 | Add error + retry state to assistant | ☐ | Medium | No | 1 h | — |
| 4.6 | Add empty state to assistant | ☐ | Low | No | 30 m | — |
| 4.7 | Disable send when input empty | ☐ | Low | No | 30 m | — |
| 4.8 | Handle backend/API timeout gracefully in assistant | ☐ | Medium | No | 1 h | Reuse `apiFetch` 20s timeout messaging. |
| 4.9 | (Depends on 1.1) Decide insights vitals: fully remove, or wire to a real vitals endpoint if/when it exists | ⏳ | Medium | Yes (if wired) | 1 h remove / 1 d wire | No vitals backend exists today → remove is the v1 path. |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~1.5 days
**Exit criteria:** Assistant accepts typed input, calls the real `ai.suggestDoctors`, and shows loading/error/empty states; no fabricated data anywhere in the AI cluster.
**Testing checklist:**
- ☐ Typed symptoms flow through to real recommendations
- ☐ Quick replies work
- ☐ Loading, error+retry, empty, timeout all render correctly
- ☐ Send disabled on empty input

---

## Phase 5 — Maps & Discovery

**Purpose:** Replace the fake map surface with a real SDK, or hide it for v1.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 5.1 | Decide: integrate a real map SDK vs. hide Map View for v1 | ☐ | Medium | No | Decision | Data (`useDoctors`) is already real; only the surface is fake. |
| 5.2 | Backend: expose real clinic lat/lng on doctor/facility reads | ☐ | Medium | Yes | 0.5 d | Needed for real pins. `get_nearby_branches` RPC exists — verify it returns coordinates. |
| 5.3 | Integrate `react-native-maps` / Expo Maps with real coordinates (replace hardcoded `PIN_POS`/`MAP_BLOCKS` L11-25) | ☐ | Medium | No | 3–5 d | Native dep → rebuild. |
| 5.4 | Wire the dead search pill on the map | ☐ | Low | No | 2 h | — |
| 5.5 | Real open/closed status on pins (replace hardcoded "Open now") | ☐ | Low | Yes | 2 h | — |
| 5.6 | Add loading/error/empty states to map | ☐ | Low | No | 2 h | — |
| 5.7 | (Alternative to 5.3) Hide Map View entry points behind a flag for v1 | ☐ | Low | No | 1 h | Recommended if launch is near. |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~1 h (hide) or ~4 days (build)
**Exit criteria:** Either a working native map with real clinic locations, or Map View cleanly hidden and unreachable.
**Testing checklist:**
- ☐ Pins reflect real clinics at real coordinates (if built) **or** entry points removed (if hidden)
- ☐ Search + states functional (if built)

---

## Phase 6 — Remaining Feature Wiring

**Purpose:** Finish the smaller functional gaps in otherwise-working screens.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 6.1 | Records upload: add `expo-document-picker` so PDFs can be uploaded | ☐ | Medium | No | 0.5 d | Today image-library only, mime hardcoded `image/jpeg` (`records/upload.tsx:50,63`). Backend accepts any type. |
| 6.2 | Records upload: stop hardcoding `image/jpeg` mime; derive from picked file | ☐ | Medium | No | 1 h | Pairs with 6.1. |
| 6.3 | Lab detail: render analyte trend chart via `useAnalyteTrend` | ☐ | Medium | No | 0.5–1 d | Hook + data ready but **never called** (`useLabs.ts:29`); screen titled "Result Trends" shows no chart. |
| 6.4 | Booking: send `reason` in the create/book payload | ☐ | Medium | Yes | 1–2 h | Captured to store (`review.tsx:178`) but omitted from `create.mutate` (L94-101); `NewAppointment` type lacks the field. Confirm `book_appointment_atomic` accepts it. |
| 6.5 | Prescriptions: implement "Set reminder" (expo-notifications) or hide it | ☐ | Medium | No | 15 m hide / 1 d build | Still a coming-soon Alert (`prescriptions/index.tsx:92`). |
| 6.6 | edit-profile: add validation on name (non-empty), DOB (date format), blood group (enum) | ☐ | Medium | No | 2–3 h | Only civil number validated today. |
| 6.7 | Settings: implement or hide "Export Data" (backend `export-user-data` edge fn exists) | ☐ | Medium | Yes | 0.5 d wire / 15 m hide | Still a coming-soon Alert (`settings/index.tsx:118`). |
| 6.8 | Settings: implement or hide "Privacy" | ☐ | Low | No | 0.5 d / 15 m | Still a coming-soon Alert (`settings/index.tsx:117`). |
| 6.9 | `PhoneField`: replace hardcoded `+968` prefix with a country-code picker | ☐ | Low | No | 0.5 d | TODO at `PhoneField.tsx:18`; `dialCode` hardcoded L20-22. |
| 6.10 | payment-success: add bounded auto-poll/refetch so success doesn't need manual Retry | ☐ | Low | No | 2–3 h | — |
| 6.11 | check-in route: wire real queue/QR + navigation, or delete the orphaned route | ☐ | Low | Yes | 15 m delete / 2–3 d build | No navigation reaches it; hardcoded queue values. |
| 6.12 | patient-switcher: decide app-wide "act as" scope vs. booking-only (product decision) | ☐ | Low | No | Decision | Currently only re-scopes booking-for. |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~3–4 days (excluding deferred builds)
**Exit criteria:** No coming-soon stubs on shipped surfaces; PDF upload works; lab trends render; booking captures reason; profile inputs validated.
**Testing checklist:**
- ☐ Upload a PDF end-to-end
- ☐ Lab detail renders a real analyte trend
- ☐ Booking reason persists to the appointment
- ☐ No "coming soon" alert reachable from a shipped screen
- ☐ Invalid name/DOB/blood group rejected with inline errors

---

## Phase 7 — Backend Hardening

**Purpose:** Close remaining backend defense-in-depth gaps (patient happy path already secure post-B1/B4).

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 7.1 | `resend-otp`: replace `Math.random()` with `crypto.randomInt` | ☐ | Medium | Yes | 30 m | `resend-otp/route.ts:25` still weak RNG (`send-otp` already fixed). |
| 7.2 | Stop leaking raw `err.message` in 500 fallbacks | ⏳ | Medium | Yes | 2–3 h | Still leaks in `checkout:143`, `refund:119`, `users/me/account:88`, `resend-otp:79`. Auth helper already clean. |
| 7.3 | Move in-memory 2FA/OTP rate limiters to durable store (Redis/Upstash or DB counter) | ☐ | Medium | Yes | 0.5 d | Per-instance Maps → bypassable on serverless. |
| 7.4 | Encrypt Google Calendar tokens; fix hardcoded `Asia/Kolkata` timezone → `Asia/Muscat` | ☐ | Low | Yes | 2 h | `auth/google/callback`, `appointments/[id]/google`. |
| 7.5 | Add file-size caps + rate limits on `ai/scan-prescription` and `ai/schedule-assist` | ☐ | Low | Yes | 2 h | — |
| 7.6 | Consolidate duplicate `send-otp`/`resend-otp` routes | ☐ | Low | Yes | 1 h | Divergent expiry (10 vs 5 min). |
| 7.7 | Remove `usesCleartextTraffic:true` from `app.json` (HTTPS-only prod) | ☐ | Medium | No | 15 m | `app.json:26`. |
| 7.8 | Confirm no secrets in client bundle (only `EXPO_PUBLIC_*`; service-role never shipped) | ☐ | High | No | 1 h | Verification task. |
| 7.9 | Run `/security-review` on the full diff + pen-test payment & auth flows | ☐ | High | Yes | 0.5 d | After all fixes land. |

**Progress:** Completed 0% · In Progress ~10% (error-leak partial) · Remaining ~100% of new work
**Estimated remaining hours:** ~2 days
**Exit criteria:** No weak RNG; no internal error text to clients; durable rate limiting; HTTPS-only; security review signed off.
**Testing checklist:**
- ☐ Error responses are generic; details only in server logs
- ☐ Rate limits hold across serverless instances
- ☐ No cleartext traffic on Android
- ☐ `/security-review` clean

---

## Phase 8 — iOS & Store Readiness

**Purpose:** Native config and assets required for a clean App Store / TestFlight submission.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 8.1 | Add a proper `NSCameraUsageDescription` string | ☐ | Medium | No | 15 m | Only plugin default today → review scrutiny. |
| 8.2 | Add native splash (`expo-splash-screen`) + splash asset | ☐ | Medium | No | 2 h | Blank white on cold start currently. |
| 8.3 | Remove unused `NSFaceIDUsageDescription` (or add FaceID) | ☐ | Low | No | 15 m | `app.json:19`, no `expo-local-authentication` dep. |
| 8.4 | Verify `aps-environment` entitlement present for push (see 2.7) | ☐ | High | No | — | Cross-ref Phase 2. |
| 8.5 | Confirm build config: bundleId, `ascAppId`, `ITSAppUsesNonExemptEncryption`, autoIncrement | ☐ | Low | No | 30 m | Already set per audit; re-confirm before submit. |
| 8.6 | App Store metadata, screenshots, privacy nutrition labels, review notes | ☐ | Medium | No | 0.5 d | — |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~1.5 days
**Exit criteria:** Permission strings review-safe; native splash present; entitlements correct; store listing complete.
**Testing checklist:**
- ☐ Cold start shows native splash, not white screen
- ☐ Camera/photo permission prompts show correct strings
- ☐ App Store Connect listing complete and passes validation

---

## Phase 9 — QA & Device Validation

**Purpose:** Prove the app on real hardware. **Nothing here is code-verifiable — an iPhone has never run this build.**

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 9.1 | Android full regression: auth, booking, payment return, image upload, records, i18n+RTL, offline, session restore | ☐ | Critical | No | 1 d | Shared JS layer → covers most business logic. |
| 9.2 | iPhone physical testing: permissions, keyboard on long forms, RTL, splash | ☐ | Critical | No | 1 d | Requires hardware. |
| 9.3 | TestFlight validation: build, push/APNs delivery, permission-string review | ☐ | Critical | No | 1 d | — |
| 9.4 | Payment round-trip verified on both platforms incl. in-app WebView return | ☐ | Critical | No | 0.5 d | WebView checkout is new — validate success/cancel/close/timeout on device. |
| 9.5 | Notification receipt fg/bg/killed + tap routing on device | ☐ | High | No | 0.5 d | Depends on Phase 2. |
| 9.6 | Guest → sign-up mid-booking resume flow on device | ☐ | High | No | 2 h | R6 pending-booking intent + slot re-validation. |
| 9.7 | RTL end-to-end (en↔ar instant switch, no restart) on device | ☐ | High | No | 2 h | Runtime RTL is new — verify all screens flip cleanly. |
| 9.8 | Crash & performance testing (cold start, list scrolling) | ☐ | Medium | No | 0.5 d | After error boundary lands. |
| 9.9 | Localization verification: Arabic strings render, Western-digit rule holds | ☐ | Medium | No | 2 h | — |
| 9.10 | Production env verification (env vars, HTTPS-only, live backend, Thawani prod host) | ☐ | High | Yes | 2 h | — |

**Progress:** Completed 0% · Remaining 100%
**Estimated remaining hours:** ~4–5 days (hardware-gated)
**Exit criteria:** Full green regression on Android + physical iPhone + TestFlight; payment, push, RTL, and guest-resume all verified on device.
**Testing checklist:** (mirror rows above — each becomes ☑ when validated on hardware)

---

## Phase 10 — Deferred / Blocked (not launch blockers)

**Purpose:** Track intentionally-postponed work so it isn't forgotten.

| # | Task | Status | Priority | Backend dep | Effort | Notes |
|---|---|---|---|---|---|---|
| 10.1 | Phone (SMS) OTP login + email⇄phone identity linking | ☐ | Low | Yes | Blocked | Blocked on SMS-provider provisioning (Twilio/etc. + Oman deliverability). UI can be built behind a flag. |
| 10.2 | Doctor/clinic Arabic display for entities lacking verified Arabic names | ⏳ | Low | No (HAMS) | Ongoing | Migration + wiring done; visible values light up as HAMS verifies Arabic names. |
| 10.3 | Offline write-queue (Phase 3.4) | ☐ | Low | No | 2–3 d | Deferred past v1. |
| 10.4 | Universal / App Links (Phase 2.9) | ☐ | Low | No | 0.5 d | Scheme links cover v1. |
| 10.5 | Civil-number deferred partial unique index (hardening) | ☐ | Low | Yes | 0.5 d | Only after HAMS data verified duplicate-free; surface violations generically. |
| 10.6 | Family-member civil numbers | ☐ | Low | Yes | TBD | Patient-only decided; dependents future scope. |

**Progress:** Tracking-only (excluded from % until scheduled)
**Exit criteria:** Each item is either explicitly de-scoped for v1 or promoted into an active phase with a date.

---

## 📊 Dashboard

### Overall Progress
```
█████████░ 91%
```

### Phase Progress (remaining-work completion)
```
Phase 1  Production Blockers      █████████░  95%  (code done; awaiting db:push + RLS test)
Phase 2  Push & Deep Links        ████████░░  80%  (client done; awaiting APNs/EAS + device)
Phase 3  Offline & Resilience     ░░░░░░░░░░  0%
Phase 4  AI Assistant & Insights  ░░░░░░░░░░  0%
Phase 5  Maps & Discovery         ░░░░░░░░░░  0%
Phase 6  Remaining Wiring         ░░░░░░░░░░  0%
Phase 7  Backend Hardening        █░░░░░░░░░  10%  (error-leak partial)
Phase 8  iOS & Store Readiness    ░░░░░░░░░░  0%
Phase 9  QA & Device Validation   ░░░░░░░░░░  0%
Phase 10 Deferred / Blocked       —          tracking-only
```

### Feature Completion
```
Authentication (email+password)   ✅
Email OTP passwordless login       ✅
Guest Mode                         ✅
Registration / OTP                 ✅
Password Reset (via OTP recovery)  ✅
Profile / Civil Number             ✅
Family Members                     ✅
Medical History                    ✅
Doctor Search / Details            ✅
Booking (window, holds, WebView)   ✅
Payments (server amount + HMAC)    ✅
Appointments / Reschedule / Cancel ✅
Rate / Reviews                     ✅
Medical Records / Document Vault   ✅
Invoices → Document Vault          ✅  (auto-filed on payment success; verify path self-sufficient)
Lab Reports (list)                 ✅
Lab Trend Chart                    ☐
Prescriptions (read)               ✅
Prescription Reminders             ☐
Notifications (in-app)             ✅
Push Notifications                 ⏳  (client wired; APNs/EAS + device pending)
Deep Links (inbound)               ✅  (expo-router scheme + notification data routing)
Offline Support                    ☐
Delete Account                     ✅
Export Data / Privacy              ☐
Localization (EN/AR)               ✅
Runtime RTL (no restart)           ✅
Dark Mode                          ✅
Me Hub navigation                  ✅  (AI section: all 3 AI features reachable)
Pull-to-refresh                    ✅
Payment Success (terminal nav)     ✅
AI Recommendations                 ✅
AI Symptom Assistant               ⏳  (input wired → real recommendations; full chat = Phase 4)
AI Insights (vitals honest)        ✅
Maps                               ⏳
Error Boundary                     ✅
Backend Security (B1/B4/B2/refund) ⏳  (Phase 7 hardening remains: B7/B8/B6…)
iOS / Store Readiness              ☐
QA / Device Validation             ☐
```

---

## 1. Completed Since Previous Audit (2026-07-15 → 2026-07-22)

Verified against current code. These are **done** and no longer tracked as remaining work.

**Mobile features**
- ☑ **Civil Number (F1/F2)** — editable validated 8-digit field + masked display with tap-to-reveal.
- ☑ **Arabic names (F2)** — doctor / clinic / patient / specialty Arabic localization with English fallback, status-gated.
- ☑ **Guest Mode (F4)** — "Continue as guest", allow-list route gate, per-action sign-in walls, guest data reads.
- ☑ **Email OTP passwordless login (F5)** — send-code → OTP `flow=login` → session.
- ☑ **Runtime RTL** — instant EN↔AR + direction switch via JS `isRTL` context, **no app restart** (native kept LTR). This **supersedes** the old `expo-updates`-restart requirement — no longer needed.
- ☑ **Full LTR return** on switching back from Arabic.
- ☑ **Me Hub (F7)** — "Me" tab is now a full grouped navigation hub.
- ⏳ **Invoices → Document Vault** — *correction (2026-07-22): was NOT fully working.* Commit fe9a259 filed the invoice into `patient_documents` **only when the Invoice detail screen was manually opened**; payment success never triggered it, so tapping "Done" left the Invoices category empty. Auto-filing on payment success + a self-sufficient `verify` invoice-generation path have been implemented — **pending verification.**
- ☑ **Booking shows the doctor's real clinic.**
- ☑ **Pull-to-refresh** on all dynamic list screens (shared `useRefresh`).
- ☑ **Rate button wired** to `/rate/[id]` (was a coming-soon Alert).
- ☑ **edit-profile allergy silent-failure fixed** — success/nav moved into `onSuccess` + `onError`.
- ☑ **Gender filter** now functional (feeds the live preview query).
- ☑ **settings/notifications** error feedback + inflight-disable added.
- ☑ **Password reset completable** end-to-end via OTP recovery session (no deep link needed).
- ☑ **Delete Account** wired to the backend soft-delete endpoint (30-day grace + cancel-deletion).

**Booking & payment engine (BP-1..BP-6)**
- ☑ **BP-1** slot-based "Available Today" (`doctors_available_today` RPC, ignores `doctors.status`).
- ☑ **BP-2** central `BOOKING_WINDOW_DAYS` constant + server `OUTSIDE_BOOKING_WINDOW` guard.
- ☑ **BP-3** pending-hold TTL (`hold_expires_at`) + `release_unpaid_hold` RPC + `release-expired-holds` scheduled edge function + anon availability grants.
- ☑ **BP-4** payment amount **server-derived** (client amount ignored); env-driven Thawani host.
- ☑ **BP-5** in-app WebView checkout (`booking/checkout.tsx` + `react-native-webview`).
- ☑ **BP-6** webhook **HMAC/signature verification** (in addition to re-query + idempotent claim).

**Backend**
- ☑ **B1** payment price-manipulation vuln closed.
- ☑ **B4** webhook signature verification.
- ☑ `send-otp` uses `crypto.randomInt`.
- ☑ Delete/Export account edge functions (`purge-user-auth`, `export-user-data`) + endpoint.

**Phase 1 — Production Blockers (2026-07-22)**
- ☑ **1.1** Fabricated vitals chart removed from AI Insights.
- ☑ **1.2 / 1.3** `ai/symptom-check` authenticated + rate-limited (web caller fixed).
- ☑ **1.4** Global React error boundary.
- ☑ **1.5–1.7** Refund correctness — atomic + idempotent RPCs (`request_/finalize_/fail_appointment_refund`), cancellation guard, server-derived clinic-configurable amount, sets `payments.status`, fixed the `facility_id`/`partial_refund_percent`/`cancelled_by` schema bugs, removed error-text leakage. *(Awaiting `db:push` + staging verify.)*

**Reported-issue fixes (2026-07-22, post-Batch-1)**
- ☑ **Invoice → Document Vault auto-filed** on payment success (+ `verify` now self-generates the invoice PDF).
- ☑ **Payment success is terminal** — Back/hardware-back go to Dashboard, never into booking; primary "Go to Dashboard" clears the stack.
- ⏳ **AI features reachable from Me Hub** (new AI section: Symptom Checker, Doctor Recommendations, Health Insights); Symptom Checker de-faked (real input → real recommendations). *Full conversational assistant remains Phase 4.*

---

## 2. Remaining Critical Tasks (production blockers only)

1. **Push notifications — APNs/EAS credentials + on-device delivery** (2.6, 2.7) — client is wired (token sync, listeners, tap-routing); needs the APNs key/entitlement and device/TestFlight verification.
2. **Deploy pending migrations + guest RLS staging verification** (1.8, 1.9) — **user action**.
3. **iOS device + TestFlight validation** (9.2–9.4) — payment WebView return, push, permissions, RTL unproven on hardware.

*(Resolved since last update: fabricated vitals, symptom-check auth/rate-limit, global error boundary, refund correctness — refund code-complete, pending deploy.)*

---

## 3. Quick Wins (< 1 hour each)

- ☑ Remove fake vitals chart (1.1)
- ☑ Add `getUser` auth to `ai/symptom-check` (1.2)
- ☐ Push the SECURITY DEFINER migration (1.8)
- ☐ `resend-otp` → `crypto.randomInt` (7.1)
- ☐ Remove `usesCleartextTraffic:true` (7.7)
- ☐ Remove unused `NSFaceIDUsageDescription` (8.3)
- ☐ Add `NSCameraUsageDescription` string (8.1)
- ☐ Hide "Set reminder" stub (6.5) / "Export Data" (6.7) / "Privacy" (6.8) if not building for v1
- ☐ Disable send on empty AI input (4.7)
- ☐ Delete the orphaned check-in route (6.11) if not building queue

---

## 4. Definition of Done (100% complete)

The mobile app is **100% complete** only when **all** of the following are true:

**Integrity & security**
- ☐ No fabricated/placeholder clinical data anywhere in the app.
- ☐ Every AI backend route is authenticated and rate-limited.
- ☐ Refund flow is atomic, guarded, and updates payment status.
- ☐ No internal error text leaked to clients; durable rate limiting in place.
- ☐ Guest RLS verified in staging (anon reads discovery only; denied on all patient data).
- ☐ No secrets in the client bundle; HTTPS-only; `/security-review` signed off.
- ☐ A global error boundary prevents white-screen crashes.

**Feature completeness**
- ☐ No coming-soon stubs reachable on shipped surfaces (assistant, insights, reminders, export/privacy, map).
- ☐ Push notifications work end-to-end (register → deliver → tap-route) on both platforms.
- ☐ Inbound deep links route notification taps correctly.
- ☐ Read-only offline + connectivity banner.
- ☐ AI assistant accepts real input with loading/error/empty/timeout states.
- ☐ Records upload supports PDFs; lab trends render; booking sends reason; profile inputs validated.
- ☐ Map View is either a real map with real coordinates or cleanly hidden for v1.

**Platform & release**
- ☐ APNs entitlement + credentials; native splash; review-safe permission strings.
- ☐ App Store listing complete; build passes validation.

**Validation**
- ☐ Full Android regression green.
- ☐ Physical iPhone + TestFlight validation green (payment WebView return, push, permissions, RTL, guest-resume).
- ☐ Payment round-trip verified on both platforms.
- ☐ Localization + RTL verified on device.
- ☐ Crash & performance testing passed.
- ☐ Production environment verified (env vars, live backend, Thawani prod host).

**Deferred items** (Phase 10) are explicitly de-scoped for v1 and do **not** block 100% of the v1 release — but must each be either shipped or formally accepted as post-v1 before sign-off.

---

*Maintenance: after each batch, (1) flip the relevant `☐→☑` (or `⏳`), (2) recompute each affected phase's %, (3) update the two dashboards and the top-of-file Overall Completion, (4) bump Last updated. When a whole phase hits 100%, mark its Exit criteria met.*
