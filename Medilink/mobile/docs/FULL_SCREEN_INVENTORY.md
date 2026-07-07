# MediLink Mobile — Full Screen Inventory

**Source of truth:** `MediLink_Design_Documentation.pdf` (Brand Identity v1.0, 17 Jun 2026).
**Exact count:** the PDF renders **50 unique screen/state artboards across 16 flows** (cover
states "16 flows · 50 screens"; the EN-Light gallery pp.36–40 lists 12+12+12+12+2 = **50**;
the annotated catalogue pp.10–34 enumerates the same 50). Each of the 50 is delivered in **4
variants** — EN-Light, EN-Dark, AR-Light, AR-Dark = **200 rendered frames**. This inventory
tracks the **50 unique screens/states** (variants are a per-screen QA matrix, not extra rows).

In-screen sub-states the PDF *describes in KEY FEATURES* but does not render as separate
artboards (empty / loading / error / no-results) are listed in **§3**, and the component-level
Me-submark states (PDF p7) in **§4** — so every state is captured without inventing screens.

## Status legend
- `NOT BUILT` — no real screen (a "coming soon" placeholder route does **not** count as built).
- `BUILT BUT VISUALLY WRONG` — exists but has known structural deviations from the PDF.
- `BUILT BUT INCOMPLETE` — structurally close to the PDF but unverified on device and/or has gaps.
- `BUILT AND MATCHES` — **reserved**; cannot be assigned until a real-device screenshot is
  captured and compared (no device/emulator available in this environment — see §5).
- `BLOCKED BY MISSING ASSET/FONT` — needs an asset/font that is absent (see `BRAND_ASSET_AUDIT.md`,
  `FONT_AUDIT.md`).

> **Visual-match honesty note:** every "Visual match?" verdict below is a **code/structure-level**
> comparison against the PDF image. None has been confirmed by a running-device screenshot yet,
> so no row is marked `BUILT AND MATCHES`. Brand assets (Me mark, wordmark, AR wordmark PNGs) and
> all fonts (Agatho, Manrope, Zarid Sans) are **present** — there are currently **no** asset/font
> blockers.

---

## Batch 1 update (2026-06-23)

All Batch-1 work is done and verified (typecheck 0, lint 0, Android Hermes export OK).
**No screen is yet `BUILT AND MATCHES`** — that still requires the device screenshots in
`docs/BATCH1_SCREENSHOT_CHECKLIST.md`. What changed:

**Existing screens fixed to the PDF (now structurally matching; still `BUILT BUT INCOMPLETE`
pending device capture):**
- **Dashboard #9** — rebuilt: "Me Care Hub" + Customize with the correct tiles (Me Assistant /
  Book / Lab results / Me Vault); search bar navigates to `/search`; Upcoming card has Check-in
  + Reschedule; specialties are tappable; added Recently visited + Featured clinics (mock data).
- **Welcome #2** — removed top-bar language/theme controls; "I already have an account" is now a
  plain text link; brand hero retained.
- **Onboarding #3** — emoji replaced with the brand **Me-circle** illustration (official Me submark).
- **Profile #11** — removed Sign-out + "View medical history" link; added a Settings gear (Settings
  now owns sign-out, per PDF p34).
- **Sign In #5** — added "Continue with Apple" (disabled/honest, like Google).
- **Sign Up #6** — removed the non-PDF Confirm-Password field (+ schema).
- **Me Family #13** — header now "Me Family"; removed the non-PDF "Switch active patient" link.
- **Add Family #14** — added the "Add a Me profile" Me-mark photo placeholder.
- **Edit Profile #12** — added inline removable Allergies chips + add (PDF p15); PDF field order first.

**New this batch:**
- **Settings #49** — built for real (account, preferences, account & data, **Sign out** + Delete).
- **All 35 unbuilt screens** now have **correctly-named routes** rendering a branded, PDF-styled
  `ScreenPreview` (Me submark, theme tokens, PDF page ref) — so every flow is reachable/tappable.
  They remain `NOT BUILT` (preview placeholder; real build in the scheduled batch).
- **Dev Screen Gallery** at `app/dev/screen-gallery.tsx` (gated by `EXPO_PUBLIC_APP_ENV=development`)
  lists all 50 and opens each directly. Reachable on device via the **grid icon** in the Dashboard
  header (dev-only). Registry: `src/dev/screenRegistry.ts`.
- **Search #16 / Me Vault #37 tabs** now render their PDF-styled previews (no more generic stub).
- Mock data added: `discovery` (doctors, clinics, specialties) for the dashboard.

---

## Batch 2 update (2026-06-23)

9 real, functional screens built with typed mock data (no ScreenPreview), replacing their
preview routes. Verified: typecheck 0, lint 0, Android Hermes export OK. **Still pending device
screenshots** (see `docs/BATCH2_SCREENSHOT_CHECKLIST.md`) — none marked `BUILT AND MATCHES`.

| # | Screen | PDF | Route | Notes |
|--:|---|--:|---|---|
| 16 | Search & Results | 17 | `/search` (tab) | query + quick chips + filter/map header, ranked cards, loading/empty/error/populated |
| 17 | Filters | 18 | `/search/filters` (modal) | specialty/gender/fee/rating, live "Show N results"; fee via chips (no slider dep) |
| 18 | Specialty Categories | 18 | `/search/specialties` | searchable 3-col grid → sets filter → results |
| 19 | Map View | 19 | `/search/map` | branded static map surface + fee pins + bottom doctor card (**no maps SDK**) |
| 20 | Doctor Details | 19 | `/doctors/[id]` | hero, stats, about, languages, slots, sticky Book bar, reviews link |
| 21 | Doctor Reviews | 20 | `/doctors/[id]/reviews` | average + distribution bars + review list |
| 44 | Notification Center | 31 | `/notifications` | Today/Earlier, typed icons, unread, Mark all |
| 45 | Facility Messages | 32 | `/notifications/messages` | admin updates list, source icons, unread |
| 46 | Notification Preferences | 32 | `/settings/notifications` | per-category Switches + Push/Email/SMS chips |

**Mock data added:** doctor catalogue (5 doctors, full profiles), reviews, map clinics,
notifications (5), facility messages (4), notification prefs (mutable) — `DoctorRepository` +
`NotificationRepository` (mock + honest empty real stubs), hooks `useDoctors`/`useNotifications`,
and `searchFilterStore` (zustand). Specialty list expanded to 9 (PDF p18 grid).

**Reachability:** Dashboard search/specialty chips/bell → Search/Specialties/Notifications;
Search → Filters (modal), Map, Doctor Details (Book/Profile); Doctor Details → Reviews + Booking
(preview); Notifications → Facility Messages; Settings → Notification Preferences; all 9 also in
the dev Screen Gallery (now marked **Built**).

**Two honest approximations (no native dep installed):** the Filters **fee** uses chip caps
instead of a drag slider; the **Map** is a branded static surface with positioned pins, not a
live map provider. Both are flagged to upgrade when those libs/backends are added.

---

## §1 — The 50 PDF screens

| # | PDF page | Screen / state name | Flow / module | Required Expo route / component | Existing? | Visual match? | Backend needed later? | Status |
|--:|--:|---|---|---|---|---|---|---|
| 1 | 10 / 36 | Splash | 01 Splash & Onboarding | `app/splash.tsx` | Yes | Close (mark+wordmark+tagline+progress) | No (session restore only) | BUILT BUT INCOMPLETE |
| 2 | 10 / 36 | Welcome | 01 Splash & Onboarding | `app/welcome.tsx` | Yes | Off — extra top-bar lang/theme controls not in PDF; secondary should be a plain text link "I already have an account" not a ghost button | No | BUILT BUT VISUALLY WRONG |
| 3 | 11 / 36 | Onboarding carousel | 01 Splash & Onboarding | `app/onboarding.tsx` | Yes | Off — uses emoji (🔎📅📁) instead of brand illustration/Me-circle hero | No | BUILT BUT VISUALLY WRONG |
| 4 | 11 / 36 | Language selection | 01 Splash & Onboarding | `app/language.tsx` | Yes | Close (EN/AR cards + Continue) | No | BUILT BUT INCOMPLETE |
| 5 | 12 / 36 | Sign In | 01 Splash & Onboarding | `app/auth/sign-in.tsx` | Yes | Off — missing "Continue with Apple"; PDF shows both Google **and** Apple | Yes (auth — done in real repo) | BUILT BUT INCOMPLETE |
| 6 | 12 / 36 | Sign Up | 01 Splash & Onboarding | `app/auth/sign-up.tsx` | Yes | Off — adds a Confirm-Password field the PDF doesn't show (single PASSWORD field) | Yes (auth — done) | BUILT BUT INCOMPLETE |
| 7 | 13 / 36 | OTP Verification | 01 Splash & Onboarding | `app/auth/otp.tsx` | Yes | Close (6-cell + resend 0:24 + Verify) | Yes (SMS — blocked, mocked) | BUILT BUT INCOMPLETE |
| 8 | 13 / 36 | Forgot / Reset Password | 01 Splash & Onboarding | `app/auth/forgot-password.tsx` + `app/auth/reset-password.tsx` | Yes | Close (reset has strength meter; forgot has email+sent state) | Yes (reset deep-link — blocked) | BUILT BUT INCOMPLETE |
| 9 | 14 / 36 | Patient Dashboard | 02 Home Dashboard | `app/(app)/(tabs)/dashboard.tsx` | Yes | **WRONG** — quick actions are Profile/Family/Records/Labs, PDF "Me Care Hub" = AI Assistant / Book / Lab results / Me Vault + "Customize"; search disabled (should navigate); Upcoming card missing Check-in/Reschedule; specialties are "coming soon" not tappable | Yes (appointments) | BUILT BUT VISUALLY WRONG |
| 10 | 14 / 36 | Recents & Featured | 02 Home Dashboard | dashboard scroll section (recents + featured clinics) | No | — | Yes (doctors, clinics) | NOT BUILT |
| 11 | 15 / 36 | Personal Information (Profile) | 03 Patient Profile | `app/(app)/(tabs)/profile.tsx` | Yes | Off — adds Sign-out button + "View medical history" link not in PDF profile (sign-out lives in Settings p34) | Yes (profile — done) | BUILT BUT VISUALLY WRONG |
| 12 | 15 / 36 | Edit Profile | 03 Patient Profile | `app/(app)/edit-profile.tsx` | Yes | Off — PDF edits Name/Blood group/DOB/**Allergies (inline removable chips)**; current omits inline allergies and adds phone/gender/address/emergency | Yes (profile — done) | BUILT BUT INCOMPLETE |
| 13 | 16 / 37 | Family Members (Me Family) | 04 Family Management | `app/(app)/(tabs)/me.tsx` | Yes | Close — verify header reads "Me Family"; "Switch patient" link is an addition | Yes (family — done) | BUILT BUT INCOMPLETE |
| 14 | 16 / 37 | Add Family Member | 04 Family Management | `app/(app)/family/add.tsx` | Yes | Off — missing the "Add a Me profile" Me-mark photo placeholder header | Yes (family — done) | BUILT BUT INCOMPLETE |
| 15 | 17 / 37 | Switch Active Patient | 04 Family Management | `app/(app)/patient-switcher.tsx` | Yes | Close (radio list + Continue as …) | Yes (family — done) | BUILT BUT INCOMPLETE |
| 16 | 17 / 37 | Search & Results | 05 Doctor Discovery | `app/(app)/(tabs)/search.tsx` | Yes (Batch 2) | Real screen — query, quick filters, ranked doctor cards, states; pending device shot | Yes (doctors) | BUILT BUT INCOMPLETE |
| 17 | 18 / 37 | Filters | 05 Doctor Discovery | `app/(app)/search/filters.tsx` (`presentation:"modal"`) | Yes (Batch 2) | Real modal — specialty/gender/fee/rating + live count (fee uses chips, no slider dep) | Yes (doctors) | BUILT BUT INCOMPLETE |
| 18 | 18 / 37 | Specialty Categories | 05 Doctor Discovery | `app/(app)/search/specialties.tsx` | Yes (Batch 2) | Real searchable grid → filtered results | Yes (specialties) | BUILT BUT INCOMPLETE |
| 19 | 19 / 37 | Map View | 05 Doctor Discovery | `app/(app)/search/map.tsx` | Yes (Batch 2) | Real screen — branded static map surface + fee pins + bottom doctor card (**no maps SDK**; real provider wired later) | Yes (geo + clinics) | BUILT BUT INCOMPLETE |
| 20 | 19 / 37 | Doctor Details | 06 Doctor Profile | `app/(app)/doctors/[id]/index.tsx` | Yes (Batch 2) | Real screen — hero, stats, about, languages, slots, sticky Book bar, reviews link | Yes (doctors) | BUILT BUT INCOMPLETE |
| 21 | 20 / 37 | Reviews | 06 Doctor Profile | `app/(app)/doctors/[id]/reviews.tsx` | Yes (Batch 2) | Real screen — summary, distribution bars, review list | Yes (reviews) | BUILT BUT INCOMPLETE |
| 22 | 20 / 37 | Select Location & Time (Step 1/4) | 07 Appointment Booking | `app/(app)/booking/[doctorId]/schedule.tsx` | No | — | Yes (slots) | NOT BUILT |
| 23 | 21 / 37 | Review & Patient (Step 2/4) | 07 Appointment Booking | `app/(app)/booking/[doctorId]/review.tsx` | No | — | Yes (booking) | NOT BUILT |
| 24 | 21 / 37 | Appointment Success | 07 Appointment Booking | `app/(app)/booking/success.tsx` | No | — | Yes (booking) | NOT BUILT |
| 25 | 22 / 38 | Payment Summary (Step 3/4) | 08 Payments | `app/(app)/booking/payment.tsx` | No | — | Yes (Thawani) | NOT BUILT |
| 26 | 22 / 38 | Add New Card | 08 Payments | `app/(app)/payments/add-card.tsx` (modal) | No | — | Yes (Thawani) | NOT BUILT |
| 27 | 23 / 38 | Payment Confirmation | 08 Payments | `app/(app)/booking/payment-success.tsx` | No | — | Yes (Thawani) | NOT BUILT |
| 28 | 23 / 38 | Invoice & Receipt | 08 Payments | `app/(app)/payments/invoice/[id].tsx` | No | — | Yes (payments) | NOT BUILT |
| 29 | 24 / 38 | Upcoming & Past | 09 Appointments Module | `app/(app)/appointments/index.tsx` | No | — | Yes (appointments) | NOT BUILT |
| 30 | 24 / 38 | Appointment Details | 09 Appointments Module | `app/(app)/appointments/[id].tsx` | No | — | Yes (appointments) | NOT BUILT |
| 31 | 25 / 38 | Cancel Appointment | 09 Appointments Module | `app/(app)/appointments/[id]/cancel.tsx` (bottom sheet) | No | — | Yes (appointments) | NOT BUILT |
| 32 | 25 / 38 | Check-in | 09 Appointments Module | `app/(app)/appointments/[id]/check-in.tsx` | No | — | Yes (appointments + QR) | NOT BUILT |
| 33 | 26 / 38 | Refund Policy | 09 Appointments Module | `app/(app)/appointments/refund-policy.tsx` | No | — | No (static content) | NOT BUILT |
| 34 | 26 / 38 | AI Symptom Checker | 10 AI Features | `app/(app)/ai/assistant.tsx` | No | — | Yes (AI) | NOT BUILT |
| 35 | 27 / 38 | AI Recommendations | 10 AI Features | `app/(app)/ai/recommendations.tsx` | No | — | Yes (AI) | NOT BUILT |
| 36 | 27 / 38 | AI Insights & Risk | 10 AI Features | `app/(app)/ai/insights.tsx` | No | — | Yes (AI + vitals) | NOT BUILT |
| 37 | 28 / 39 | Medical Documents (Me Vault) | 11 Document Vault | `app/(app)/(tabs)/records.tsx` | Placeholder only | **WRONG** — current is a "coming soon" stub, not the vault | Yes (documents) | NOT BUILT |
| 38 | 28 / 39 | Upload Documents | 11 Document Vault | `app/(app)/records/upload.tsx` (bottom sheet) | No | — | Yes (storage) | NOT BUILT |
| 39 | 29 / 39 | Document Preview | 11 Document Vault | `app/(app)/records/document/[id].tsx` | No | — | Yes (documents) | NOT BUILT |
| 40 | 29 / 39 | Lab Reports | 12 Lab Results | `app/(app)/records/labs/index.tsx` | No | — | Yes (labs) | NOT BUILT |
| 41 | 30 / 39 | Result Trends & Detail | 12 Lab Results | `app/(app)/records/labs/[id].tsx` | No | — | Yes (labs) | NOT BUILT |
| 42 | 30 / 39 | Active Prescriptions | 13 Prescriptions | `app/(app)/records/prescriptions/index.tsx` | No | — | Yes (prescriptions) | NOT BUILT |
| 43 | 31 / 39 | Medication Details (e-Prescription) | 13 Prescriptions | `app/(app)/records/prescriptions/[id].tsx` | No | — | Yes (prescriptions) | NOT BUILT |
| 44 | 31 / 39 | Notification Center | 14 Notifications | `app/(app)/notifications/index.tsx` | Yes (Batch 2) | Real screen — Today/Earlier groups, typed icons, unread dots, Mark all, states | Yes (notifications) | BUILT BUT INCOMPLETE |
| 45 | 32 / 39 | Facility Messages | 14 Notifications | `app/(app)/notifications/messages.tsx` | Yes (Batch 2) | Real screen — admin message list, source icons, unread, states | Yes (messages) | BUILT BUT INCOMPLETE |
| 46 | 32 / 39 | Notification Preferences | 14 Notifications | `app/(app)/settings/notifications.tsx` | Yes (Batch 2) | Real screen — per-category Switches + Push/Email/SMS chips (persist in mock) | Yes (prefs) | BUILT BUT INCOMPLETE |
| 47 | 33 / 39 | Doctor Rating | 15 Ratings & Reviews | `app/(app)/rate/[appointmentId].tsx` | No | — | Yes (reviews) | NOT BUILT |
| 48 | 33 / 39 | Review Submission (thank-you) | 15 Ratings & Reviews | `app/(app)/rate/success.tsx` | No | — | Yes (reviews) | NOT BUILT |
| 49 | 34 / 40 | Settings | 16 Settings | `app/(app)/settings/index.tsx` | No | — | Yes (account/data) | NOT BUILT |
| 50 | 34 / 40 | Appearance & Accessibility | 16 Settings | `app/(app)/settings/appearance.tsx` | No | — | No (local prefs) | NOT BUILT |

### Cross-cutting component (every tabbed screen)
| — | 14–34 | Bottom navigation (Home·Search·Me·Records·Profile, raised Me submark) | Navigation | `src/components/ui/BottomTabBar.tsx` | Yes | Close — order & raised Me submark match; verify on device | No | BUILT BUT INCOMPLETE |

---

## §2 — Tally

- **Total PDF screens:** 50
- **Built as real screens (after Batch 2):** **25** — all `BUILT BUT INCOMPLETE` (pending device
  screenshots). = 16 from Batch 1 (incl. Settings) + 9 from Batch 2.
- **Still `NOT BUILT` (PDF-styled preview routes only):** **25** — booking (22–24), payments
  (25–28), appointments module (29–33), AI (34–36), document vault (37–39), labs (40–41),
  prescriptions (42–43), ratings (47–48), appearance (50).
- **`BUILT AND MATCHES`:** 0 (pending device screenshots — see §5)
- **Asset/font blockers:** 0

### Existing screens flagged VISUALLY WRONG (Task-2 priority)
1. **Dashboard #9** — wrong quick-action set, missing "Me Care Hub/Customize", disabled search, missing Check-in/Reschedule on Upcoming, "coming soon" specialties, no Recents/Featured.
2. **Welcome #2** — extra language/theme top-bar controls not in PDF; secondary entry should be a text link, not a ghost button.
3. **Onboarding #3** — emoji placeholders instead of the brand illustration / Me-circle hero.
4. **Profile #11** — extra Sign-out + "View medical history" link (neither is on the PDF profile).

### Existing screens flagged INCOMPLETE (smaller deltas)
Splash #1, Language #4, Sign In #5 (no Apple), Sign Up #6 (extra confirm field), OTP #7,
Forgot/Reset #8, Edit Profile #12 (allergies/field-set), Me Family #13, Add Family #14
(no Me-mark placeholder), Switch Patient #15, Bottom nav.

### Extra screen that is NOT in the PDF
- `app/(app)/medical-history.tsx` — a Week-2 editor with no corresponding PDF artboard. The PDF
  carries medical facts on **Personal Information (p15)** + the **Records modules** (Labs p29-30,
  Prescriptions p30-31, Documents p28-29). **Recommendation:** keep as an internal editor reachable
  from Profile/Records, but it is not a deliverable PDF screen. Do not count toward the 50.

---

## §3 — In-screen sub-states (described in PDF KEY FEATURES, not separate artboards)
These must be implemented within their parent screen (populated is the only frame the PDF renders):
- **Search & Results (#16):** no-results / empty-query state.
- **Doctor Discovery (#16–20):** loading list, empty results.
- **Document Vault (#37):** empty vault ("No documents in Me Vault yet" — see p7 Me empty state), loading.
- **Lab Results (#40), Prescriptions (#42), Notifications (#44), Appointments (#29):** loading + empty.
- **Payments (#25–27):** processing state + "Payment failed. Slot held for 10 minutes." error (p6 alert).
- **Booking (#22–24):** slot-unavailable / error.
- **All data screens:** error + retry (already standardized via `StateView` ErrorState).

## §4 — Component-level brand states (PDF p7, "Me Submark System")
Implemented via the `MeMark`/`Logo` components, not as routes:
- Me **empty** state ("No documents in Me Vault yet" + Add document).
- Me **loading** state (skeleton lines).
- Me **success** state ("Synced to your Me profile").
- Me in context: action button (FAB), avatar, tile, badge.

## §5 — Verification gap (must be closed before any `BUILT AND MATCHES`)
No Android emulator / `adb`, no macOS (no iOS Simulator), and `react-native-web` is not
installed in this environment, so **running-device screenshots cannot be captured here**. Per the
completion rule, no screen may be marked `BUILT AND MATCHES` until screenshots are captured on a
real device and compared 1:1 with the PDF. The mock data layer renders every screen fully
populated, so a single device/emulator run can capture the full matrix (EN/AR × Light/Dark ×
phone 360/412 + tablet 768). Capture instructions live in `docs/design-comparison/COMPARISON_REPORT.md`.

## §6 — Mock-data domains still missing (block Batches 2–5 content)
Present: profile, family, medical history, 1 appointment, auth/session.
**Missing (must add typed mock + repository interfaces):** doctors, clinics, specialties,
reviews, time-slots, bookings, payments/cards/invoices, lab results, prescriptions, documents,
notifications, facility messages, AI assistant/recommendations/insights, settings/preferences.
