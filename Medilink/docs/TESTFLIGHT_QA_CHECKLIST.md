# MediLink Mobile — TestFlight Production QA Audit & Checklist

**Date:** 2026-07-23 · **Build target:** iOS TestFlight · **Branch:** `runtime-rtl` (HEAD `5f95325`)
**Basis:** current repository — route tree (`mobile/app/`), data wiring (`mobile/src/data/index.ts`), EAS config (`eas.json`), app config (`app.json`). Not guesses.

> ⚠️ **#1 BUILD RULE — build with the `production` EAS profile.**
> Only `eas.json → build.production` carries the real env (`EXPO_PUBLIC_DATA_MODE=production`, live Supabase, live Vercel backend). The `preview` and `development` profiles have **empty env**, so a build made from them defaults to **`mock`** and the entire app becomes fake in-memory data. **Build command:** `eas build -p ios --profile production`.

---

# PART 1 — Completion Audit

Legend: ✅ production-ready · 🟡 partial · ❌ not implemented · ⛔ intentionally deferred · ⚠ depends on backend/deploy/config

| # | Feature / Screen | Status | Evidence & Notes |
|---|---|---|---|
| 1 | **Auth — email sign-up** | ✅ | `real.auth` (backend signup). |
| 2 | **Auth — email login** | ✅ | `real.auth.signIn`. |
| 3 | **Auth — Email OTP login** | ✅ | `auth/otp.tsx`, real backend OTP. |
| 4 | **Auth — Remember Me / session restore** | ✅ | Bearer token in `expo-secure-store`. |
| 5 | **Auth — logout** | ✅ | Clears session + push token cleanup. |
| 6 | **Auth — invalid credentials** | ✅ | Error surfaced on sign-in. |
| 7 | **Auth — forgot password (send)** | ✅ | Email send is real. |
| 8 | **Auth — forgot password (completion)** | ⛔ | **Known gap** — no deep-link recovery session wired (`CLAUDE.md`). Send works; reset completion does not. |
| 9 | **Auth — Google sign-in** | ⛔ | Permanently disabled client-side (no backend/client IDs). |
| 10 | **Onboarding / splash / welcome / language** | ✅ | `splash`, `welcome`, `onboarding`, `language` screens. |
| 11 | **Guest Mode** | ✅ | Browse discovery; login wall on gated actions; guest "Me" hub. |
| 12 | **Dashboard** | ✅ | Real: featured clinics, recent doctors, upcoming appointments. |
| 13 | **Search — doctor** | ✅ | `real.doctor.search`. |
| 14 | **Search — specialty filters** | ✅ | `real.discovery.listSpecialties` + `search/filters` sheet. |
| 15 | **Search — clinic** | 🟡 | Featured/nearby clinics real; verify full free-text clinic search coverage. |
| 16 | **Maps** | ✅⚠ | Real `useNearbyClinics` + `react-native-maps` (Apple Maps via `PROVIDER_DEFAULT`). ⚠ Centered on a **fixed Muscat coordinate**, not device GPS. ⚠ Requires facilities to have coordinates in the live DB (geocoding) + `get_nearby_facilities` RPC deployed. |
| 17 | **Doctor Details** | ✅ | Real info, fees, availability, `doctor.reviews`. |
| 18 | **Booking — slots / review / success** | ✅ | Real `appointment` (slots, book, holds). |
| 19 | **Booking — family member** | ✅ | Book for family member. |
| 20 | **Booking — reason for visit** | ✅⚠ | New today. ⚠ Booking **with a reason** needs `20260725000000_book_appointment_reason.sql` deployed to live Supabase; booking without a reason works regardless. |
| 21 | **Booking — emergency toggle** | ✅ | `p_is_emergency`. |
| 22 | **Payments — summary / Thawani / success / fail / cancel** | ✅⚠ | Real Thawani checkout + verify. ⚠ Depends on backend + Thawani keys. Return trip relies on `medilink://` scheme. |
| 23 | **Payments — invoice generation** | ✅ | Real invoice + filed into Document Vault. |
| 24 | **Payments — history** | ✅ | `payments/index`. |
| 25 | **Appointments — upcoming/past/details** | ✅ | Real. |
| 26 | **Appointments — cancel / reschedule** | ✅ | Real (cutoff/refund side-effects server-side). |
| 27 | **Medical Records — upload image** | ✅ | Real Document Vault (bucket + `patient_documents`). |
| 28 | **Medical Records — upload PDF** | ✅ | New today (`expo-document-picker`). |
| 29 | **Medical Records — MIME handling** | ✅ | New today (`utils/mime.ts`). |
| 30 | **Medical Records — view / download / delete** | ✅ | Real. |
| 31 | **Lab Reports — list / detail** | ✅ | Real (`lab_results` + analytes). |
| 32 | **Lab Trend Charts** | ✅ | New today (`TrendChart.tsx`, SVG). |
| 33 | **Prescriptions** | ✅ | Real list/detail (one sub-stub hidden in `018ac9f` — verify nothing dangling). |
| 34 | **Notifications — list / mark read / mark all** | ✅ | Real. |
| 35 | **Notifications — facility messages** | ✅ | Real. |
| 36 | **Profile — edit / validation / photo / blood group** | ✅ | Real `patient`; validation new today (name/phone/DOB). |
| 37 | **Family Members — add/edit/delete/switch** | ✅ | Real. |
| 38 | **Medical History** | ✅ | Real. |
| 39 | **Settings — appearance / notification prefs** | ✅⚠ | Appearance ✅. Notif prefs ⚠ needs `notification_preferences` table on live. |
| 40 | **Localization EN / AR** | ✅ | Typed parity (`ar.ts` ⟶ `en.ts` via `Leaves<Messages>`). |
| 41 | **RTL** | ✅ | Runtime RTL (this branch's `be1d3f9` — instant switch, no restart). |
| 42 | **Offline Support** | ✅ | Read-only: `OfflineBanner` + persisted React Query cache + retry. |
| 43 | **Push Notifications** | 🟡⚠ | Client done (`usePushNotifications`, `device_tokens` upsert, tap routing). ⚠ Needs `device_tokens` table on live + **APNs/EAS credentials** + a **physical device** (cannot verify in Simulator). |
| 44 | **Deep Links** | 🟡 | `medilink://` custom scheme works; **no Universal Links** (`associatedDomains` absent in `app.json`). Password-reset link blocked (see #8). |
| 45 | **AI — recommendations / visit summary** | ✅ | Real (`real.ai`). |
| 46 | **AI — symptom-checker chat** | ⛔ | Intentionally static transcript (product decision). |
| 47 | **AI — Insights (vitals trend)** | ⛔ | Intentionally static chart (product decision). |

### Completion percentages
- **Mobile code completion:** ~**97%** (all patient-journey features implemented; the only non-implemented items are *intentionally deferred* — forgot-password completion, static AI symptom checker/insights, Universal Links).
- **Overall product completion (incl. deploy/config):** ~**90%** — gated by the deployment/config items below, not by missing code.

### Remaining work (code)
- None blocking. Optional: wire device GPS into Maps; Universal Links; forgot-password deep-link completion; make AI symptom checker/insights dynamic.

### 🚫 Production blockers to VERIFY before TestFlight (deployment/config, not code)
1. **Build with `--profile production`** (else mock data ships). ← hard rule.
2. **Live Supabase migrations applied** — `db:push` for today's three: `nearby_facilities_coords`, `facility_structured_address`, `book_appointment_reason`. Without them: Map may be empty and booking-with-reason fails.
3. **`geocode-facility` edge function deployed** + facilities geocoded — else Map has no pins.
4. **`device_tokens` + `notification_preferences` tables exist on live** — else push registration & notif prefs fail.
5. **APNs key / push credentials configured in EAS** — else push never arrives.
6. **`ios.buildNumber` / EAS auto-increment** set (app.json has no explicit buildNumber; EAS `production` should auto-increment — confirm).
7. **iOS permission strings** — camera/photo provided by the `expo-image-picker` plugin defaults; confirm they read acceptably in the App Store privacy prompt.

---

# PART 2 — Manual QA Checklist (TestFlight)

> For each: perform the actions, compare to Expected, tick Pass/Fail. Assume build = `production` profile, real backend, signed-in test patient unless a test says "guest".

## A. Authentication
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| AUTH-01 | Fresh install | Open app | Splash → onboarding/welcome (first run) then sign-in | ☐ |
| AUTH-02 | On sign-up | Enter valid new email + details, submit | Account created; OTP or session issued; lands on dashboard | ☐ |
| AUTH-03 | Registered user | Email + correct password → Login | Dashboard loads with real data | ☐ |
| AUTH-04 | On login | Enter wrong password | Clear inline error; no crash | ☐ |
| AUTH-05 | On login | Enable **Remember Me**, login, force-quit, reopen | Session restored → dashboard, no re-login | ☐ |
| AUTH-06 | Logged in | Profile → Logout | Returns to sign-in; token cleared | ☐ |
| AUTH-07 | On sign-in | Tap **Forgot password**, submit email | "Email sent" confirmation | ☐ |
| AUTH-08 | Received reset email | Tap the reset link | ⚠ **Known gap** — completion not wired; expect it NOT to complete in-app | ☐ |
| AUTH-09 | OTP login enabled | Request Email OTP, enter code | Signs in | ☐ |
| AUTH-10 | — | Confirm **Google sign-in** is hidden/disabled | Not offered | ☐ |

## B. Guest Mode
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| GUEST-01 | Not signed in | Continue as guest | Discovery browsable (dashboard/search/doctors) | ☐ |
| GUEST-02 | Guest | Attempt to book / view records | Professional login wall prompt | ☐ |
| GUEST-03 | Guest | Open "Me" tab | Guest hub (account-free prefs), no crash | ☐ |
| GUEST-04 | Guest | Sign in from wall | Returns to intended action after auth | ☐ |

## C. Dashboard
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| DASH-01 | Signed in | Open Dashboard | Upcoming appointments, featured clinics, recent doctors render (real) | ☐ |
| DASH-02 | Dashboard | Pull to refresh | Data refetches; spinner then updated content | ☐ |
| DASH-03 | Slow network | Open Dashboard | Loading skeletons/states show, not blank | ☐ |
| DASH-04 | Dashboard | Tap a featured clinic / recent doctor | Navigates to correct detail | ☐ |

## D. Search
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| SRCH-01 | Search tab | Type a doctor name | Matching doctors listed | ☐ |
| SRCH-02 | Search | Open filters, pick a specialty | Results filtered | ☐ |
| SRCH-03 | Search | Query with no matches | Empty state (not error/blank) | ☐ |
| SRCH-04 | Search | Scroll long results | Pagination/lazy load works, no dupes | ☐ |
| SRCH-05 | App in Arabic | Search in Arabic terms | Correct results; RTL layout | ☐ |
| SRCH-06 | App in English | Search in English | Correct results | ☐ |

## E. Maps
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| MAP-01 | Facilities geocoded on live | Open Map (from search) | Apple Map renders, centered on Muscat | ☐ |
| MAP-02 | Map open | Observe markers | Clinic markers appear (⚠ empty if facilities not geocoded) | ☐ |
| MAP-03 | Map | Tap a marker | Clinic callout/detail | ☐ |
| MAP-04 | Map | Pinch zoom / pan | Smooth; no crash | ☐ |
| MAP-05 | Map | Tap through to a clinic | Correct clinic detail | ☐ |
| MAP-06 | — | Note: user-location centering | ⚠ Not implemented — map uses fixed Muscat center | ☐ |

## F. Doctor Details
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| DOC-01 | Open a doctor | View profile | Name, specialty, clinic, fees, avatar (real) | ☐ |
| DOC-02 | Doctor | Open reviews | Real reviews list | ☐ |
| DOC-03 | Doctor | Check availability | Real slots surface | ☐ |
| DOC-04 | Doctor | Tap **Book** | Enters booking flow | ☐ |
| DOC-05 | Arabic | Reopen doctor | Localized names/labels, RTL | ☐ |

## G. Booking
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| BOOK-01 | In booking | Pick a slot | Slot selected; unavailable ones blocked | ☐ |
| BOOK-02 | Has family member | Book for a family member | Correct patient attached | ☐ |
| BOOK-03 | Migration deployed | Enter a **reason for visit** | Accepted; passed to booking | ☐ |
| BOOK-04 | Booking | Toggle **Emergency** | Flag applied | ☐ |
| BOOK-05 | Booking | Reach Review screen | Summary correct (doctor/slot/patient/reason/fee) | ☐ |
| BOOK-06 | Review | Confirm | Success screen; appointment created | ☐ |
| BOOK-07 | Try double-book same slot | Book a taken slot | Rejected gracefully (server guard) | ☐ |
| BOOK-08 | After booking | Return to appointments | New booking appears (refresh) | ☐ |

## H. Payments
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| PAY-01 | Booking needs payment | View payment summary | Correct amount (server-computed) | ☐ |
| PAY-02 | Pay | Proceed to Thawani | In-app WebView checkout opens | ☐ |
| PAY-03 | Thawani | Complete payment | Returns to app; success screen | ☐ |
| PAY-04 | Thawani | Simulate failure | Failure handled; retry offered | ☐ |
| PAY-05 | Thawani | Cancel/close checkout | Hold released; back to booking, no ghost appointment | ☐ |
| PAY-06 | After success | Check invoice | Invoice generated + in Document Vault | ☐ |
| PAY-07 | Payments tab | View history | Past payments listed | ☐ |

## I. Appointments
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| APPT-01 | Has appointments | Open Upcoming | Correct upcoming list | ☐ |
| APPT-02 | — | Open Past | Correct past list | ☐ |
| APPT-03 | Open one | View details | Full detail correct | ☐ |
| APPT-04 | Eligible appt | Cancel | Cancelled; refund/cutoff rules apply | ☐ |
| APPT-05 | Eligible appt | Reschedule to new slot | Moved atomically | ☐ |
| APPT-06 | After actions | Refresh | Status updates reflected | ☐ |

## J. Medical Records
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| REC-01 | Records tab | Upload an **image** | Uploads; appears in vault | ☐ |
| REC-02 | Records | Upload a **PDF** | Uploads; correct type icon | ☐ |
| REC-03 | Records | Try an unsupported file | Rejected with message | ☐ |
| REC-04 | Has doc | Open/view document | Renders (image/PDF) | ☐ |
| REC-05 | Has doc | Download/share | Works via share sheet | ☐ |
| REC-06 | Has doc | Delete | Removed from vault | ☐ |

## K. Labs
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| LAB-01 | Has lab results | Open Labs list | Reports listed | ☐ |
| LAB-02 | Open a report | View detail | Analytes + values/status | ☐ |
| LAB-03 | Analyte w/ history | View **trend chart** | Chart renders with points | ☐ |
| LAB-04 | New analyte (1 value) | View trend | Graceful single-point / empty-history state | ☐ |
| LAB-05 | Arabic | Reopen labs | Localized labels, RTL chart axis sensible | ☐ |

## L. Notifications
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| NOTIF-01 | Has notifications | Open list | Real notifications listed | ☐ |
| NOTIF-02 | Unread item | Tap to mark read | Marked read | ☐ |
| NOTIF-03 | Several unread | Mark all read | All cleared | ☐ |
| NOTIF-04 | Facility message exists | Open messages | Renders; mark-read works | ☐ |

## M. Push Notifications *(physical device only)*
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| PUSH-01 | Device, perms granted, APNs configured | Login | OS permission prompt; token upserted to `device_tokens` | ☐ |
| PUSH-02 | Backend can dispatch | Trigger a push (e.g., appointment update) | Notification arrives | ☐ |
| PUSH-03 | Push received | Tap it | Opens the correct screen (deep-link routing) | ☐ |
| PUSH-04 | Logout | Sign out | Token removed | ☐ |

## N. Profile / Family / Medical History
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| PROF-01 | Profile | Edit name | Saved | ☐ |
| PROF-02 | Edit | Enter invalid phone | Validation error (Oman format) | ☐ |
| PROF-03 | Edit | Enter invalid/future DOB | Validation error | ☐ |
| PROF-04 | Edit | Change blood group | Saved | ☐ |
| PROF-05 | Edit | Change profile photo | Uploads + displays | ☐ |
| FAM-01 | Family | Add member | Created | ☐ |
| FAM-02 | Family | Edit member | Updated | ☐ |
| FAM-03 | Family | Delete member | Removed | ☐ |
| FAM-04 | Multi-patient | Switch active patient | Context switches everywhere | ☐ |
| MH-01 | Medical History | Add/edit allergy/condition | Saved; safety copy shown | ☐ |

## O. Settings
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| SET-01 | Settings | Change appearance (light/dark/system) | Applies immediately | ☐ |
| SET-02 | Settings | Toggle notification prefs | Persisted (⚠ needs table on live) | ☐ |

## P. Localization / RTL
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| I18N-01 | Any screen | Switch to Arabic | UI text Arabic; **layout flips RTL immediately** (runtime RTL) | ☐ |
| I18N-02 | Arabic | Walk every major screen | Text alignment, back arrows, tab bar mirror correctly | ☐ |
| I18N-03 | Arabic | Check numbers/dates | Render correctly | ☐ |
| I18N-04 | Arabic | Maps + charts | Usable, not broken by RTL | ☐ |
| I18N-05 | Switch back to English | Everything | Returns to LTR cleanly | ☐ |

## Q. Offline Support
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| OFF-01 | Loaded data, then Airplane Mode | Reopen a cached screen | Cached data shows + offline banner | ☐ |
| OFF-02 | Offline | Attempt a write (book/upload) | Blocked/queued gracefully, clear message | ☐ |
| OFF-03 | Re-enable network | Interact | Banner clears; data refetches | ☐ |

## R. AI
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| AI-01 | AI recommendations | Open | Real recommendations render | ☐ |
| AI-02 | Visit summary | Generate/view | Real summary | ☐ |
| AI-03 | Symptom checker | Open | ⛔ Static demo transcript (expected) | ☐ |
| AI-04 | Insights | Open | ⛔ Static vitals chart (expected) | ☐ |

## S. Deep Links
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| DL-01 | App installed | Open `medilink://` route (e.g., appointment) | Opens correct screen | ☐ |
| DL-02 | Payment return | Complete Thawani | `medilink://` return routes to success | ☐ |
| DL-03 | https:// link | Tap a web URL | ⚠ No Universal Links — expect NOT to open app | ☐ |

## T. Error Handling / Permissions
| ID | Preconditions | Actions | Expected | P/F |
|---|---|---|---|---|
| ERR-01 | Any list | Trigger backend error | Friendly error + retry, no crash | ☐ |
| ERR-02 | Empty account | View lists (appts/records/labs) | Proper empty states | ☐ |
| ERR-03 | Deny camera | Try photo upload | Graceful prompt to enable | ☐ |
| ERR-04 | Deny photo library | Try image upload | Graceful message | ☐ |
| ERR-05 | Deny notifications | Login | No crash; push simply inactive | ☐ |
| ERR-06 | Deny/disable location | Open Map | Map still renders (fixed center); no crash | ☐ |

---

# PART 3 — Regression Tests (today's work must not break older flows)

| ID | Area | Check | Expected | P/F |
|---|---|---|---|---|
| REG-01 | Maps (new) | Booking flow from a map-discovered clinic | End-to-end booking still works | ☐ |
| REG-02 | Booking reason (new) | Book **without** a reason | Succeeds (reason optional) | ☐ |
| REG-03 | Booking reason (new) | Book **with** a reason | Succeeds (migration deployed) | ☐ |
| REG-04 | Payments | Full pay → invoice → history after booking changes | Unbroken | ☐ |
| REG-05 | PDF upload (new) | Upload PDF **and** image in same session | Both work; correct MIME/icons | ☐ |
| REG-06 | Profile validation (new) | Save a **valid** profile | Still saves (validation not over-strict) | ☐ |
| REG-07 | Lab charts (new) | Open labs without trend history | No crash; graceful state | ☐ |
| REG-08 | Records cleanup (`018ac9f`) | Prescriptions + settings screens | No dead links to removed check-in/stubs | ☐ |
| REG-09 | Appointments | Cancel/reschedule after new booking-reason field | Unaffected | ☐ |
| REG-10 | i18n | New strings (map, labs, validation) exist in **both** en & ar | No raw-key fallback text visible in Arabic | ☐ |

---

# PART 4 — iOS-Specific (TestFlight)

| ID | Check | Expected | P/F |
|---|---|---|---|
| IOS-01 | **Safe Area** | No content under status bar / home indicator on any screen | ☐ |
| IOS-02 | **Dynamic Island / notch** (14 Pro+/15/16) | Headers clear the island; no overlap | ☐ |
| IOS-03 | **Keyboard** | Fields scroll into view; no covered inputs; dismiss works | ☐ |
| IOS-04 | **Dark Mode** | Toggle system dark; palette correct (no unreadable text) | ☐ |
| IOS-05 | **Orientation** | App behaves per intended lock (portrait); no broken landscape | ☐ |
| IOS-06 | **Dynamic Type / font scaling** | Larger text setting: no clipped/overlapping critical text | ☐ |
| IOS-07 | **Permission dialogs** | Camera/Photos/Notifications prompts show clear purpose strings | ☐ |
| IOS-08 | **Apple Maps** | Map (`PROVIDER_DEFAULT`) renders as Apple Maps; markers OK | ☐ |
| IOS-09 | **Background/foreground** | Background during payment/booking, return → state intact | ☐ |
| IOS-10 | **Memory** | Heavy use (many screens, uploads) → no crash/OOM | ☐ |
| IOS-11 | **Cold start** | Launch from killed state → splash → correct entry | ☐ |
| IOS-12 | **Build metadata** | Version/build number valid in TestFlight; encryption compliance answered (`ITSAppUsesNonExemptEncryption` set) | ☐ |

---

# PART 5 — Final Release Decision

## ✅ READY FOR TESTFLIGHT — **~88% confidence**, contingent on the deployment checklist below

**Why ready:** All patient-journey features are implemented and wired to the real backend in the `production` profile (auth, dashboard, search, maps, doctors, booking, payments, appointments, records, labs, notifications, profile, family, history, settings, i18n/RTL, offline). Code gates are green (typecheck ×4, mobile lint, security clean). TestFlight is a *testing* channel, and the remaining gaps are either intentional product decisions or standard deploy/config steps — appropriate to validate on-device.

### ⚠️ MUST verify before you upload (or specific features will silently break — not crash):
1. **Build with `eas build -p ios --profile production`** — the *only* profile with real env. (Preview/dev = mock.)
2. **Apply today's 3 migrations to live Supabase** (`db:push`): booking-reason, nearby-coords, structured-address. *Without them:* booking-with-reason fails; Map is empty.
3. **Deploy `geocode-facility` edge function** + geocode existing facilities — else Map shows no pins.
4. **Confirm `device_tokens` + `notification_preferences` tables exist on live** — else push + notif prefs fail.
5. **Configure APNs push credentials in EAS** — else push never arrives (test PUSH-* on a real device).
6. **Confirm build number** increments for TestFlight.

### Known limitations testers should expect (NOT blockers for a test build):
- Forgot-password **completion** doesn't work (email send does).
- Google sign-in absent (by design).
- Maps centers on **Muscat**, not device location.
- AI **symptom checker** and **Insights** are static demos (by design).
- **Universal Links** (https) not configured — only `medilink://`.

### It would be ❌ NOT READY only if:
- The build is made from `preview`/`development` (ships mock), **or**
- The live migrations above are not applied (core Map/booking-reason break), **or**
- A crash appears in the smoke path (AUTH → DASH → BOOK → PAY → REC).

> **Recommended pre-flight smoke test (do these 6 first on the actual build):** AUTH-03 → DASH-01 → SRCH-01 → BOOK-06 → PAY-03 → REC-02. If all pass on the `production` build with migrations applied, proceed with full TestFlight distribution.
