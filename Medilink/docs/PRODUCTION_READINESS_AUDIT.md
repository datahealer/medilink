# MediLink — Production-Readiness Engineering Audit

**Date:** 2026-07-15
**Type:** Read-only audit — no code modified.
**Scope:** entire `Medilink/` monorepo (mobile, web/frontend, backend, supabase, shared).
**Method:** every finding is backed by code that was actually read; file paths + line numbers are cited throughout. Mobile data wiring was verified against `mobile/src/data/index.ts` (the authoritative source of what is real backend vs mock), not against older docs.

> **Note on stale docs:** `CLAUDE.md` describes the web frontend as "mostly scaffolding, no feature routes yet." This is false — the web app is ~85% built (see Part 6). It also references older mobile mock/real hints that `mobile/src/data/index.ts` now supersedes. Trust the code, not the prose.

---

## Executive Verdict

The app is genuinely far along — the patient happy path (sign-up → sign-in → search → book → pay → view records) is wired to a real backend on both mobile and web, and the architecture is sound. **It is not safe to release today.**

The blockers are few but severe:

1. **Critical money vulnerability** — the payment amount is trusted from the client (price manipulation).
2. **Push notifications are dead code** — the registration module is never imported.
3. **Deep links are unwired** — which also breaks password-reset completion and the payment return trip.
4. **No iOS device has ever run this build** — payment return, push, and permissions are unproven on hardware.
5. **A health app is displaying fabricated vital signs** as if they were the patient's own data (web dashboard + mobile insights).

The project is ~80% complete. The gap to release is *criticality*, not *volume* — a handful of targeted fixes plus real device testing.

---

## Table of Contents

1. [Part 1 — Mobile Completeness](#part-1--mobile-completeness)
2. [Part 2 — Feature Audit](#part-2--feature-audit)
3. [Part 3 — iOS Readiness](#part-3--ios-readiness)
4. [Part 4 — Android Readiness](#part-4--android-readiness)
5. [Part 5 — Backend Audit](#part-5--backend-audit)
6. [Part 6 — Web Audit](#part-6--web-audit)
7. [Part 7 — Release Blockers](#part-7--release-blockers)
8. [Part 8 — Release Percentage](#part-8--release-percentage)
9. [Part 9 — Production Checklist](#part-9--production-checklist)
10. [Part 10 — Next Actions](#part-10--next-actions)

---

## PART 1 — MOBILE COMPLETENESS

Data wiring verified against `mobile/src/data/index.ts`. In hybrid/production mode the only truly mock repository method is `doctor.mapClinics` (cosmetic, used only by booking/schedule); the AI symptom-checker transcript and AI insights vitals chart are static placeholders, not repo-wired.

**Corrections to older docs discovered during audit:**
- `doctor.reviews` **is REAL** (`index.ts:44`).
- `discovery.listSpecialties` **is REAL** (`index.ts:48`).
- `search/map.tsx` does **not** use `doctor.mapClinics` — it uses real `doctor.search` and slices 3 results; its real problem is the absence of a native map SDK.
- The `comingSoonTitle/comingSoonBody` i18n strings for the search/records tabs (`en.ts:467-468, 550-551`) are **dead/unused** — both tabs render real data.

### Screen-by-screen table

| Screen (file) | Implemented | Backend Connected | Fully Functional | Prod Ready | Missing Work | Priority |
|---|---|---|---|---|---|---|
| (tabs)/dashboard.tsx | Yes | Real (patient, appointment, discovery ×3) | Partial | No | "Customize" coming-soon Alert (L156); specialties hardcoded to 3 IDs (L177); no error/empty for recents (L197) & featured clinics (L218); clinic card deep-links to /search not clinic (L224) | Medium |
| (tabs)/search.tsx | Yes | Real (doctor.search, L23) | Yes | Yes | Static "Sort: rating" label non-interactive (L100) | Low |
| (tabs)/me.tsx | Yes | Real (family.list, patient) | Yes | Yes | Empty state uses plain Text vs EmptyState (cosmetic, L115) | Low |
| (tabs)/records.tsx | Yes | Real (document.list, L42) | Partial | No | Decorative non-functional search field (L114-125); imaging/Vaccinations map to `other` enum, no dedicated dest (L15-21) | Medium |
| (tabs)/profile.tsx | Yes | Real (patient, medicalHistory, family) | Yes | Yes | Med-history load error shows "None recorded" not error (L138-152, minor) | Low |
| **ai/assistant.tsx** | UI only | **None — fully static** | **No** | **No** | Input/send button dead (`onPress:()=>undefined` L73); quick-replies dead (L105); discards typed text, hardcodes sample symptoms to recommendations (L81); transcript static (L93-95) | **Critical** |
| ai/insights.tsx | Partial | Split: chart static (L15-23), summary real (`ai.latestVisitSummary` L31) | Partial | No (chart) | Hardcoded vitals chart presents fabricated clinical trend (L15-23, 33); always-positive "progress" note (L100); no states on chart | High |
| ai/recommendations.tsx | Yes | Real (`ai.suggestDoctors` L24) | Yes | Yes | Empty-results reuses wrong copy `loadError` (L66); depends on caller passing symptoms (upstream defect in assistant) | Low |
| appointments/index.tsx | Yes | Real (appointment.list, checkIn) | Yes | Yes | Hero "Check in" doesn't open QR pass screen (L154, minor) | Low |
| appointments/[id]/index.tsx | Yes | Real (get, cancel, checkIn) | Partial | No | **Rate button fires "coming soon" Alert (L155) instead of `/rate/${id}` — dead-ends a finished, backend-wired feature** | High |
| appointments/[id]/check-in.tsx | Yes | Partial (get real; queue hardcoded) | **No — orphaned route** | No | No navigation reaches it (grep-confirmed); hardcoded queue A-07/A-04 (L70-71); non-scannable QR (L12-13); no error state (L77-79) | Medium |
| appointments/[id]/reschedule.tsx | Yes | Real (getSlots, reschedule) | Yes | Yes | UTC day-key vs local label can drift 1 day at TZ boundaries (L57) | Low |
| appointments/refund-policy.tsx | Yes | N/A (static/param-driven) | Yes | Yes | None | Low |
| booking/[doctorId]/schedule.tsx | Yes | Real (doctor.get, getSlots); mapClinics MOCK but cosmetic (L42) | Yes | Yes | No loading/error state for clinics list (L64) | Low |
| booking/[doctorId]/review.tsx | Yes | Real (appointment.create) | Partial | Yes | **`reason` field captured but never sent to create() (L90-97, 172)** — patient input silently dropped | Medium |
| booking/payment.tsx | Yes | Real (payment.createCheckout) | Partial | Partial | External-browser checkout, no return deep-link (L56-62); client-derived `amount` sent (L53); no server fallback if bookingStore empty (L34-37) | High |
| booking/payment-success.tsx | Yes | Real (payment.verify, getByAppointment) | Yes | Yes | No auto-poll despite docstring; one-shot verify + manual Retry (L38-60) | Medium |
| booking/success.tsx | Yes | Local (bookingStore) — mock-mode only | Yes (mock scope) | N/A (dev/mock) | "Add to Calendar" coming-soon Alert (L41); "Paid" row fictional in mock (L38) | Low |
| doctors/[id]/index.tsx | Yes | Real (doctor.get, favourite toggle) | Yes | Yes | No failure feedback on favourite toggle (silent); selected slot not passed to booking (L25,120) | Low |
| doctors/[id]/reviews.tsx | Yes | Real (doctor.reviews) | Yes | Yes | Reviewer names always generic (real repo sets author:""); no pagination | Low |
| search/filters.tsx | Yes | Real (doctor.search preview, specialties) | Partial | Partial | **Gender filter is a silent no-op in real mode (real/index.ts:599) yet counts toward badge**; no loading/error for chips (L63) | High |
| search/map.tsx | **Placeholder** | Pins real (doctor.search L30); NOT mapClinics | **No — fake map** | No | No native maps SDK; 3 hardcoded pin positions (L12-16); dead search pill (L42-45); hardcoded "Open now" (L101); no error/empty state | High |
| search/specialties.tsx | Yes | Real (discovery.listSpecialties) | Yes | Partial | No error/empty state (L57-67); search matches raw name not localized label (L27 vs L63) | Medium |
| edit-profile.tsx | Yes | Real (patient, medicalHistory) | Partial | No | **Allergy save via `onSettled` reports "Saved" even on failure (L130-132)**; allergies seeded from possibly-unloaded query → can wipe data (L59,62); zero validation on name/blood-group/DOB (L113-140) | High |
| family/[id].tsx | Yes | Real (family.update/remove) | Yes | Yes | DOB free-text no validation (L154) | Low |
| family/add.tsx | Yes | Real (family.add) | Yes | Yes | 5-member cap client-only (L28,44); DOB no validation; photo placeholder non-functional (L77-85) | Low-Med |
| medical-history.tsx | Yes | Real (medicalHistory get/upsert) | Yes | Yes | None material | Low |
| notifications/index.tsx | Yes | Real (list, markAllRead) | Yes | Yes | No error feedback if mark-all fails (L54-57); per-item deep-link deferred (L32-35) | Low |
| notifications/messages.tsx | Yes | Real (facilityMessages, markRead) | Yes | Yes | None material | Low |
| patient-switcher.tsx | Yes | Reads real; switch client-only (by design) | Partial | Partial | Active patient only affects booking-for (review.tsx:55), not records/labs/rx/payments views | Medium |
| payments/index.tsx | Yes | Real (payment.list) | Yes | Yes | None material | Low |
| payments/invoice/[id].tsx | Yes | Real (payment.get, real invoiceUrl) | Yes | Yes | Share failure silently swallowed (L68) | Low |
| rate/[appointmentId].tsx | Yes | Real (review.submit, appointment.get) | Partial | No | **No loading/error/empty for useAppointment → silent dead-end if appt fails (L39-40,72)**; "anonymous" checkbox presentational only (L142); aspects sent as translated strings (L61) | Medium |
| rate/success.tsx | Yes | N/A (params) | Yes | Yes | "Rate Clinic" button just does router.back() — misleading (L22) | Low |
| records/document/[id].tsx | Yes | Real (document get/signedUrl/delete) | Yes | Yes | "Download" opens browser, doesn't save to device (L40,109); get() refetches whole list (L816) | Low |
| records/labs/index.tsx | Yes | Real (lab.list) | Yes | Yes | Per-tab empty copy generic | Low |
| records/labs/[id].tsx | Partial | Real (get/signedUrl/markViewed); trend real but **unused** | Partial | No | **Screen titled "Result Trends" has no chart; `useAnalyteTrend` never called** (data layer ready) | Med-High |
| records/prescriptions/index.tsx | Yes | Real (list, shareLink) | Partial | Partial | "Set reminder" coming-soon Alert (L84, en.ts:663) | Medium |
| records/prescriptions/[id].tsx | Yes | Real (get, pdfUrl, shareLink) | Yes | Yes | "Send to pharmacy" = generic share link (matches backend) | Low |
| records/upload.tsx | Yes | Real (document.upload) | Partial | Partial | **"Upload File" opens image library only — cannot pick PDFs; no expo-document-picker (L60-64), mime hardcoded image/jpeg (L50)** | Med-High |
| settings/index.tsx | Yes | Partial (patient, signOut real) | No | No | **Privacy (L93), Export Data (L94), Delete Account (L105) all coming-soon stubs**; no profile loading/error (L76-78); sign-out navigates even on error (L38) | High |
| settings/appearance.tsx | Yes | Local (theme/locale) | Yes | Yes | RTL restart is info-only alert, no restart action (L32) | Low |
| settings/notifications.tsx | Yes | Real (getPreferences, updatePreferences) | Yes | Partial | No mutation error feedback (L61,79); update.isPending unused → toggle race | Medium |
| auth/sign-in.tsx | Yes | Real (auth.signIn) | Yes | Yes | Google disabled by design (L178,67-70); Apple hard-disabled (L194) | Low |
| auth/sign-up.tsx | Yes | Real (authService.signUp backend REST) | Yes | Yes | Bypasses repositories layer, imports authService directly (L20, inconsistent) | Low |
| auth/otp.tsx | Yes | Real (verifyOtp/sendOtp backend) | Yes | Yes | No auto-submit on 6th digit (L83, cosmetic) | Low |
| auth/forgot-password.tsx | Yes | Real email send only (L37) | **No — completion blocked** | Partial | No deep-link recovery-session handler; reset cannot complete end-to-end | High |
| auth/reset-password.tsx | Yes (UI) | Wired but unreachable (L40) | **No — cannot complete** | No | No deep-link → recovery session; no route reaches it from email | High |
| index.tsx | Yes | N/A | Yes | Yes | Pure redirect to /splash (L5) | N/A |
| splash.tsx | Yes | Indirect (auth restore) | Yes | Yes | No hydration-timeout fallback → could hang if a store never hydrates (L43-53) | Low |
| welcome.tsx | Yes | N/A (static) | Yes | Yes | None | N/A |
| onboarding.tsx | Yes | Local (onboardingStore) | Yes | Yes | Lavender-circle illustration placeholders, not final art (L77-79) | Low |
| language.tsx | Yes | Local (locale) | Partial | Partial | "Restart now" doesn't actually reload — same as "later"; Arabic RTL stays stale (L29-30) | Medium |

### Completed — production-ready as-is

search, me, profile, ai/recommendations, appointments/index, appointments/[id]/reschedule, appointments/refund-policy, booking/schedule, booking/payment-success, doctors/[id]/index, doctors/[id]/reviews, family/[id], family/add, medical-history, notifications/index, notifications/messages, payments/index, payments/invoice/[id], rate/success, records/document/[id], records/labs/index, records/prescriptions/[id], auth/sign-in, auth/sign-up, auth/otp, index, splash, welcome, onboarding. **(~28 screens)**

### Partially complete — implemented + real backend but with functional gaps

dashboard, records tab, ai/insights, appointments/[id]/index, check-in, booking/review, booking/payment, search/filters, search/specialties, edit-profile, patient-switcher, rate/[appointmentId], records/labs/[id], records/prescriptions/index, records/upload, settings/index, settings/notifications, language. **(~18 screens)**

### Not started / fundamentally non-functional

- **ai/assistant.tsx** — a static facade; input, send, and quick-replies are all dead; discards user input.
- **search/map.tsx** — no real map; hand-drawn placeholder surface with 3 fixed pins and a dead search pill.
- **auth/forgot-password + auth/reset-password (end-to-end flow)** — email send works, but password reset cannot complete (no deep-link recovery session). Documented, not a regression.

### Incomplete screens — detail, backend status, effort

**Critical**
- **ai/assistant.tsx** — Backend `ai.suggestDoctors` is real. Mobile work: wire input/send to conversational state, pass the real typed draft (not `t("aiAssistant.sampleUser")`, L81) to recommendations, activate quick-replies, add loading/error, disable send when empty. **Est. 1-2 days** (more if a true multi-turn chat endpoint is expected — that backend does not exist).

**High**
- **appointments/[id]/index.tsx (L155)** — Backend + target screen both exist and are wired. Mobile: replace the coming-soon Alert with `router.push(\`/rate/${id}\`)`. **Est. 15 min** (highest ROI fix in the audit).
- **auth/forgot-password + reset-password** — Email backend real; completion needs a deep-link handler that establishes a Supabase recovery session then routes into reset-password. Mobile + link config. **Est. 1-2 days.**
- **settings/index.tsx (L93/94/105)** — Delete Account, Export Data, Privacy are stubs. Delete/Export backend endpoints do not exist for mobile. Backend + mobile. **Est. 3-5 days**; Delete Account is the priority and most dangerous (a destructive-styled button that does nothing).
- **ai/insights.tsx (L15-23)** — Visit-summary card is real; vitals chart is fabricated data. No vitals/trend backend exists. Either build a vitals endpoint + wire chart, or clearly label/remove. **Chart wiring 1 day once backend exists; remove/label 1 hr.**
- **search/filters.tsx (gender)** — Gender filter is a silent no-op (real/index.ts:599, no column). Remove control (**30 min**) or add server-side gender filtering (**0.5-1 day**, needs DB column). Add chip loading/error (~2 hrs).
- **search/map.tsx** — Substantial: integrate react-native-maps/Expo Maps, real doctor coordinates (backend must expose lat/lng), wire search pill, real open/closed status, states. **Est. 3-5 days**; or hide (~1 hr).
- **edit-profile.tsx (L130,59,113-140)** — Backend real. Move "saved"/back into allergy upsert `onSuccess` and surface its error; gate on `history.isLoading`; add validation. **Est. 0.5 day.** Data-loss risk — prioritize.

**Medium-High**
- **records/labs/[id].tsx** — Trend hook (`useAnalyteTrend`) + types fully real but never called. Mobile only: call the hook per analyte and render a chart. **Est. 0.5-1 day.**
- **records/upload.tsx (L60-64,50)** — Backend accepts arbitrary file types. Mobile: add `expo-document-picker` for the file branch so PDFs upload; stop hardcoding `image/jpeg`. **Est. 0.5 day.**

**Medium**
- **booking/review.tsx (L90-97)** — `reason` captured but omitted from create payload. Verify `book_appointment_atomic` accepts a reason field, then include it. **Est. 1-2 hrs.**
- **booking/payment.tsx** — Add in-app browser (`expo-web-browser`) + return deep-link; confirm backend recomputes amount server-side (see C1). **Est. 0.5-1 day + backend.**
- **booking/payment-success.tsx** — Add a bounded `refetchInterval`/auto-retry so the happy path doesn't require manual Retry. **Est. 2-3 hrs.**
- **appointments/[id]/check-in.tsx** — Orphaned; fake "live" queue. Wire real queue/QR + navigation + error state, or delete. **Delete 15 min; full build 2-3 days** (needs realtime queue backend).
- **records/prescriptions/index.tsx (L84)** — "Set reminder" stub. Implement with expo-notifications or hide. **Hide 15 min; build 1 day.**
- **rate/[appointmentId].tsx (L39-72)** — Add loading/error/empty for `useAppointment`; decide on "anonymous" checkbox; send aspect keys not translated strings. **Est. 2-4 hrs.**
- **settings/notifications.tsx (L61,79)** — Add mutation error feedback + disable during in-flight writes. **Est. 2 hrs.**
- **language.tsx (L29-30)** — Make "restart now" reload (`expo-updates reloadAsync`). **Est. 1-2 hrs.**
- **search/specialties.tsx** — Add error/empty states; match localized label. **Est. 2-3 hrs.**
- **patient-switcher.tsx** — Product decision: currently only re-scopes booking. If app-wide "act as" intended, thread `activePatientId` through records/labs/rx/payments query keys. **Est. 2-4 days if full scope; 0 if booking-only is intended.**
- **dashboard.tsx** — Remove "Customize" stub (L156); add error/empty for recents & featured; reconsider hardcoded 3-specialty filter (L177). **Est. 0.5 day.**
- **records tab (L114-125)** — Implement or remove the decorative search field. **Est. 2-3 hrs.**

---

## PART 2 — FEATURE AUDIT

| Feature | Status | Evidence / gap |
|---|---|---|
| Authentication | **Complete** | Supabase-direct sign-in `authService.ts:69-79`; single auth gate `(app)/_layout.tsx:18-30`; sign-out clears store + query cache `useAuth.ts:53-61` |
| Registration | **Complete** | Backend REST signup (service-role, email auto-confirmed) → auto sign-in → best-effort OTP `authService.ts:86-122` |
| OTP | **Complete** (caveats) | Send/verify via backend `authService.ts:124-146`; resend timer `otp.tsx:34-59`. Not hard-gated (a non-verified user can still reach the app via sign-in). **SMS delivery is unwired backend-side (Part 5 H3).** |
| Password Reset | **Partial — completion BLOCKED** | Email real `authService.ts:149-156`. Completion needs a recovery session from a deep link that is never wired `authService.ts:159-166`, `reset-password.tsx:39`. Users can request but never complete in-app. |
| Profile | **Complete** | Real read/update; photo upload Supabase-direct into `account_image` bucket `real/index.ts:110-146` |
| Medical History | **Complete** | Real `api.records.*`; keyed on `patient_profiles.id` — legitimately empty for new signups until the DB trigger creates that row |
| Family Members | **Complete** | Full real CRUD `real/index.ts:188-201` |
| Doctor Search | **Complete** | Real `searchDoctors`; maxFee/minRating/availableToday client-side; gender cannot be filtered `real/index.ts:588-602` |
| Doctor Details | **Complete** | Real `getDoctor` `real/index.ts:603-607`; `slots_today` omitted (schedule falls back to defaults) |
| Appointments | **Complete** | Real list/detail `real/index.ts:353-365` |
| Booking | **Complete** | Atomic RPC `book_appointment_atomic`, honours business failures `real/index.ts:376-411` |
| Cancellation | **Complete** | `cancel_appointment_safe` `real/index.ts:412-422` |
| Reschedule | **Complete** | Real RPC `real/index.ts:423-436` |
| Payments | **Partial** | Thawani hosted checkout + authoritative verify `real/index.ts:319-351`. **Client-supplied amount (critical, Part 5 C1)** + fragile external-browser return |
| Notifications (in-app) | **Complete** | List/preferences/facility-messages real `real/index.ts:725-773`; prefs stored in `profiles.notification_prefs` JSONB (no separate table) |
| Push notifications | **Missing** | `src/services/push.ts` implements register/save/sync + `setNotificationHandler` but **is never imported anywhere** (grep: only the file itself). No token obtained, no `device_tokens` write, no received/response listeners, no badge. |
| Medical Records / Documents | **Complete** | Storage `patient-docs`: list/get/upload/remove/signedUrl `real/index.ts:811-852`. Upload limited to images. |
| Lab Reports | **Complete** (trend chart missing) | Pass-through to `api.labs.*` `real/index.ts:917-933`; full states in list; detail trend hook unused |
| Prescriptions | **Complete** (read-only) | Real list/get; PDF/share via backend `real/index.ts:889-911`; patients can't generate PDF (doctor-only) |
| Settings | **Partial** | Privacy, Export Data, Delete Account are "coming soon" alerts `settings/index.tsx:93-106` |
| Localization (i18n) | **Complete** | `ar: Messages` → compile-time key parity `ar.ts:6`; Eastern-Arabic digit localization `i18n/index.tsx:85-90`. Arabic bold renders regular (font limit). |
| Dark Mode | **Complete** | Persisted themeStore merged with OS scheme `ThemeProvider.tsx:37-38` |
| RTL | **Complete** (restart required by design) | `I18nManager.forceRTL` `i18n/index.tsx:58-83`; restart prompt |
| Offline handling | **Missing** | No NetInfo, no `onlineManager`, no query persistence `QueryProvider.tsx:8-20`. `apiFetch` has a 20s timeout + clear network message `api.ts:26,66-90` so it degrades, but no cache/queue/banner |
| Deep links | **Missing** | Scheme `medilink` declared `app.json:5`, `expo-linking` installed, but **no `getInitialURL`/`addEventListener`/`useURL`/Router linking config/associatedDomains/intentFilters**. Only outbound `Linking.openURL`. |
| Session restore | **Complete** | Chunked SecureStore adapter `secureStore.ts:14-53`; client `supabase.ts:14-34`; `AuthProvider.tsx:15-35`; splash gates on hydration `splash.tsx:32-53` — no race observed |
| Error handling | **Complete** (no global boundary) | Stable i18n messageKeys `api.ts:14-23,66-90`; RPC business-failures surfaced; ErrorState + retry uniform. Gap: no global React error boundary (a render crash white-screens) |
| Loading states | **Complete** | Shared `LoadingState`/`ErrorState`/`EmptyState` used uniformly |
| Empty states | **Complete** | `EmptyState` across lists |

**Other observations:** Google sign-in disabled client-side and honestly surfaced (`env.ts:52-55`, `sign-in.tsx:175-186`); Apple button hard-disabled (`sign-in.tsx:191-197`). Check-in "live queue" uses static values (`check-in.tsx:69`, "wired to realtime tomorrow"); no realtime subscriptions anywhere in mobile. `PhoneField` uses a static country prefix (TODO `PhoneField.tsx:18`). `usesCleartextTraffic:true` on Android (`app.json:26`) — remove for production.

---

## PART 3 — iOS READINESS

**No iPhone has run this build.** Nothing hard-crashes on launch, but two things will actively fail a user. Every row is backed by code that was read; where an outcome truly needs hardware (permission dialogs, APNs delivery, keychain behavior), that is stated rather than guessed.

| Area | Classification | Evidence / Notes |
|---|---|---|
| Expo SDK 54 / RN 0.81 / React 19 | Likely works | `package.json:20-41` internally consistent |
| newArchEnabled: true | Likely works | `app.json:10`; reanimated 4.1 / gesture-handler 2.28 / screens 4.16 / safe-area 5.6 / svg 15.12 all Fabric-compatible |
| Hermes | Definitely works | SDK 54 default, no `jsEngine` override |
| Expo Router v6 / Navigation | Likely works | `app/_layout.tsx:5,37-47`; global `headerShown:false` |
| SafeArea | Definitely works | Provider at root `_layout.tsx:4,32`; consumed via `Screen.tsx:13,83` |
| KeyboardAvoidingView | Likely works | iOS `padding` `Screen.tsx:85-88`; verify long forms on device |
| StatusBar | Definitely works | Theme-aware `Screen.tsx:14,84` |
| Fonts (bundled static) | Definitely works | `useFonts` gates render `_layout.tsx:6,25-28`; all 12 files present. Arabic bold → regular (cosmetic) |
| Camera | Likely works (NOT a crash) | Used `upload.tsx:56-59`; **no `cameraPermission` prop** in `app.json:42-47`, but the expo-image-picker plugin injects a **default** `NSCameraUsageDescription`. Risk: generic string → App Store review scrutiny |
| Gallery / Image picker | Likely works | `photosPermission` set `app.json:44-46`; confirm dialog on device |
| Location | Definitely works (N/A) | No location API called; map is decorative `search/map.tsx:11-16,48-49`. No `NSLocationWhenInUse` needed |
| **Notifications (push / APNs)** | **Definitely broken** | `services/push.ts` never imported (0 callers); `setNotificationHandler` never registers; no token obtained; no `aps-environment`/entitlement `app.json:15-22`; plugin only sets Android color `app.json:36-41`. Will not work in TestFlight/production |
| Splash screen | Likely works (cosmetic gap) | No `splash` key / `expo-splash-screen` and no splash asset → blank white native launch, then JS splash route |
| RTL (forceRTL) | Needs device testing | Correct pattern (returns "restart needed") `i18n/index.tsx:58-66`; reload/relaunch behavior must be verified on device |
| Deep Linking (scheme) | Likely works (basic) | Scheme + expo-linking present; no inbound handler for auth recovery |
| Universal Links | Definitely absent | No `ios.associatedDomains` |
| AppState | Definitely works | `lib/supabase.ts:2,28-34` (autoRefresh on fg/bg) |
| Gesture Handler | Definitely works | `GestureHandlerRootView` at root `_layout.tsx:3,31` |
| Reanimated / worklets plugin | Definitely works | worklets plugin is **last** `babel.config.js:21`; reanimated 4.1 / worklets 0.5.1 |
| Native modules | Likely works | All Expo-managed SDK-54 pins; no bare/unlinked custom native modules |
| Supabase Auth on iOS | Likely works | SecureStore adapter, `detectSessionInUrl:false` `lib/supabase.ts:14-25`; prod URL/key `eas.json:32-33`; confirm round-trip on device |
| Secure Storage (Keychain) | Likely works | Chunked adapter (1800-byte chunks) `secureStore.ts:14-53`. `NSFaceIDUsageDescription` declared but never exercised (harmless) |
| File uploads | Likely works | `edit-profile.tsx:93-100`, `upload.tsx:68-80`; confirm multipart from real file URI on device |
| Date picker | Definitely works (N/A) | No native date picker; DOB is free-text `edit-profile.tsx:183-189`; booking uses custom slot UI |
| Share API | Likely works | RN `Share.share` (`records/document/[id].tsx:43`, `payments/invoice/[id].tsx:67`, etc.) |
| **Payment redirect (Thawani)** | **Needs device testing (P1)** | `Linking.openURL` to Safari `booking/payment.tsx:53-62`, then `router.replace` to success + verify/Retry `payment-success.tsx:38-60`. **No deep-link return**; `expo-web-browser` not installed. Auto-return UX fragile — validate end-to-end on a real iPhone |
| OAuth (Google) | Works (disabled by design) | No client IDs `env.ts:43-55`, `eas.json:26-34` |
| External browser (expo-web-browser) | Absent | Not in `package.json`; all external links use RN `Linking.openURL` → leaves the app to Safari |
| Environment variables | Likely works | `config/env.ts:16-48`; prod env in `eas.json:26-34`; `env.ts:22-25` throws if required vars missing in non-mock mode |
| Build config | Likely works | bundleId `com.inzint.medilink`, `supportsTablet:true`; `eas.json` autoIncrement + `ascAppId 6787878139`; `ITSAppUsesNonExemptEncryption:false` |

### Prioritized iOS blockers
- **P0 — Push notifications entirely non-functional.** `services/push.ts` never imported (0 callers); no permission requested, no Expo/APNs token, foreground handler never registers; no `aps-environment` entitlement. Any push expectation (reminders, payment confirmations) silently does nothing.
- **P1 — Thawani return-to-app has no deep-link handler.** Checkout opens in external Safari; success screen only resolves if the user manually returns and it re-verifies. Must be tested on a physical iPhone.
- **P2 (review/polish, not crashes):** generic camera permission string; no native splash screen; unused `NSFaceIDUsageDescription`.

**Explicitly NOT blockers (verified safe):** Location/Maps (no location API called); Google OAuth (intentionally disabled); Reanimated/Gesture/SafeArea/Hermes/AppState all correctly set up.

---

## PART 4 — ANDROID READINESS

The JS/data layer is shared, so logic gaps are identical across platforms. What must be **manually tested on a physical Android device** (none of this is verifiable from code):

| Flow | Must test | Why |
|---|---|---|
| Authentication | Sign-up → OTP → sign-in → sign-out → cold-start session restore | SecureStore chunking, token refresh on foreground |
| Booking | Slot select → book → atomic RPC failure paths (slot taken) | Real RPC + concurrency |
| Payments | Full Thawani round-trip incl. **return to app** and verify | `Linking.openURL` external-browser return (fragile) |
| Notifications | Push receipt in fg/bg/killed, tap-to-route | **Currently will fail — push unwired** |
| Profile | Photo pick + upload; allergy save success **and failure** | edit-profile silent-fail bug |
| Image Upload | Camera capture + gallery; **PDF upload (currently impossible)** | RECORD_AUDIO is the only declared perm; camera/photos runtime prompts |
| Medical Records | Document open/download, signed URLs | `Linking.openURL` opens browser, no save-to-device |
| Localization | en↔ar switch + **relaunch** for RTL | forceRTL needs reload; "restart now" is a no-op |
| Offline | Airplane mode on every screen | No cache/queue — expect error states, verify no crashes |
| Session restore | Kill + relaunch while signed in | Splash hydration gate; check no hang (no timeout fallback) |

Remove `usesCleartextTraffic:true` (`app.json:26`) for the HTTPS-only production build.

---

## PART 5 — BACKEND AUDIT

39 routes. Architecture is sound: `createApiSupabaseClient` verifies Bearer tokens via the anon key + `auth.getUser()`; the service-role key (`service.ts`, `adminClient.ts`) is server-only and never returned to clients; OTPs are bcrypt-hashed with attempt caps; the payment webhook is idempotent; double-booking + signup are trigger/RPC-guarded; **no IDOR found**. But release-blocking issues exist.

### Route inventory (condensed)

| Route | Methods | Auth? | Validation? | Key issues |
|---|---|---|---|---|
| `ai/symptom-check` | POST | **NONE** | manual | **No auth, no rate limit** (H1) |
| `ai/scan-prescription` | POST | getUser | manual | No file-size cap (M4) |
| `ai/suggest-doctor` | POST | getUser | manual | Rate-limit check+insert not atomic (minor) |
| `ai/schedule-assist` | POST | getUser | manual | No rate limit (M4) |
| `appointments/[id]/google` | POST | getAal2 | manual | Timezone hardcoded `Asia/Kolkata` (M6) |
| `auth/2fa/*` | POST | getUser | manual | In-memory rate limiter on verify/recovery (M3); staff-only |
| `auth/google` + `/callback` | GET | none/getUser | code | Tokens stored **plaintext**; leaks `details` (M6) |
| `auth/resend-otp` | POST | getUser | phone | **Math.random() OTP** (M2) |
| `auth/send-otp` | POST | getUser+role | manual+cooldown | OTP **never delivered** — no SMS provider (H3) |
| `auth/session-log` | POST | getUser | n/a | OK (best-effort) |
| `auth/set-password` | POST | token/getUser | zod | Refs missing `/api/invitations/accept` (MI1) |
| `auth/signup` | POST | none (public) | manual pw | Email auto-confirmed (L1) |
| `auth/verify-otp` | POST | getUser+role | manual | OK (bcrypt, attempts cap, expiry) |
| `notifications/push` | POST | shared-secret | manual | OK (server-to-server) |
| `patients/me/profile-photo` | POST | getAal2 | type+size | OK |
| `patients/[id]/medical-history/pdf` | GET | getAal2+role+ownership | n/a | OK |
| `payments/checkout` | POST | getAal2 | manual | **CRITICAL: amount trusted from client (C1)** |
| `payments/get-appointment/[id]` | GET | getAal2 | n/a | Server-side fee exists but checkout ignores it |
| `payments` (list) | GET | getAal2 | enum | Leaks `err.message`; unused by mobile |
| `payments/unpaid` | GET | getAal2 | n/a | Unused by mobile |
| `payments/verify` | POST | getAal2+ownership | manual | OK (idempotent, gateway-authoritative) |
| `payments/webhook` | POST | **none** | manual | **No signature verification** (M1, mitigated) |
| `payments/[id]/invoice` | GET | getAal2+ownership | n/a | OK (IDOR fixed) |
| `payments/[id]/refund` | POST | getAal2 | none | **No cancellation guard; refund race; no status update (H2)** |
| `prescriptions/[id]/download` | GET | getAal2+ownership | n/a | OK |
| `prescriptions/[id]/generate-pdf` | POST | getAal2+doctor ownership | n/a | OK |
| `prescriptions/[id]/share-link` | GET | getAal2+ownership | n/a | OK |
| `users/me/account` (+ cancel-deletion) | DELETE/POST | getAal2 | confirmation | OK |
| `users/me/data-export` (+ `[id]`) | GET/POST | getAal2+ownership | rate-limited | OK |
| `docs` / `openapi.json` | GET | admin-gated | n/a | Properly gated |

### CRITICAL
- **C1 — Payment amount trusted from client (price manipulation).** `payments/checkout/route.ts:14-15` reads `amount` from body; charges it verbatim (L70, `unit_amount: amount*1000`) and stores it (L99). Mobile sends the amount (`mobile/src/data/real/index.ts:335-337`). A tampered request pays **any amount** (e.g. 0.001 OMR) and still gets the appointment confirmed. The authoritative fee already exists (`payments/get-appointment/[id]/route.ts:36-37`) but checkout never uses it. **Fix: derive amount server-side from the doctor's fee; ignore/validate the client value.** Blocks any real-money launch.

### HIGH
- **H1 — `ai/symptom-check` no auth + no rate limit.** `ai/symptom-check/route.ts:68-79` goes straight to `req.json()` (every other AI route authenticates), makes two Groq calls, and writes `symptom_check_logs` with the service role (L125-132). Anyone can burn the Groq quota and insert rows. Intended pattern is in `ai/suggest-doctor/route.ts:133-146`.
- **H2 — Refund route broken.** `payments/[id]/refund/route.ts`: no check the appointment is cancelled (L71-73 → 100% refund while keeping a live booking); duplicate-refund check (L38-45) not atomic with insert (L101-112) and the Thawani refund runs **before** the insert (L77) → concurrent calls both issue real refunds (**double refund**); success never sets `payments.status='refunded'` or touches the appointment.
- **H3 — Phone OTP never delivered.** `auth/send-otp/route.ts:84-88` notes no SMS provider. The whole phone-verification path can't complete in production. Decide: wire an SMS provider, or hide the phone-verification gate.

### MEDIUM
- **M1 — Webhook no signature verification.** `payments/webhook/route.ts:11-34` accepts an unauthenticated POST; mitigated by re-fetching the session from Thawani and only finalizing if `paid` (L65-89) + atomic idempotent claim (L92-110), so spoofing "paid" isn't currently possible — but no HMAC/signature (defense-in-depth gap).
- **M2 — `resend-otp` uses `Math.random()`** (`route.ts:25`) vs `crypto.randomInt` in send-otp (`route.ts:46`); near-duplicate routes with divergent expiry (10 vs 5 min). Consolidate; use crypto everywhere.
- **M3 — In-memory rate limiters don't hold on serverless.** `auth/2fa/verify/route.ts:8-21` and `auth/2fa/recovery/use/route.ts:8-21` use a module-level Map — per-instance on Vercel → brute-force bypassable. Use Redis/Upstash or a DB counter.
- **M4 — Missing rate limits / size caps on AI + upload.** `ai/schedule-assist` (no per-user limit; up to 2 Groq calls + many DB/RPC calls) and `ai/scan-prescription` (no `file.size` cap before `sharp` decode, L83-99).
- **M5 — Internal error/detail leakage.** Raw error text returned in `payments/route.ts:78`, `payments/[id]/refund/route.ts:119`, `patients/[id]/medical-history/pdf/route.ts:95`, `auth/google/callback/route.ts:29,73`, `prescriptions/[id]/download/route.ts:75`, `prescriptions/[id]/generate-pdf/route.ts:184`. Standardize on a generic message + server log.
- **M6 — Google Calendar tokens plaintext; wrong timezone.** `auth/google/callback/route.ts:47-55` upserts `access_token`/`refresh_token` unencrypted; `appointments/[id]/google/route.ts:85,90` hardcodes `Asia/Kolkata` for an Oman product.

### LOW / STRUCTURAL
- **L1 — Signup auto-confirms email** (`auth/signup/route.ts:47`, `email_confirm:true`) — email ownership never proven (deliberate per docs).
- **L2 — Dual `patient_id` identity footgun.** `payments.patient_id` = auth uid; `appointments.patient_id` = `patient_profiles.id`. Already caused the RLS bug fixed in `supabase/migrations/20260630000001_fix_payments_patient_read_rls.sql`; forces `as any` casts. Fragile, not a live bug.
- **MI1 — `/api/invitations/accept` referenced but absent.** `auth/set-password/route.ts:84,152` documents the staff accept flow, but no `invitations` route exists. Only affects staff onboarding (not the patient app). Confirm before shipping staff onboarding.

### Race conditions & transactions
- Webhook finalization idempotent via atomic conditional claim (`webhook/route.ts:92-103`, `.neq("status","paid")`).
- Double-booking guarded by `uq_appointment_slot` unique index + `book_appointment` RPC catching `unique_violation`.
- **Refund is racy (H2).**
- Signup + profile is atomic via `hams_handle_new_user` trigger (forces `role='patient'`, role-injection safe).
- Booking → payment spans two tiers (client RLS RPC + backend webhook/verify), not one transaction; a gap leaves an appointment without a finalized payment (recoverable via `payments/unpaid`).
- Webhook's payment-update (L92-103) and appointment-confirm (L116-119) are separate statements — could disagree on failure. Consider an RPC to do both atomically.

**Nothing the mobile patient app calls is missing** — signup, send-otp, verify-otp, payments/checkout, payments/verify, prescriptions download/share-link, ai/suggest-doctor, patients/me/profile-photo all exist. Device-token registration is correctly client-side against `device_tokens` under RLS (`mobile/src/services/push.ts:59-74`), not a backend route.

**Backend verdict:** work remains. The patient happy path is wired and mostly secure **except C1**, the single most important fix before any launch.

---

## PART 6 — WEB AUDIT

**CLAUDE.md is badly outdated** — it calls the frontend "mostly scaffolding, no feature routes." Reality: ~40 route files, ~10,400 lines under `src/app`, full auth + a ~19-page dashboard, nearly all wired to real Supabase (RLS) + backend HTTP.

### Route/page inventory (highlights)

Auth flow (`src/app/(auth)/*` + callback): welcome, onboarding (static slides), language, sign-up (real `supabase.auth.signUp` + OTP + enumeration handling), sign-in (password + Google OAuth), otp (real verify/resend), forgot-password (`resetPasswordForEmail`), reset-password (`updateUser({password})`), `auth/callback/route.ts` (`exchangeCodeForSession`). **All functional and backend-wired.**

Marketing (`src/app/*`): home, about, services, for-clinics (all static, valid CTAs), splash (timed redirect), **contact (fake submit — `handleSubmit` just `setSent(true)`, contact/page.tsx:27-30)**.

Dashboard (`src/app/dashboard/*`): page (real data **but hardcoded fake vitals L143-164**; dead "Consult Now" L639 and clinic-type cards L672), appointments (list/cancel/reschedule/check-in/rebook all real), find-doctors + `[id]` (real search, availability, reviews read+write), clinics/[id] (real), symptom-checker (real SSE stream + booking), profile (profile/history/family CRUD + document vault; height/weight UI-only, stale comment L559), records (aggregates rx/labs/docs + real PDF/share), payments (real GET; **no loading skeleton — shows "No payments" during fetch, L253-266**), setup (onboarding wizard, persisted), settings (notification prefs, GDPR export, account deletion — all real), notifications + `[id]` (real), messages (real), favourites (real), **lab-tests (static catalog + fake booking, L28-133,423)**, **surgeries (static catalog + fake booking; hardcoded `TODAY=new Date(2026,5,29)` L158)**, articles + `[id]` (static content), payment-success (real verify finalize).

Infra: `middleware.ts` + `lib/supabase/middleware.ts` run SSR cookie refresh on every non-static route and gate `/dashboard`; browser/server Supabase clients both used; `AuthContext` subscribes to `onAuthStateChange`. Auth is **production-grade, not a stub.**

### Categorized gaps
- **Missing backend calls / genuine feature gaps:** Lab Tests (static + fake booking; no ordering endpoint), Surgeries (static + fake booking; no domain in backend), Contact form (submits nowhere), **Dashboard vitals hardcoded (dashboard/page.tsx:143-164) — misleading in a medical app**, Health Library articles (static, no CMS — lower concern).
- **Partial integrations:** "Card" payment method (`DoctorBooking.tsx:269`) books a *pending* appointment with no card processing; only Thawani (L252-263) hits a real gateway.
- **Broken/dead navigation:** Terms/Privacy links `href="#"` (`sign-up/page.tsx:152,156`, no routes exist); footer social links `#`; dashboard "Consult Now" (L639) and clinic-type cards (L672) inert.
- **Missing loading states:** Payments page (no loading flag). **No route-level `loading.tsx`/`error.tsx`/`not-found.tsx` anywhere** — an uncaught render error has no fallback.
- **Missing error handling:** contact form (no feedback), payments (silent `setPayments([])` on error).
- **Remaining functional work:** stale comment `profile/page.tsx:559`; height/weight collected but silently not persisted; surgeries hardcoded "today" breaks the calendar on any other date.

**Web completion: ~82-85%** of the patient portal core is genuinely functional. Auth ~100%; dashboard core ~95%; two whole features (Lab Tests, Surgeries) are honest, documented shells. The single most misleading production risk is the fabricated vitals on the flagship dashboard.

---

## PART 7 — RELEASE BLOCKERS

### 🔴 Critical — cannot safely release
1. **Payment amount trusted from client** (backend C1) — price manipulation on real money.
2. **Push notifications entirely unwired** (mobile) — reminders/confirmations silently do nothing.
3. **Fake vital signs shown as real patient data** (web dashboard `page.tsx:143-164`; mobile insights `insights.tsx:15-23`) — clinical/integrity risk.
4. **No iOS device testing has ever occurred** — payment return + push + permissions unproven on hardware.
5. **`ai/symptom-check` unauthenticated & unthrottled** (backend H1) — open cost/abuse on a public endpoint.

### 🟠 High — should fix before release
6. Password-reset completion blocked (no deep-link recovery) — mobile.
7. Deep links unwired (breaks reset, payment return, notification taps) — mobile.
8. Refund logic broken (double-refund race, no cancellation guard, no state update) — backend H2.
9. Phone OTP never delivered (no SMS provider) — backend H3.
10. `edit-profile` reports "Saved" on failed allergy save + can wipe data — mobile.
11. `ai/assistant` is a dead static screen shipped in the tab-reachable app — mobile.
12. Settings "Delete Account" is a destructive-styled button that does nothing — mobile.
13. Payment webhook signature verification absent — backend M1.

### 🟡 Medium — can ship, should improve
Offline handling absent; search/map placeholder; gender filter silent no-op; lab trend chart missing; records/upload can't take PDFs; booking `reason` dropped; payment-success no auto-poll; rate screen missing load/error states; serverless rate-limiter (M3); AI cost caps (M4); error leakage (M5); Google token encryption + timezone (M6); web Lab Tests/Surgeries shells; web error boundaries; global RN error boundary; check-in orphaned route.

### 🟢 Low — nice to have
Android cleartext flag removal; language "restart now" real reload; specialties error/empty states; reviewer names; download-to-device; DOB validation; dead i18n strings cleanup; native splash asset.

---

## PART 8 — RELEASE PERCENTAGE

| Area | Completion | Basis |
|---|---|---|
| **Mobile** | **~80%** | ~28/49 screens production-ready, ~18 partial, 3 non-functional; core flows real; push/deep-links/offline missing, reset broken, 1 dead AI screen, map placeholder |
| **Backend** | **~85%** (1 critical blocker) | Sound architecture, patient path wired, no IDOR; but C1 payment vuln, refund broken, OTP delivery unwired, hardening gaps |
| **Web** | **~83%** | ~40 routes, auth + dashboard real; 2 feature shells, fake vitals, no error boundaries |
| **Overall project** | **~80%** | Functionally close; blocked by a small number of critical security/infra items, not breadth of missing features |

---

## PART 9 — PRODUCTION CHECKLIST

**Security & correctness (must)**
- ☐ Fix payment amount to be server-derived (backend C1)
- ☐ Add auth + rate limit to `ai/symptom-check` (H1)
- ☐ Fix refund: cancellation guard + atomicity + status update (H2)
- ☐ Add payment webhook signature verification (M1)
- ☐ Stop leaking internal error text to clients (M5)
- ☐ Durable rate limiting for 2FA + OTP (M3); crypto RNG for resend-otp (M2)

**Mobile feature completion (must/high)**
- ☐ Wire push notifications end-to-end (register + listeners + APNs/FCM creds)
- ☐ Wire deep links (scheme + universal/app links + notification routing)
- ☐ Complete password-reset via recovery-session deep link
- ☐ Fix edit-profile silent-fail / data-wipe
- ☐ Resolve ai/assistant + search/map (build or hide)
- ☐ Implement or hide Settings Delete/Export/Privacy
- ☐ Remove fake vitals (mobile insights + web dashboard) or replace with real data
- ☐ 15-min fix: wire the appointment "Rate" button to the built rating flow

**Device & release validation**
- ☐ Android full regression (all Part 4 flows)
- ☐ iPhone physical testing (permissions, keyboard, RTL relaunch)
- ☐ TestFlight validation (build, push/APNs, App Store review of permission strings)
- ☐ Payment verification end-to-end incl. return-to-app on both platforms
- ☐ Notification verification (fg/bg/killed + tap routing)
- ☐ Crash testing (add global error boundary first)
- ☐ Performance testing (cold start, list scrolling)
- ☐ RTL verification (en↔ar + relaunch)
- ☐ Localization verification (Arabic strings render, digit localization)
- ☐ Production environment verification (env vars, HTTPS-only, remove cleartext)
- ☐ Security review sign-off (post-fix)
- ☐ OTP/SMS decision executed (wire provider or hide phone gate)

---

## PART 10 — NEXT ACTIONS

### 1. What to work on next (in order)
1. **Backend C1 payment fix** — derive amount server-side. Nothing else matters if you're charging real money on a client-supplied price. (~0.5 day)
2. **`ai/symptom-check` auth + rate limit** (H1) — a public, unthrottled endpoint on your bill. (~2 hrs)
3. **Remove/replace fake vitals** on web dashboard and mobile insights — clinical-integrity risk. (~1-2 hrs to remove)
4. **Push notifications wiring** — call `syncPushToken` after sign-in, add received/response listeners, configure EAS push credentials. (~2-3 days)
5. **Deep links** — unlocks password-reset completion, payment return, and notification tap-routing in one effort. (~1-2 days)
6. **Refund fix** (H2) + the 15-min rate-button fix + edit-profile save fix. (~1 day)

### 2. What can wait
Offline handling; search/map (hide for v1); lab trend chart; records PDF upload; patient-switcher app-wide scoping; web Lab Tests/Surgeries (hide for v1); Google token encryption/timezone; DOB validation; reviewer names; i18n cleanup; language reload.

### 3. What absolutely requires an iPhone
Thawani payment return-to-app on iOS; push/APNs delivery in TestFlight; iOS permission dialogs (camera/photos) and their strings for App Store review; RTL relaunch behavior; keyboard-avoidance on long iOS forms; the native splash/launch experience. **None can be signed off from code.**

### 4. What can be completed entirely from Android testing
All business logic and data-layer verification: booking/cancel/reschedule atomic paths, records/labs/prescriptions reads, profile/family CRUD, i18n text + digit localization, dark mode, error/loading/empty states, session restore, offline degradation. Android + emulator covers ~everything except the iOS-specific list above.

### 5. If you have only 3 days before release
- **Day 1:** C1 payment fix + H1 symptom-check auth + remove fake vitals + refund guard (H2) + 15-min rate-button fix + edit-profile save fix.
- **Day 2:** Deep links + password-reset completion; then full Android regression of auth/booking/payment.
- **Day 3:** iPhone physical + TestFlight — payment round-trip and (if push is wired) notifications; hide unfinished surfaces (ai/assistant, search/map, web Lab Tests/Surgeries, Settings stubs) behind feature flags rather than shipping dead UI. Push realistically won't be production-solid in 3 days — **hide the feature** rather than ship it broken.

### 6. What is preventing a confident release today
- A **live money vulnerability** (client-controlled payment amount).
- **Zero iOS hardware validation** of payment return, push, and permissions.
- **Push notifications are dead code**, and **deep links don't exist**, so password reset and the payment return trip are broken/fragile.
- A **health app is displaying fabricated vitals** as real patient data.
- Several **destructive/important buttons are stubs** (Delete Account, ai/assistant, refund correctness).

None of these are large in code terms — a handful of targeted fixes plus real device testing — which is why the project is ~80% done yet still not releasable. The gap is *criticality*, not *volume*.
