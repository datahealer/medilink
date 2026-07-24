# MediLink — Mobile + iOS Release Audit & Execution Plan

**Date:** 2026-07-15
**Scope:** Everything required to take **mobile (Expo/React Native) + iOS** to a secure, offline-capable production release.
**Type:** Audit + actionable plan. No code modified.
**Companion doc:** `docs/PRODUCTION_READINESS_AUDIT.md` (full 10-part audit across mobile/web/backend).

> **Constraint honored:** UI must NOT change. Every item below is *functional wiring, security, or infra* — no screen redesigns. The only screen-level work is wiring 2 fake shells (`ai/assistant`, `search/map`) to real data or hiding them behind a flag.

---

## 0. Honest framing (read this first)

- **No software is 100% "unbreakable" / unhackable.** Anyone who promises that is wrong. What this plan delivers is: **every known vulnerability closed + standard healthcare-app security best practice.** After that, the known attack surface is solid.
- **You have never run this on a real iPhone.** A large part of "iOS ready" cannot be signed off from code — it requires a physical device + TestFlight.
- **Current state:** the patient happy path (sign-up → book → pay → view records) is real and works. The gap to release is a *small number of critical items*, not breadth of missing features.

---

## Quick answers to the core questions

| Question | Answer |
|---|---|
| Any UI screen left to build? | No new screens. All 49 exist. **2 are fake shells** (`ai/assistant`, `search/map`) → wire or hide. Several need functional wiring (not redesign). |
| Any backend left? | Yes — **1 critical security hole + 3 high items.** No new patient endpoints except an SMS-provider decision + a server-side payment-amount fix. |
| Can it be unbreakable? | Not literally. This plan closes every real vuln found → "solid" and best-practice. |
| Offline mode? | Currently **zero** offline support. Plan adds read-only offline (~2 days) or full write-queue (~4-5 days). |

---

## PART A — MOBILE COMPLETENESS SNAPSHOT

- **Production-ready screens (~28):** search, me, profile, ai/recommendations, appointments list + reschedule + refund-policy, booking/schedule + payment-success, doctor detail + reviews, family (both), medical-history, notifications (both), payments list + invoice, rate/success, document detail, labs/index, prescriptions/[id], sign-in, sign-up, otp, index, splash, welcome, onboarding.
- **Partial — need wiring (~18):** dashboard, records tab, ai/insights, appointment detail, check-in, booking/review, booking/payment, search/filters, search/specialties, edit-profile, patient-switcher, rate/[id], labs/[id], prescriptions/index, records/upload, settings/index, settings/notifications, language.
- **Non-functional (3):** ai/assistant (static), search/map (fake map), forgot/reset-password flow (completion blocked).

Full per-screen table with file:line and effort is in `docs/PRODUCTION_READINESS_AUDIT.md` Part 1.

---

## PART B — BACKEND WORK REQUIRED

### 🔴 Critical (blocks release)
| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| B1 | **Payment amount trusted from client** (price manipulation — pay 0.001 OMR for any consult) | `payments/checkout/route.ts:14-15,70,99`; client sends amount `mobile/src/data/real/index.ts:335-337` | Derive amount server-side from doctor's fee (`payments/get-appointment/[id]/route.ts:36-37` already computes it); ignore/validate client value | ~0.5 day |
| B2 | **`ai/symptom-check` has no auth + no rate limit** (open Groq-bill abuse) | `ai/symptom-check/route.ts:68-79,125-132` | Add `getUser()` + per-user rate limit (pattern in `ai/suggest-doctor/route.ts:133-146`) | ~2 hrs |
| B3 | **Refund route broken** (refund while keeping booking; double-refund race; no status update) | `payments/[id]/refund/route.ts:38-45,71-73,77,101-112` | Add cancellation guard; make check+refund+insert atomic (RPC/transaction); set `payments.status='refunded'` | ~0.5 day |

### 🟠 High
| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| B4 | Payment webhook has no signature verification | `payments/webhook/route.ts:11-34` (mitigated by re-verify, but no HMAC) | Add Thawani signature/HMAC check | ~2-3 hrs |
| B5 | Phone OTP never delivered (no SMS provider) | `auth/send-otp/route.ts:84-88` | Wire Twilio/SMS gateway **or** hide phone-verification gate | 0.5 day / 1 hr |

### 🟡 Medium (hardening — required for "solid")
| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| B6 | In-memory rate limiters reset on serverless → brute-force bypass | `auth/2fa/verify/route.ts:8-21`, `auth/2fa/recovery/use/route.ts:8-21` | Move to Upstash/Redis or DB counter | ~0.5 day |
| B7 | `resend-otp` uses `Math.random()` | `auth/resend-otp/route.ts:25` | Use `crypto.randomInt`; merge duplicate OTP routes | ~1 hr |
| B8 | Internal error text leaked to clients | `payments/route.ts:78`, `refund:119`, `medical-history/pdf:95`, `google/callback:29,73`, `prescriptions/download:75`, `generate-pdf:184` | Generic client message + server log | ~2-3 hrs |
| B9 | Google Calendar tokens stored plaintext; timezone hardcoded `Asia/Kolkata` | `auth/google/callback/route.ts:47-55`; `appointments/[id]/google/route.ts:85,90` | Encrypt tokens; use Oman timezone | ~2 hrs |
| B10 | No size caps / rate limits on AI + upload | `ai/schedule-assist`, `ai/scan-prescription/route.ts:83-99` | Add `file.size` cap + per-user rate limit | ~2 hrs |

**Backend total: ~4-5 focused days. No new patient endpoints needed (aside from SMS decision).**
Verified safe already: bearer-token verification, service-role kept server-only, hashed OTPs w/ attempt caps, idempotent payment webhook, double-booking unique index + RPC, signup trigger forces `role='patient'`, **no IDOR found**.

---

## PART C — MOBILE / FRONTEND WORK REQUIRED

### 🔴 Critical
| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| M1 | **Push notifications are dead code** — module never imported | `src/services/push.ts` (0 callers); no listeners; no APNs entitlement | Call `syncPushToken()` after sign-in; add received + response(tap→route) listeners; verify backend reads `device_tokens` | ~2-3 days |
| M2 | **Fabricated vitals shown as real patient data** | `ai/insights.tsx:15-23` (also web `dashboard/page.tsx:143-164`) | Remove or clearly label until real vitals source exists | ~1-2 hrs |
| M3 | **2 fake screens** — assistant static, map fake | `ai/assistant.tsx:73,81,105`; `search/map.tsx:12-16,42-45` | Wire assistant to real `ai.suggestDoctors`; build or hide map | assistant 1-2d; map 3-5d or hide 1 hr |

### 🟠 High
| # | Item | Evidence | Fix | Effort |
|---|---|---|---|---|
| M4 | **Deep links unwired** (linchpin — fixes 3 things) | scheme `app.json:5`, no `getInitialURL`/`addEventListener`/linking config | Add linking handler → unlocks: password-reset completion (`reset-password.tsx:40`), payment return-to-app, notification tap routing | ~1-2 days |
| M5 | edit-profile reports "Saved" on failure + can wipe allergies | `edit-profile.tsx:59,62,130-132` | Move success/nav to `onSuccess`; gate on `history.isLoading` | ~0.5 day |
| M6 | Rate button dead-ends a built feature | `appointments/[id]/index.tsx:155` | `router.push(\`/rate/${id}\`)` | ~15 min |
| M7 | Settings Delete/Export/Privacy are dead buttons | `settings/index.tsx:93-105` | Implement (needs backend for delete/export) or hide | 3-5d full / 1 hr hide |

### 🟡 Medium (wiring gaps in existing screens)
| # | Item | Evidence | Effort |
|---|---|---|---|
| M8 | Lab trend chart never rendered (data layer ready) | `records/labs/[id].tsx`, `useAnalyteTrend` unused | ~0.5-1 day |
| M9 | Records upload can't take PDFs (image library only) | `records/upload.tsx:50,60-64` — add `expo-document-picker` | ~0.5 day |
| M10 | Booking `reason` captured but never sent | `booking/[doctorId]/review.tsx:90-97,172` | ~1-2 hrs |
| M11 | Gender filter silent no-op but counts toward badge | `search/filters.tsx`, `real/index.ts:599` | ~30 min (remove) |
| M12 | payment-success auto-poll; rate load/error states; settings/notifications error feedback; language real reload; dashboard/specialties/records-tab states | multiple | ~2 days combined |

**Mobile total: ~10-15 days** (lower if assistant/map/settings are hidden for v1).

---

## PART D — SECURITY HARDENING ("solid / no open holes")

Core = all of Part B. Plus these platform items:

- ☐ Add a **global React error boundary** (a render crash currently white-screens the app — no boundary found).
- ☐ Remove `usesCleartextTraffic: true` (`app.json:26`) → HTTPS-only in production.
- ☐ Confirm no secrets in client bundle — only `EXPO_PUBLIC_*`; verify service-role key never reaches the app.
- ☐ Re-verify RLS on every table the app touches after backend changes (no IDOR found today).
- ☐ Keep chunked SecureStore/Keychain adapter (already correct — `secureStore.ts:14-53`).
- ☐ After fixes: run `/security-review` on the diff + pen-test payment & auth flows.

**Definition of done for "solid":** Part B complete + this list complete = every known vulnerability closed, meets standard healthcare-app security practice. (Not a literal guarantee against all future attacks — no app can offer that.)

---

## PART E — OFFLINE MODE (currently zero support)

Current state: no NetInfo, no `onlineManager`, no cache persistence (`QueryProvider.tsx:8-20`). App degrades gracefully (20s timeout + error states) but caches nothing.

| # | Step | Effort |
|---|---|---|
| O1 | Install `@react-native-community/netinfo`; wire React Query `onlineManager` | ~0.5 day |
| O2 | Query cache persistence (`@tanstack/react-query-persist-client` + AsyncStorage/MMKV) → cached appointments/records/profile show offline | ~1 day |
| O3 | Connectivity banner ("You're offline") | ~0.5 day |
| O4 | Offline mutation queue (booking/profile edits retry on reconnect) | ~2-3 days |

**Recommendation:** read-only offline (O1-O3, ~2 days) for v1. Booking a real appointment offline is risky — defer O4.

---

## PART F — iOS-SPECIFIC WORK

| # | Item | Evidence | Effort |
|---|---|---|---|
| I1 | Configure **APNs** in EAS + `aps-environment` entitlement (required for M1 push on iOS) | no entitlement in `app.json:15-22` | ~0.5 day |
| I2 | Add proper `NSCameraUsageDescription` (currently generic plugin default → review risk) | `app.json:42-47` | ~15 min |
| I3 | Add native splash (`expo-splash-screen`) — currently blank white on cold start | no splash config | ~2 hrs |
| I4 | Remove unused `NSFaceIDUsageDescription` or actually use FaceID | `app.json:19` | ~15 min |
| I5 | **Physical iPhone + TestFlight testing** — payment return, push delivery, camera/photo permissions, RTL relaunch, keyboard on long forms | not code-verifiable | 1-2 days testing |

Verified-safe on iOS from code: SafeArea, Reanimated/worklets ordering, Gesture Handler, Hermes, AppState auto-refresh, session restore, build config (`bundleId`, `ascAppId`, encryption flag).

---

## PART G — EXECUTION SEQUENCE & TIMELINE

| Phase | Work | Effort |
|---|---|---|
| 1. Security-critical | B1, B2, B3, M2, M5, M6 | ~2-3 days |
| 2. Core features | M1 (push) + M4 (deep links → unlocks reset + payment return) + I1 (APNs) | ~4-6 days |
| 3. Hardening | B4, B6-B10 + error boundary + cleartext removal | ~2-3 days |
| 4. Offline | O1-O3 (read-only) | ~2 days |
| 5. Wiring cleanup | M8-M12 + resolve M3 (hide or build) + M7 decision | ~3-5 days |
| 6. iOS + release | I2-I5 + Android/iPhone device regression + TestFlight | ~3-5 days |

**Realistic total: ~3-4 weeks focused** (assuming big unfinished features like the real map are *hidden* for v1, not built).

**Minimum before soft-launch:** Phase 1 + M1(push or hide) + M4(deep links) + device testing of payment on both platforms + B5 SMS decision.

---

## PART H — RELEASE CHECKLIST (mobile + iOS)

**Security & correctness**
- ☐ B1 payment amount server-derived
- ☐ B2 symptom-check auth + rate limit
- ☐ B3 refund guard + atomicity + status
- ☐ B4 webhook signature
- ☐ B6-B10 hardening
- ☐ Global error boundary
- ☐ Cleartext removed / HTTPS-only
- ☐ `/security-review` + payment/auth pen-test

**Features wired**
- ☐ M1 push end-to-end (register + listeners + APNs)
- ☐ M4 deep links (reset + payment return + notification taps)
- ☐ M2 fake vitals removed
- ☐ M5 edit-profile save fix
- ☐ M6 rate button wired
- ☐ M3 assistant + map resolved (wired or hidden)
- ☐ M7 settings stubs resolved
- ☐ B5 SMS/OTP decision executed

**Offline**
- ☐ O1-O3 read-only offline + connectivity banner

**Device validation**
- ☐ Android full regression (auth, booking, payment return, image upload, records, localization+RTL relaunch, offline, session restore)
- ☐ iPhone physical testing (permissions, keyboard, RTL, splash)
- ☐ TestFlight (build, push/APNs, permission-string review)
- ☐ Payment round-trip verified on both platforms
- ☐ Notification receipt fg/bg/killed + tap routing
- ☐ Crash + performance testing
- ☐ Production env verified (env vars, HTTPS-only)

---

## Appendix — highest-ROI quick wins
1. `appointments/[id]/index.tsx:155` → `router.push(\`/rate/${id}\`)` — 15 min unlocks the whole rating flow.
2. B1 payment fix — 0.5 day closes the one real money vulnerability.
3. M4 deep links — 1-2 days fixes password reset + payment return + notification taps together.
4. M2 remove fake vitals — 1-2 hrs removes a clinical-integrity risk.
