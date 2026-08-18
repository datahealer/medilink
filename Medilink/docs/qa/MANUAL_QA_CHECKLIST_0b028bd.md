# MediLink — Manual QA Checklist (fresh builds, commit `0b028bd`)

**Builds under test**

| | Android | iOS |
|---|---|---|
| Profile | `preview` | `production` |
| Version | 1.0.0 | 1.0.0 |
| Build number | **1** ⚠️ (see note) | **11** |
| Artifact | APK (installable) | IPA (**store-signed — see BLOCKER**) |
| Distribution | INTERNAL | STORE |
| Commit | `0b028bd91960bb2ec808bef22a1355f64762e5a2` | same |
| Expo SDK | 54.0.0 | 54.0.0 |
| Build ID | `505edd85-dc6d-45d1-b966-56e7929ef062` | `8536e7ef-4e70-4e6c-92c9-e692deecf41d` |
| APP_ENV / DATA_MODE | staging / staging | production / production |

⚠️ **Android build number is still 1** — the `preview` profile has no `autoIncrement`, so this APK is
indistinguishable by version from the six 2026-08-13 builds. **Identify it by Build ID or by the commit
SHA shown in Settings → About**, never by version number.

🔴 **iOS is BLOCKED for device QA.** `production.distribution = "store"`, so the IPA is App-Store-signed
and **cannot be sideloaded**. It must be uploaded via `eas submit` before it appears in TestFlight, and
submission was explicitly out of scope. Every iOS row below is **BLOCKED** until that is authorised.

**Backend target:** the iOS build's URLs come from `eas.json` and are verified to point at
`medilink-backend-five.vercel.app` + the linked Supabase project. The **Android** build's URLs come only
from EAS environment variables which are stored as sensitive and could not be read here — **TEST 0
confirms them empirically.**

---

## How to record results

Mark each row **PASS** / **FAIL** / **BLOCKED** / **N/A**. Severity: **S1** blocks launch · **S2** major,
workaround exists · **S3** minor/cosmetic · **S4** nit.

A row is only PASS when observed **on the physical device**. Do not infer a pass from unit tests —
1,319 automated tests are green, and none of them prove hardware behaviour.

---

## TEST 0 — Build identity & backend target (do this first)

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| 0.1 | APK installs on a physical Android device | | | Installs, launches, no crash | | S1 |
| 0.2 | Settings → About shows commit `0b028bd` | | | Matches this build, not an Aug-13 one | | S1 |
| 0.3 | App does **not** crash on first launch | | | No `Missing required env var` error — proves API_URL/SUPABASE_URL resolved | | S1 |
| 0.4 | Sign-in reaches the deployed backend | | | Login succeeds ⇒ backend + Supabase URLs correct | | S1 |
| 0.5 | Seeded mock patient "Aisha Al Harthy" is **absent** | | | Real data only; mock mode would be a build-config failure | | S1 |
| 0.6 | `app/dev/*` routes unreachable | | | Gated off outside APP_ENV=development | | S2 |

---

## AUTH

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| A.1 | Email signup, new account | | | Account created, verification email arrives | | S1 |
| A.2 | Signup validation (name, civil no., phone, weak/blank password) | | | Field-specific errors; `00000000` rejected | | S2 |
| A.3 | Email + password login | | | Lands on dashboard | | S1 |
| A.4 | Wrong password | | | Clear error, no crash, no lockout loop | | S2 |
| A.5 | Login OTP email delivery | | | 6-digit code arrives (MED-004 was never closed) | | S1 |
| A.6 | Forgot password → 6-digit code → reset → login with new password | | | Full cycle works, no deep link needed | | S1 |
| A.7 | Logout | | | Returns to sign-in; session cleared | | S1 |
| A.8 | Session restore (kill app, relaunch) | | | Still signed in, no re-login | | S1 |
| A.9 | Remember Me across cold launch | | | Honoured | | S2 |
| A.10 | Fresh reinstall does **not** auto-login | | | Signed out (MED-010) | | S2 |
| A.11 | **HAMS staff account cannot sign in** | | | Rejected at the sign-in wall — shipped with no unit test | | S1 |
| A.12 | Phone number linking via SMS (Twilio Verify) | | | Code arrives, links, `phone_verified` set server-side | | S2 |
| A.13 | Google sign-in (Android only) | | | Works, or button hidden if unconfigured | | S3 |
| A.14 | Google sign-in hidden on iOS | | | Absent (Apple Guideline 4.8) | | S3 |
| A.15 | Account deletion → restore flow | | | Routes to restore screen, not sign-in | | S2 |

---

## DISCOVERY

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| D.1 | Doctor list loads real doctors | | | ~112 doctors, real names | | S1 |
| D.2 | Doctor search by name / specialty | | | Filters correctly | | S2 |
| D.3 | Specialty catalog | | | 9 specialties | | S2 |
| D.4 | Doctor detail: fees, rating, availability | | | Real values, no placeholders | | S1 |
| D.5 | Clinic/facility list + detail | | | ~52 facilities | | S2 |
| D.6 | "Available today" badge accuracy | | | Only when a real bookable slot exists today | | S2 |
| D.7 | Nearby clinics uses **device** location | | | Distances from your real position, not Muscat centroid | | S2 |
| D.8 | Location permission denied | | | Graceful fallback, no crash | | S2 |
| D.9 | Map renders, markers tappable | | | Interactive; marker → clinic | | S2 |
| D.10 | Directions opens native maps | | | Correct origin + destination | S3 | S3 |
| D.11 | Clinics outside coverage areas shown | | | Visible, not silently dropped | | S3 |
| D.12 | Favourites add/remove (doctors + clinics) | | | Persists across relaunch | | S3 |

---

## BOOKING

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| B.1 | Day strip shows **max 7 days** | | | Locked product decision | | S1 |
| B.2 | Elapsed slots today are **not** offered | | | Past times withheld (Oman time) | | S1 |
| B.3 | Slot picker shows real availability | | | Matches `get_available_slots` | | S1 |
| B.4 | Review screen: doctor, date/time, fee + 5% VAT | | | Total = fee × 1.05, 3 dp | | S1 |
| B.5 | Book for **self** | | | Appointment created as `pending` | | S1 |
| B.6 | Book for a **family member** | | | Correct attendee recorded | | S2 |
| B.7 | Booking a just-taken slot | | | "That time slot was just taken" — no double-book | | S1 |
| B.8 | Abandon checkout, return later | | | Hold expires; slot freed | | S2 |
| B.9 | Appointment detail after payment | | | Status **Confirmed** | | S1 |
| B.10 | Cancel appointment | | | Cancelled; refund tier per policy | | S1 |
| B.11 | Cancel cutoff uses **Oman** time | | | Not device timezone (money defect) | | S1 |
| B.12 | Reschedule to a new slot | | | Old slot freed, new one held | | S1 |
| B.13 | Reschedule screen in **Arabic/RTL** | | | Mirrored correctly (no `isRTL` in file by design) | | S2 |
| B.14 | Check-in at the clinic | | | Status → checked_in; queue item created | | S2 |
| B.15 | Live queue position + realtime updates | | | Updates without manual refresh, on mobile data | | S2 |
| B.16 | Upcoming excludes cancelled/past | | | Correct tab partitioning | | S2 |
| B.17 | Never-attended past appointment | | | Eventually `no_show` (nightly 02:00 Oman sweep) | | S3 |

---

## PAYMENTS

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| P.1 | Thawani checkout opens in-app WebView | | | Hosted page loads (no "Oops!" 404) | | S1 |
| P.2 | **Is it PRODUCTION or UAT Thawani?** | | | Confirm before taking real money | | S1 |
| P.3 | Successful card payment | | | Redirects to payment-success | | S1 |
| P.4 | 3-D Secure challenge | | | Completes inside the WebView | | S1 |
| P.5 | Amount charged = fee + 5% VAT | | | Matches review screen exactly | | S1 |
| P.6 | Appointment becomes Confirmed | | | Webhook or verify finalises it | | S1 |
| P.7 | Failed/declined card | | | Clear error; appointment stays pending | | S1 |
| P.8 | Cancel on the Thawani page | | | Returns to app; no phantom payment | | S2 |
| P.9 | Kill the app mid-payment, relaunch | | | Reconciles (verify poll) — no stuck "processing" | | S1 |
| P.10 | Paid-but-unconfirmed recovery | | | Retry/verify resolves it | | S1 |
| P.11 | No duplicate payment on double-tap | | | One session, one charge | | S1 |
| P.12 | Payment history lists the payment | | | Correct amount, status, date | | S1 |
| P.13 | Invoice PDF opens | | | Renders; short-lived signed URL | | S1 |
| P.14 | Invoice download / share | | | Real PDF attached, not a link | | S2 |
| P.15 | Invoice auto-filed to Document Vault | | | Appears once, no duplicates | | S2 |
| P.16 | **Another patient's invoice is inaccessible** | | | 404 — bucket is private + owner-scoped | | S1 |
| P.17 | Signed URL expires (~5 min) | | | Stale link fails | | S2 |
| P.18 | Receipt + confirmation email arrive | | | Link points at `/api/payments/.../invoice`, **not** `/storage/.../public/` | | S1 |
| P.19 | Refund reflected in history | | | Correct tier and amount | | S2 |
| P.20 | Payment-success page after a **real** payment | | | No 500 — checks `NEXT_PUBLIC_APP_URL` is set (known unguarded call site) | | S1 |

---

## PATIENT DATA

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| PD.1 | Profile shows real data | | | Name, email, civil no. masked appropriately | | S1 |
| PD.2 | Edit profile + photo upload | | | Persists; avatar opens picker | | S2 |
| PD.3 | Medical history (allergies, conditions) | | | Saves; tag validation enforced | | S2 |
| PD.4 | Add / edit / remove family member | | | Persists; validation enforced | S2 | S2 |
| PD.5 | Patient switcher | | | Switches context correctly | | S2 |
| PD.6 | Document Vault: upload | | | Appears in list | | S1 |
| PD.7 | Document view / download / share | | | Signed URL works | | S1 |
| PD.8 | **Another patient's document is inaccessible** | | | Denied — `patient_docs_owner_select` | | S1 |
| PD.9 | Legacy `docs/…` documents still open | | | 3 legacy objects must not be orphaned | | S2 |
| PD.10 | Prescriptions list + detail | | | Real data | | S2 |
| PD.11 | Prescription PDF download | | | Opens | | S2 |
| PD.12 | Lab results + analyte trends | | | Real values | | S2 |
| PD.13 | Data export request (GDPR) | | | Queues and completes | S3 | S3 |

---

## OTHER

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| O.1 | Push permission prompt | | | Appears once | | S2 |
| O.2 | **Push notification actually delivers** | | | Arrives on device (APNs/FCM unverified) | | S1 |
| O.3 | Notification tap deep-links to the right screen | | | Correct target | | S2 |
| O.4 | In-app notification list | | | Real notifications | | S2 |
| O.5 | Notification preference toggles persist | | | Saved server-side | | S3 |
| O.6 | ⚠️ SMS + appointment-reminder toggles | | | **Known gap: no sender exists.** Confirm they're hidden or accept dead toggles | | S2 |
| O.7 | Facility messages / announcements | | | Real announcements | | S3 |
| O.8 | AI symptom checker streams a reply | | | Live Groq response, urgency badge | | S2 |
| O.9 | AI chat retry after failure | | | Retry re-sends; no dead end | | S2 |
| O.10 | AI doctor recommendations + retry | | | Card retries in place | | S2 |
| O.11 | AI scheduling assistant | | | Returns real doctors + real slots; retry works | | S2 |
| O.12 | AI rate limit | | | Friendly message, not a crash | | S3 |
| O.13 | Guest mode: browse without signing in | | | Doctors/clinics/specialties visible | | S1 |
| O.14 | Guest hitting a patient area | | | Sign-in wall, no data leak | | S1 |
| O.15 | Guest → sign in → data appears | | | Smooth transition | | S2 |
| O.16 | Switch to Arabic | | | UI translates; restart prompt honoured | | S1 |
| O.17 | RTL layout across all main screens | | | Mirrored: headers, chevrons, day strip, slots, tabs | | S1 |
| O.18 | Arabic typography (29LT Zarid) | | | Renders; bold may look regular (known) | | S3 |
| O.19 | Arabic numerals + dates | | | Localised correctly | | S3 |
| O.20 | Dark mode across all screens | | | No unreadable/contrast bugs | | S2 |
| O.21 | Light/dark/system switching | | | Applies immediately | | S3 |
| O.22 | Loading states | | | Spinners/skeletons, never blank | | S2 |
| O.23 | Error states + retry | | | Especially `me`, `ai/assistant`, `ai/schedule` (newly added) | | S2 |
| O.24 | Empty states | | | Helpful copy, not a blank screen | | S3 |
| O.25 | Airplane mode mid-use | | | Clear offline error + retry, no crash | | S1 |
| O.26 | Recover when network returns | | | Retry succeeds | | S1 |
| O.27 | Slow/flaky 3G | | | No duplicate submissions or stuck spinners | | S2 |
| O.28 | Cold launch time | | | Splash → dashboard, reasonable | | S3 |
| O.29 | Background → foreground | | | State preserved; session valid | | S2 |
| O.30 | Rotation / tablet / Dynamic Island / safe areas | | | No clipping | | S3 |
| O.31 | No crash across a full 30-min session | | | Stable | | S1 |

---

## iOS-specific (ALL BLOCKED until `eas submit` is authorised)

| # | Test | Result | Observed | Expected | Screenshot | Sev |
|---|---|---|---|---|---|---|
| I.1 | Build appears in TestFlight | **BLOCKED** | store-signed IPA not uploaded | Visible as v1.0.0 (11) | | S1 |
| I.2 | Installs from TestFlight | **BLOCKED** | | Installs and launches | | S1 |
| I.3 | Then re-run **every** row above on iOS | **BLOCKED** | | Parity with Android | | S1 |
| I.4 | `PrivacyInfo.xcprivacy` emitted | **BLOCKED** | | Present | | S2 |
| I.5 | App Privacy questionnaire (health data) | **BLOCKED** | | Completed in ASC | | S1 |

---

## Sign-off

| | |
|---|---|
| Tester | |
| Device / OS (Android) | |
| Device / OS (iOS) | |
| Date | |
| Android build ID | `505edd85-dc6d-45d1-b966-56e7929ef062` |
| iOS build ID | `8536e7ef-4e70-4e6c-92c9-e692deecf41d` |
| Commit | `0b028bd` |
| S1 failures | |
| Verdict | GO / NO-GO |
