# MediLink — Production Readiness Audit

**Date:** 2026-08-11 (revision 2 — supersedes revision 1 of the same day)
**Branch:** `development` · **HEAD:** `5ad4c3b` · **Working tree:** clean (this document only)
**Remote:** `origin/development` in sync, 0 ahead / 0 behind
**Method:** read-only re-audit of the actual repository, plus live read-only verification against the shared Supabase database and EAS.

> **Revision 2 re-derives every finding from the current code.** It does not assume revision 1
> was right — several of its claims turned out to be wrong and are corrected below.

> **No code was modified, no commit created, no migration applied, and no build or submission
> made during this audit.**

---

## What changed since revision 1

Four commits landed. Three audit blockers are now **fixed and live-verified**, one was found
during the work and fixed too, and three "unknown" items are now **known**.

| # | Change | Commit | State |
|---|---|---|---|
| 1 | Elapsed slots rejected; Oman business time in every booking guard | `8b5988e` | applied + live-verified |
| 2 | Migration history synchronised (12 HAMS files) | `ea7cd23` | pushed |
| 3 | Unified slot occupancy + RLS-independent availability | `59691fb` | applied + live-verified |
| 4 | Residual Oman-time defects: refund tier + Google Calendar | `5ad4c3b` | pushed |

**Corrections to revision 1:**

- **A fourth defect existed and was the worst of them.** `get_available_slots` was SECURITY
  INVOKER over an RLS-protected table. `anon` and `authenticated` both hold table-level SELECT,
  so RLS returned **zero rows silently** rather than erroring — every slot booked by anyone else
  was reported free. Revision 1 missed this entirely and attributed the "available →
  SLOT_ALREADY_BOOKED" symptom solely to expired holds.
- **The expired-hold window was never unbounded.** HAMS shipped `sweep_expired_holds()` on a
  1-minute pg_cron job (`20260730000002`, applied 30 Jul). Revision 1 said the sweeper's cadence
  "cannot be verified" — it can, and it works.
- **The three "unknown applied state" migrations were all applied.** `20260721000000`,
  `20260721000001`, `20260722000000` are live. Revision 1 rated this HIGH risk on no evidence.
- **The guest-mode RLS test has now been executed** (this audit, §9). Revision 1 rated it
  CRITICAL/never-run. It passes.
- **Two timezone defects revision 1 did not find:** the mobile refund tier read the slot in the
  *device's* zone (a money defect), and Google Calendar sync filed every event **4 hours late**
  with `timeZone: "Asia/Kolkata"`.

**New findings in revision 2** (both material, neither present in revision 1):

- **No TestFlight build contains any of this work.** Latest iOS build is **#9, commit `70b60fc`,
  2026-07-31** — **19 commits behind HEAD, 13 of which touch `mobile/` or `shared/`.**
- **No production Android build has ever been made.** One development-profile build exists.

---

## Verification status vocabulary

| Label | Meaning |
|---|---|
| **VERIFIED** | Confirmed by reading source *and* by a command or live query quoted here |
| **CODE VERIFIED / NEEDS RUNTIME** | Implementation confirmed; requires a real device or external service to prove |
| **NOT VERIFIED** | Evidence lives outside what this audit could reach |
| **BLOCKED** | Requires credentials or hardware unavailable here |
| **FAILING** | Actively broken right now |

---

## 1 · Test, build and static verification

All run this session against `5ad4c3b`.

| Check | Result | Status |
|---|---|---|
| `npm run typecheck` (4 workspaces) | exit 0 | VERIFIED |
| Mobile Jest | **27 suites, 520 tests, 0 failures** (was 481) | VERIFIED |
| Backend `node --test` | **54 pass, 0 fail** | VERIFIED |
| `npm run build:backend` | exit 0 | VERIFIED |
| `npm run build:frontend` | exit 0 | VERIFIED |
| `npx expo lint` (mobile) | exit 0 | VERIFIED |
| `npm run lint` (root) | **exit 1** | **FAILING — pre-existing** |
| Static scan: TODO/FIXME/mock | 2 real TODOs repo-wide | VERIFIED |

**Root lint still fails.** Backend and frontend have no ESLint config; `next lint` drops into an
interactive setup prompt and exits 1. Two of four workspaces are unlinted. Unchanged since
revision 1.

The only two TODOs in application code: `mobile/src/components/ui/PhoneField.tsx:37`
(country-code picker) and `backend/src/app/api/auth/send-otp/route.ts:6` (app-level OTP rate
limit).

---

## 2 · Booking / appointment system — the Bug 1 & 2 fixes, re-verified live

Every row below was produced by querying the **shared production database** during this audit.
Local Oman time at verification: **11:21**, UTC **07:21**.

| Behaviour | Evidence | Status |
|---|---|---|
| **Elapsed slots not offered** | doctor `073a4e03`, today: offered slots begin at **14:00**; 09:00–11:30 correctly withheld | VERIFIED |
| **Future slots today retained** | six afternoon slots still offered | VERIFIED |
| **Availability is RLS-independent** | anon **11 slots**, service_role **11 slots** — identical; 09:30 (confirmed) withheld from both. Before the fix: anon 12 / service_role 11 | VERIFIED |
| Expired unpaid hold → free | `appointment_holds_slot('pending', past)` → `false` | VERIFIED |
| Unexpired hold → occupied | `('pending', future)` → `true` | VERIFIED |
| Confirmed + stale hold column → occupied | `('confirmed', past)` → `true` | VERIFIED |
| Cancelled → free | `('cancelled', …)` → `false` | VERIFIED |
| Oman business time live | `oman_time_now()` = 11:21 vs UTC 07:21 (+4) | VERIFIED |
| Booking window clamp | out-of-window date → `[]` | VERIFIED |
| Unique-constraint backstop | duplicate insert on an occupied slot → `23505 uq_appointment_slot` | VERIFIED |
| HAMS `sweep_expired_holds` compatibility | cron released a live test row through the modified `release_unpaid_hold` after the migration | VERIFIED |
| Patient ownership / security | `book_appointment_atomic` remains SECURITY INVOKER → patient INSERT RLS + `aal2_or_no_2fa()` intact | VERIFIED |
| **Concurrent booking** | advisory lock + unique index; reasoned, not executed — needs two authenticated sessions | **CODE VERIFIED / NEEDS RUNTIME** |
| **Authenticated non-owner hold release** | new branch in `release_unpaid_hold`; needs a real patient JWT | **CODE VERIFIED / NEEDS RUNTIME** |
| Reschedule / cancel in Oman time | cutoffs now measured in Asia/Muscat (were 4h lenient) | CODE VERIFIED / NEEDS RUNTIME |

**Assessment:** the booking layer is the strongest part of the system now. The three original
defects plus the RLS defect are fixed at the database, which is the correct enforcement point,
and the fixes are demonstrably live.

---

## 3 · Mobile — screen inventory

**64 route files**: 4 layouts, 2 dev-only (double-gated), 1 redirect, **57 user-facing screens**.

| | Count |
|---|---|
| Fully production-ready | **51** |
| Partial | **6** |
| Incomplete / mock-backed | **0** |
| Backend-connected (of those with data) | **all** |

Two screens moved to production-ready since revision 1 — `booking/[doctorId]/schedule` (past-slot
and timezone defects fixed) is the notable one.

### The 6 partial screens

| Screen | Gap | Blocker? |
|---|---|---|
| `(tabs)/me` | no error state if profile load fails | no |
| `ai/assistant` | inline error only, no retry affordance | no |
| `ai/schedule` | no `ErrorState` component | no |
| `appointments/[id]/reschedule` | zero `isRTL`/`flexDirection` — RTL needs a visual pass | no |
| `search/map` | anchored to a hardcoded Muscat centroid; no device location, so "nearby" and every `distance_km` are wrong outside central Muscat | no |
| `onboarding` | illustrations are plain lavender circles (explicit placeholder in code) | no |

Eight screens lack an `ErrorState` component in total; five of those are **forms** (`setup`,
`family/add`, `booking/review`, `settings/index`, `search/filters`) which surface failures through
`Alert` instead — correct for their shape, not a defect.

### Mobile feature coverage

| Area | State |
|---|---|
| Navigation, tab structure, auth gate | VERIFIED — single `(app)` gate; tab bar structurally impossible on auth/splash routes |
| Authentication (signup, email OTP, login OTP, password reset, logout) | VERIFIED in code; reset works via recovery OTP, **no deep link needed** |
| Google OAuth | Android only, config-gated; iOS deliberately off until Sign in with Apple |
| Phone OTP | **NOT IMPLEMENTED** — blocked on an SMS provider |
| Onboarding / profile / family / patient switcher | VERIFIED, all real data |
| Doctor + clinic search, doctor details, availability | VERIFIED, real |
| Booking / reschedule / cancel | VERIFIED, real, defects fixed |
| Payments + Thawani WebView | code complete; see §4 |
| Invoices / receipts | real, incl. regenerate + save-to-vault |
| Appointments list + detail | real |
| Check-in | real API; **QR pass does not exist** |
| Live queue + realtime | real, HAMS-owned RPCs |
| Medical records, document vault, labs, prescriptions | real |
| Notifications + preferences + facility messages | real |
| AI (assistant, insights, recommendations, schedule) | real, live Groq |
| Google Calendar | fixed this cycle; needs a connected account to prove |
| EN/AR + RTL | parity type-enforced; runtime RTL without restart, unit-tested |
| Dark/light | derived palette, `ThemeProvider` tested |
| Offline | AsyncStorage-persisted React Query cache |
| Session restoration / Remember Me | CODE VERIFIED / NEEDS RUNTIME |
| Deep links | **NOT IMPLEMENTED** — scheme only. Not required by current flows |
| Permissions | camera/photos declared; microphone and Face ID explicitly refused |

---

## 4 · Mobile dynamic integration

**17 interfaces / 77 repository methods.** Re-counted this audit.

| Finding | Status |
|---|---|
| **76 of 77 methods wired to real backends** | VERIFIED |
| The one exception — `doctor.mapClinics` — returns `[]` and is **unreachable** (its only hook has no consumer; Map View uses real `discovery.nearbyClinics`) | VERIFIED |
| No fake success responses — every write surfaces the backend's own error code | VERIFIED |
| No hardcoded patient data outside `src/data/mock/`, which the build-time env guard makes unreachable in a production build | VERIFIED |
| Incomplete data: `search/map` sends a constant Muscat coordinate, so `distance_km` is measured from the city centre, not the user | VERIFIED — MEDIUM |
| Authentication on every call: bearer token via `apiFetch`, or the user's own Supabase session under RLS | VERIFIED |

The `...mockRepositories` spreads remain in `hybridRepositories` as a safety net. Documented as
deliberate, but a newly added repository method silently serves mock data until wired.

---

## 5 · Payments

Implementation quality is high and unchanged. Configuration is the problem.

| Item | State |
|---|---|
| Server-derived amount (fee + 5% VAT); client amount ignored | VERIFIED |
| Webhook re-queries Thawani before finalizing — closes payment bypass | VERIFIED |
| Duplicate/concurrent webhook idempotent (atomic conditional claim) | VERIFIED |
| Refunds atomic + idempotent (`FOR UPDATE`, single claim) | VERIFIED |
| Invoice generation, regeneration, recovery, vault filing | VERIFIED |
| Payment history | real |
| Appointment confirmation on payment | VERIFIED |
| **Thawani host** | **`THAWANI_BASE_URL` and `THAWANI_CHECKOUT_BASE_URL` both point at `uatcheckout.thawani.om` locally.** Production Vercel values NOT VERIFIED |
| **`THAWANI_WEBHOOK_SECRET`** | **unset locally** → HMAC verification skipped. Mitigated by the mandatory gateway re-query |
| Real-money transaction on the production host | **NOT VERIFIED — no evidence anywhere in the repo** |
| Paid-but-unconfirmed reconciliation | verify endpoint + 6× client poll + webhook; sound in code |
| PHI in logs | `webhook/route.ts:64` logs the full body; `:323` logs the patient email | **MEDIUM** |

---

## 6 · Email — Microsoft OAuth2 / Exchange Online

**Intact. No redesign warranted. Nothing modified.**

| Item | State |
|---|---|
| Single transporter; three Gmail transports gone | VERIFIED |
| XOAUTH2 Entra app-only token; `oauth2_provision_cb` survives expiry; failed token not cached | VERIFIED (54 tests) |
| OAuth2 preferred over `SMTP_PASS`; **partial** OAuth never silently falls back to Basic | VERIFIED |
| `smtp.office365.com:587` STARTTLS; `SMTP_SECURE` opt-in; TLS never weakened; extra CA appends only | VERIFIED |
| **No secret, password or token can reach a log line or thrown error** | VERIFIED (3 dedicated tests) |
| Auth/application email boundary — Supabase Auth owns auth mail | VERIFIED |
| Triggers: booking confirmation + invoice (webhook & verify), cancellation & reschedule (from mobile, fire-and-forget) | VERIFIED |
| Local env: tenant/client/secret, SMTP user/pass, EMAIL_FROM, CA file all set | VERIFIED |
| SMTP.SendAsApp permission, Exchange service principal, mailbox SendAs rights | **NOT VERIFIED** — Microsoft-side, outside the repo; the team reports it working in production |
| Vercel production env | **NOT VERIFIED** |
| Delivery monitoring / bounce handling | absent — LOW |

---

## 7 · Backend

**43 routes.** Re-checked this audit.

| Finding | Status |
|---|---|
| Every route that should be authenticated is. Only 4 are unguarded and all correctly so: `auth/google` (OAuth start), `auth/signup` (pre-session), `docs` and `openapi.json` (both gated by `ENABLE_API_DOCS` + a production admin check) | VERIFIED |
| All 4 AI routes authenticate **and** rate-limit per user per hour via `ai_request_logs` | VERIFIED |
| Webhook protected by optional HMAC + mandatory gateway re-query | VERIFIED |
| `notifications/push` requires an internal shared secret | VERIFIED |
| No IDOR found; privileged routes read through the caller's RLS client first | VERIFIED |
| Security headers on every response; HSTS production-only | VERIFIED |
| **No ESLint config** for backend or frontend | **FAILING** |
| **No route has a test** — the 54 backend tests cover email/OAuth only | MEDIUM |
| CORS allow-lists `http://localhost:3000` unconditionally, including production | MEDIUM |
| Validation ad-hoc; `zod` present but used only by `auth/set-password` | LOW |
| Sentry `instrumentation.ts` present but `withSentryConfig` unwired → minified production stack traces | LOW |

---

## 8 · Web frontend

`next build` passes. 35 pages.

| Category | Pages |
|---|---|
| **Dynamic** | auth (sign-in/up, OTP, forgot/reset, callback), find-doctors + detail, clinics, favourites, appointments, records, profile, setup, settings, notifications + detail, messages, symptom-checker, payments |
| **Dynamic with placeholders** | `dashboard/payments` — real rows; category, emoji, method and invoice title/provider/description filled with safe placeholders the backend does not return |
| **Mixed** | `dashboard/page.tsx` — real data plus some static sections |
| **Static catalogs presented as real offerings** | `dashboard/lab-tests` (hardcoded `CATEGORIES` + `LABS` with prices, ratings, bookable slots — documented backend gap), `dashboard/surgeries` (10 hardcoded arrays), `dashboard/articles` + detail |
| **Marketing (static by design)** | `/`, about, contact, services, for-clinics, splash, welcome, onboarding |

The web booking calendar now uses the shared Oman helper (`5ad4c3b` lineage), so web and mobile
resolve the same calendar date as the database.

**The concern is unchanged:** three consumer-facing sections present hardcoded prices, providers,
ratings and bookable slots as if real. A patient cannot tell the difference.

---

## 9 · Supabase / database — read-only audit

| Check | Result | Status |
|---|---|---|
| Total migrations | **166 local, 166 applied** | VERIFIED |
| **Remote-only** | **0** | VERIFIED |
| **Local-only / unapplied** | **0** | VERIFIED |
| **Same-version conflicts** | **none** | VERIFIED |
| HAMS repo drift | **0 new HAMS migrations** since the sync | VERIFIED |
| Dangerous pending migrations | none. `20260803000002_STAGED_revoke_phone_verified.sql.pending` remains correctly excluded from MediLink | VERIFIED |
| Last three applied | `20260803000001`, `20260811000000`, `20260811010000` | VERIFIED |

### Guest-mode RLS test — **EXECUTED, PASSES**

Revision 1 rated this CRITICAL and never-run. Run live this audit:

**Anon denied EXECUTE (42501) on:** `book_appointment_atomic`, `reschedule_appointment_atomic`,
`release_unpaid_hold`, `expired_hold_on_slot`, `slot_is_occupied`, `checkin_my_appointment`.

**Anon reads returning zero rows (no PHI):** `appointments`, `patient_profiles`, `payments`,
`prescriptions`, `patient_documents`, `family_members`, `lab_results`, `in_app_notifications`,
`profiles`, `refunds`, `device_tokens`.

**Anon can still read discovery (guest mode intact):** `doctors`, `facilities`, `specialties`.

### Security model of the booking objects

| Function | Model | Correct? |
|---|---|---|
| `get_available_slots` | SECURITY DEFINER, pinned `search_path` | yes — returns only slot times |
| `doctors_available_today` | SECURITY DEFINER | yes |
| `slot_is_occupied` | SECURITY DEFINER, boolean only | yes |
| `expired_hold_on_slot` | SECURITY DEFINER, one UUID | yes |
| `release_unpaid_hold` | SECURITY DEFINER; owner / expired-non-owner / service-role branches | yes |
| `book_appointment_atomic` | **SECURITY INVOKER** — deliberately | yes — patient INSERT RLS preserved |
| `reschedule_appointment_atomic` | **SECURITY INVOKER** | yes |
| `uq_appointment_slot` | unchanged partial unique index | yes — remains the backstop |

Shared HAMS/MediLink objects (`release_unpaid_hold`, `sweep_expired_holds`, the availability RPCs,
`appointments`) are consistent: exactly one release implementation exists, and HAMS's cron drives it.

---

## 10 · Auth & security

| Item | Status |
|---|---|
| Email/password, email OTP, login OTP, password reset | VERIFIED in code |
| Phone OTP | **NOT IMPLEMENTED** |
| Google OAuth | Android only; iOS gated off pending Sign in with Apple (Guideline 4.8) |
| Session restoration / Remember Me | CODE VERIFIED / NEEDS RUNTIME |
| MFA / AAL2 | enforced for staff; patients exempt by design |
| Patient authorization | RLS + `_owns_appointment` + RPC self-checks | VERIFIED |
| Service-role usage | server-only; **no service-role key in any client bundle** | VERIFIED |
| Secrets in client bundles | none found | VERIFIED |
| Production env guard | build-time + runtime; makes shipping mock data a build failure | VERIFIED |
| CORS | localhost allow-listed in production | MEDIUM |
| Exposed admin endpoints | none; `notifications/push` behind a shared secret | VERIFIED |
| Supabase anon key committed in `mobile/eas.json` | public by design, RLS-protected | LOW |

---

## 11 · iOS

| Item | State |
|---|---|
| Expo SDK 54.0.36 · RN 0.81.5 · React 19.1 · Router 6 · New Architecture on | VERIFIED |
| Bundle ID `com.inzint.medilink`; ASC app id `6787878139` | VERIFIED |
| EAS project `0aed5a20-…`, owner `ayush-inzint` | VERIFIED |
| Production profile env: `APP_ENV=production`, `DATA_MODE=production`, production API + Supabase URL | VERIFIED |
| Build-time env guard fails `eas build` on a bad combination | VERIFIED |
| Permissions: camera + photos strings; microphone and Face ID refused in both injection points | VERIFIED |
| `expo export --platform ios` | passes (dev env) — proves bundling only |
| **Latest iOS build** | **#9 · v1.0.0 · commit `70b60fc` · 2026-07-31 · FINISHED** |
| **Is HEAD represented in TestFlight?** | **NO — 19 commits behind, 13 touching `mobile/`/`shared/`** |
| Deep linking | not configured (scheme only); not required by current flows |
| Push notifications | client complete; **APNs credentials NOT VERIFIED** |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | **NOT VERIFIED** |
| Device QA results | **none in the repo** — `docs/qa/` holds a *plan* for build 9, no results |

**Nothing a patient would run today contains the booking fixes.** Build #9 predates Bug 1, 2, 3,
the Google sign-in hardening, the email system and the mobile QA batch.

---

## 12 · Android

| Item | State |
|---|---|
| Package `com.medilink.app`, edge-to-edge, adaptive icon | VERIFIED |
| Permission hygiene | exemplary — `android.permissions` empty; every permission arrives from a library; `RECORD_AUDIO` refused in both injection points | VERIFIED |
| `usesCleartextTraffic` removed — release builds block plain HTTP | VERIFIED |
| Google sign-in available (Web client ID only, correct) | VERIFIED |
| Checkout WebView: `domStorageEnabled`, hardware layer, nested scroll, single-window for 3-D Secure | VERIFIED |
| Deep links / App Links | **not configured** — no `intentFilters` |
| **Builds** | **1 total, `development` profile, commit `52fe9bb`. No production build has ever been made** |
| Device QA | **none recorded** |

---

## 13 · Production configuration

| Surface | State |
|---|---|
| Vercel backend (`medilink-backend`) / frontend (`medilink-frontend`) | projects linked; **no `vercel.json`** — all settings in the dashboard, so **deployment config is not in version control and cannot be audited here** |
| Supabase | linked, `zojrwuvxrkmgnlwyuypg`, 166/166 migrations in sync |
| EAS | authenticated; production profile carries the correct public env |
| `.env.example` | accurate; documents removed vars (Stripe, Gemini) so they are not re-sourced |
| Production Thawani / Microsoft / Groq values in Vercel | **NOT VERIFIED** |

---

## 14 · Blockers

### 🔴 P0 — must fix before production

**P0-1 · Thawani is configured for UAT and the webhook secret is unset**
- Platform: backend / payments · Files: `backend/.env.local`, `payments/checkout/route.ts:109`
- Root cause: `THAWANI_BASE_URL` and `THAWANI_CHECKOUT_BASE_URL` both point at
  `uatcheckout.thawani.om`; the checkout host silently **defaults** to UAT when unset.
  `THAWANI_WEBHOOK_SECRET` is empty, so HMAC verification is skipped.
- Impact: launch takes **zero real money** while appearing to work end-to-end.
- Fix: set the production host and webhook secret in the Vercel production environment; verify one
  real transaction.
- Code change: **no**. Runtime verification: **yes**.

**P0-2 · No TestFlight build contains any of the current work**
- Platform: iOS · Root cause: latest build #9 = `70b60fc` (2026-07-31), HEAD = `5ad4c3b`, 19 commits
  later, 13 touching mobile/shared.
- Impact: every fix in this cycle is unproven on a device, and testers are exercising stale code.
- Fix: cut a production build from HEAD and submit to TestFlight.
- Code change: **no**. Runtime verification: **yes**.

**P0-3 · Zero recorded device QA on either platform**
- Platform: iOS + Android · Root cause: `docs/qa/` contains a generated *plan* for build 9 and no
  results file; Android has only one development build.
- Impact: none of 57 screens has been confirmed to render on hardware. Everything else in this audit
  is static analysis or server-side verification.
- Fix: run the build-9 workbook against a fresh build on one iPhone and one Android device, EN and
  AR, light and dark.
- Code change: **no**. Runtime verification: **yes**. ~3–5 days.

**P0-4 · No production Android build has ever been produced**
- Platform: Android · Impact: the Play release path is entirely unexercised — signing, the Data
  Safety form, and release-build behaviour are all unknown.
- Code change: **no**. Runtime verification: **yes**.

**P0-5 · Static web catalogs presented as real offerings**
- Platform: web · Files: `dashboard/lab-tests`, `dashboard/surgeries`, `dashboard/articles`
- Root cause: no lab-test catalog/ordering backend exists; the gap is documented in code but
  invisible to a patient, who sees hardcoded prices, providers, ratings and bookable slots.
- Impact: consumer-protection problem, not merely a data gap.
- Fix: hide behind a flag or add unmistakable "coming soon" treatment.
- Code change: **yes** (~0.5 day). Runtime verification: no.

### 🟠 P1 — should fix before production

| # | Problem | Platform | Fix | Code? |
|---|---|---|---|---|
| P1-1 | Full webhook body + patient email written to logs (`webhook/route.ts:64,323`) | backend | log payment id + status only | yes, 1h |
| P1-2 | Backend + frontend have no ESLint config; root `npm run lint` exits 1 | backend/web | migrate to flat ESLint CLI | yes, 3–4h |
| P1-3 | No CI on `development`; the workflow sits unmerged on `chore/phase-1-hardening` (`468dfa3`) | repo | cherry-pick, make typecheck+tests+builds required | yes, 2h |
| P1-4 | CORS allow-lists `localhost:3000` in production | backend | drop in prod | yes, 30m |
| P1-5 | No route tests for checkout/webhook/verify/refund — the highest-consequence code | backend | add | yes, 2–3d |
| P1-6 | QR check-in does not exist; only orphan i18n strings (`checkInQrCaption`) | mobile | implement, or confirm status-based check-in with operations and remove the strings | product decision, 0.5–1.5d |
| P1-7 | `search/map` anchored to a hardcoded Muscat centroid; distances wrong | mobile | add `expo-location`, or relabel "Nearby" → "In Muscat" | yes, 0.5d |
| P1-8 | APNs / FCM credentials unverified; push delivery never proven | mobile | provision + prove one delivery | no code, needs devices |
| P1-9 | Missing error states on `(tabs)/me`, `ai/assistant`, `ai/schedule` | mobile | add | yes, 3h |
| P1-10 | RTL visual pass on `reschedule.tsx` (zero `isRTL` usage) and `records/document/[id]` | mobile | verify + fix | yes, 3h |
| P1-11 | `withSentryConfig` unwired → minified production stack traces | backend/web | wire | yes, 2h |
| P1-12 | Dead root `Medilink/eas.json` competes with `mobile/eas.json` | repo | delete | yes, 15m |
| P1-13 | `CLAUDE.md` still claims no test suite exists, forgot-password is blocked, and RTL needs a restart — all false | repo | correct | yes, 30m |

### 🟡 P2 — after initial release

Onboarding illustrations · Arabic bold weight (Zarid Sans doesn't synthesize) · app-level OTP rate
limit · standardise validation on `zod` · appointment-reminder push scheduler · country-code picker ·
email delivery monitoring/bounce handling · deep links + App Links · enforcing CSP with nonces ·
Sign in with Apple then Google on iOS · lab-test catalog backend · E2E suite (Detox/Maestro).

### 🔵 Verification-only — implementation appears correct, needs a device or external service

| # | Item | Needs |
|---|---|---|
| V-1 | Concurrent booking (exactly one winner) | two authenticated sessions — `supabase/tests/booking_slot_occupancy_test.sql` PART C |
| V-2 | Authenticated non-owner expired-hold release | a real patient JWT — PART B |
| V-3 | Session restoration / Remember Me across cold launch | device |
| V-4 | Thawani WebView + 3-D Secure | device + real transaction |
| V-5 | Push delivery end-to-end | device + APNs/FCM |
| V-6 | Google Calendar event lands at the correct hour | connected Google account |
| V-7 | Refund tier on a device set to a non-Oman timezone | device |
| V-8 | Queue realtime over a mobile network | device |
| V-9 | Arabic RTL rendering, typography, keyboard, safe area, Dynamic Island | device |
| V-10 | `PrivacyInfo.xcprivacy` emission; App Privacy questionnaire (health data) | prebuild + App Store Connect |
| V-11 | Microsoft SMTP.SendAsApp / Exchange service principal / mailbox SendAs | Microsoft tenant |
| V-12 | Production Vercel env values (Thawani, Microsoft, Groq, URLs) | Vercel dashboard |

---

## Mobile Production Readiness

| Metric | Value |
|---|---|
| Total screens (user-facing) | **57** |
| Fully production-ready | **51** |
| Partial | **6** |
| Incomplete | **0** |
| Mock/static-backed | **0** |
| Backend-connected | **all data screens** |
| Repository methods real | **76 / 77** (the one exception is unreachable) |
| Mobile tests | **520 passing** |

**Remaining mobile bugs (code):** no known functional defects in the booking, payment,
appointment, records or auth paths. What remains is polish — 3 missing error states, one RTL pass,
map location, onboarding illustrations — plus the QR product decision.

**iOS blockers:** no TestFlight build from HEAD (P0-2); zero device QA (P0-3); APNs unverified;
privacy manifest unverified.

**Android blockers:** no production build ever (P0-4); zero device QA; no App Links.

**Real-device testing still required:** all of V-1…V-10 above — most importantly the full
booking → payment → confirmation chain against live Thawani, check-in → queue with realtime,
push delivery, and EN/AR in both themes.

**Estimated engineering time remaining (mobile):** **2–3 days** (error states, RTL pass, map
location, QR decision).
**Estimated QA time remaining (mobile):** **3–5 days** device QA, after a build is cut.

### Could we release the mobile app to real patients today?

**NO.**

Not because the code is unfinished — it is in good shape, and the server-side defects that would
have produced wrong bookings are fixed and verified live. Three reasons:

1. **Payments would take no real money.** Thawani is on UAT and the webhook secret is unset. A
   patient would complete a checkout that settles nothing.
2. **The build in TestFlight is 19 commits stale.** It contains none of the booking fixes. Shipping
   it would ship the bugs; shipping HEAD means shipping something never run on a phone.
3. **No screen has been confirmed on hardware.** Zero device QA on either platform, and Android has
   never had a production build at all.

The first is a configuration change. The other two are time, devices and a build — not code.

---

## Current Production Readiness

**Overall: 82%** (was 74%)

| Area | Score | Δ | Held down by |
|---|---|---|---|
| Mobile | **78%** | = | no device runtime verification; polish items |
| Backend | **86%** | +1 | no lint config; no route tests; PHI in logs |
| Web | **67%** | +3 | three static catalogs |
| Database | **90%** | +10 | concurrency + non-owner release not runtime-proven |
| Payments | **79%** | −3 | UAT host + missing webhook secret now **confirmed**, not suspected |
| Auth | **89%** | +1 | guest RLS now verified; session restore device-unverified |
| Email | **93%** | +1 | Microsoft-side config and Vercel env unverifiable here |
| iOS | **53%** | +5 | no build from HEAD; zero device QA |
| Android | **57%** | +1 | no production build ever; zero device QA |

### How these were calculated

Four axes, weighted. Deliberately chosen so "the code exists" cannot carry a score.

| Axis | Weight (general) | Weight (iOS/Android) |
|---|---|---|
| Build completeness | 35% | 25% |
| Static verification (typecheck/lint/tests/build) | 15% | 10% |
| Functional correctness (defects found by reading the logic) | 30% | 25% |
| Runtime verification (observed working in its real environment) | 20% | **40%** |

iOS and Android weight runtime at 40% because a store release **is** a runtime artifact — a
platform with zero device evidence cannot score well however good the source is. This is why they
sit far below Mobile: Mobile measures the codebase, iOS/Android measure shippability.

**Overall** weights Mobile 30, Backend 20, Database 15, Payments 12, Auth 10, Web 8, Email 5 —
mobile is the product, web is secondary. iOS/Android are views of mobile readiness and are not
double-counted in the overall figure.

**Why the rise from 74% → 82%:** Database +10 (migration divergence resolved, three unknown
migrations confirmed applied, guest-RLS executed, occupancy verified live), Mobile's functional
correctness up sharply (four defects fixed) but offset by unchanged runtime evidence, Auth and iOS
up modestly. Payments went *down* because a suspected risk became a confirmed one.

### Can MediLink launch today?

**NO.**

### Minimum required before launch

1. **Point Thawani at production and set the webhook secret**, then verify one real transaction end-to-end. *(configuration + 1 verification, ~1 day)*
2. **Cut a production build from HEAD to TestFlight and run device QA** on iOS and Android, EN/AR, light/dark. *(~3–5 days)*
3. **Remove or clearly label the static web catalogs** (lab-tests, surgeries, articles). *(~0.5 day)*

### Recommended next work order

1. Set production Thawani config; verify a real payment (unblocks the whole revenue path).
2. Cut a TestFlight build from HEAD; begin device QA immediately — it is the long pole.
3. Label/hide the static web catalogs; stop logging PHI in the webhook.
4. Resolve the QR check-in question with operations; add the 3 missing error states and the RTL pass while QA runs.
5. Merge CI, add ESLint for backend/frontend, and write route tests for the payment surface.

### Estimated remaining engineering time

- **Mobile:** 2–3 engineering days + 3–5 days device QA.
- **Backend/web/config:** 4–6 engineering days (Thawani config ~1, web catalogs 0.5, PHI logging + CORS + ESLint + CI ~1, payment route tests 2–3).
- **Whole project: 7–9 engineering days plus 3–5 days QA**, i.e. **~2–3 calendar weeks** allowing
  for Apple review, credential provisioning and a staging verification cycle.

This is *shorter* than revision 1's 15–22 days because the booking/database work that dominated
that estimate is now done, applied and verified. What remains is mostly configuration, a build,
and hands-on testing.

---

## Audit scope statement

Read-only audit of `development` @ `5ad4c3b`, 2026-08-11. **No code modified, no commit created,
no migration applied, no build or submission made, no production configuration changed.**

Commands run: `git` inspection; `npm run typecheck`; `npx jest --ci`; `npm test` (backend);
`npm run build:backend`; `npm run build:frontend`; `npx expo lint`; `npm run lint`;
`npx supabase migration list --linked`; `npx eas-cli build:list`; and read-only PostgREST queries
against the shared database (RPC calls and `select` reads only — the single write attempted was a
duplicate-slot insert that the unique index correctly rejected, creating nothing).

**VERIFIED** claims were confirmed by source plus a quoted command or live query.
**NOT VERIFIED** means the evidence lives outside this repository — a device, the Vercel dashboard,
the Microsoft tenant, or App Store Connect.
