# MediLink Mobile — UI Implementation Audit

**Date:** 2026-06-25
**Source of truth:** `MediLink_Design_Documentation.pdf` (50 screens · 16 flows · EN/AR · Light/Dark)
**Delivery order:** `MediLink_AgileDeliveryPlan_V2.pdf` (Sprints 1–4)
**Method:** Static inspection of every route under `mobile/app/**` and every component under `mobile/src/components/ui/**`. **Not** device-verified — visual parity still needs an on-device capture pass.

## How to read "Status"

- **Complete** — real screen, built from shared components + theme tokens, EN/AR + Light/Dark wired in code.
- **Partially complete** — some real implementation but a known gap (e.g. static mock, missing RTL).
- **Preview stub (not built)** — route exists but renders the shared `ScreenPreview` "designed · build scheduled for Batch N" placeholder. No real screen UI yet. (`src/dev/screenRegistry.ts` → `built:false`.)
- **Exists but visually not compliant** — real screen that diverges from the artboard.
- **Missing** — no route at all.
- **Deferred Phase 2** — explicitly out of MVP.

Every required screen has a route file, so **nothing is "Missing"**. The real split is **27 built** vs **~24 preview stubs**.

---

## Flow-by-flow

| Flow | Required screens (design doc) | Existing route(s) | Status | Missing UI / components | Priority |
|---|---|---|---|---|---|
| **01 Splash & Onboarding** | Splash, Welcome, Onboarding carousel, Language | `app/splash`, `app/welcome`, `app/onboarding`, `app/language` | **Complete** (all 4) | Onboarding horizontal carousel not RTL-mirrored for AR | Done (S1) |
| **Authentication** | Sign In, Sign Up, OTP, Forgot/Reset Password | `auth/sign-in`, `auth/sign-up`, `auth/otp`, `auth/forgot-password`, `auth/reset-password` | **Complete** (all) | Minor: OTP/forgot/reset rows don't read `isRTL` (single-column, low impact). Google/Apple honestly disabled | Done (S1) |
| **02 Home Dashboard** | Patient Dashboard, Recents & Featured | `(tabs)/dashboard` (one scroll screen) | **Complete** | "Customize" Care-Hub link is a `comingSoon` alert | Done (S1) |
| **03 Patient Profile** | Personal Information, Edit Profile | `(tabs)/profile`, `edit-profile` (+ `medical-history`) | **Complete** | `profile.tsx` blood-group pill uses hardcoded `#FBE7EC` (light-only; won't adapt in dark) | Done (S1) — minor fix |
| **04 Family Management** | Family Members, Add Member, Switch Active Patient | `(tabs)/me`, `family/add`, `patient-switcher` (+ `family/[id]` edit) | **Complete** (all) | `family/add`, `family/[id]` lack `isRTL` row handling (low impact) | Done (S1) |
| **05 Doctor Discovery** | Search & Results, Filters, Specialty Categories, Map View | `(tabs)/search`, `search/filters`, `search/specialties`, `search/map` | **Search/Filters/Specialties = Complete; Map = Partially complete** | Map is a hand-drawn **static mock** (no maps SDK); Filters uses chips instead of a fee **Slider**; Specialties grid lacks `isRTL` | Search done; **Map + Slider = backlog** |
| **06 Doctor Profile** | Doctor Details, Reviews | `doctors/[id]/index`, `doctors/[id]/reviews` | **Complete** (both) | — (Reviews uses a local `Stars` helper → candidate to extract as `RatingBars`) | Done (S2) |
| **07 Appointment Booking** | Select Location & Time, Review & Patient, Appointment Success | `booking/[doctorId]/schedule`, `booking/[doctorId]/review`, `booking/success` | **Preview stub (not built)** ×3 | DayGrid, SlotGrid, Stepper, SummaryCard, success state | **NEXT (S2)** |
| **08 Payments** | Payment Summary, Add New Card, Payment Confirmation, Invoice & Receipt | `booking/payment`, `payments/add-card`, `booking/payment-success`, `payments/invoice/[id]` | **Preview stub (not built)** ×4 | FeeBreakdown, CardPreview, masked-card row, InvoiceCard, success state | S3 |
| **09 Appointments Module** | Upcoming & Past, Details, Cancel, Check-in, Refund Policy | `appointments/index`, `appointments/[id]/index`, `.../cancel`, `.../check-in`, `appointments/refund-policy` | **Preview stub (not built)** ×5 | SegmentedTabs (Upcoming/Past), status badges, BottomSheet (cancel), **QRCode** + QueueCard (check-in), refund tiers | S2 (after booking) |
| **10 AI Features** | AI Symptom Checker, AI Recommendations, AI Insights & Risk | `ai/assistant`, `ai/recommendations`, `ai/insights` | **Preview stub (not built)** ×3 | Chat bubbles, quick-reply chips, % match cards, **TrendChart** | S4 |
| **11 Document Vault** | Medical Documents, Upload, Document Preview | `(tabs)/records`, `records/upload`, `records/document/[id]` | **Preview stub (not built)** ×3 | CategoryCard grid, FileRow, Upload/Scan sheet, Preview. ⚠ Records **tab** stub drops the bottom tab bar | S3 |
| **12 Lab Results** | Lab Reports, Result Trends & Detail | `records/labs/index`, `records/labs/[id]` | **Preview stub (not built)** ×2 | Segment, LabCard, **AnalyteRow** vs reference, AI note, **TrendChart** | S3 |
| **13 Prescriptions** | Active Prescriptions, Medication Details | `records/prescriptions/index`, `records/prescriptions/[id]` | **Preview stub (not built)** ×2 | PrescriptionCard, RxCard, send-to-pharmacy, verified-signature header | S3 |
| **14 Notifications** | Notification Center, Facility Messages, Notification Preferences | `notifications/index`, `notifications/messages`, `settings/notifications` | **Complete** (all 3) | — (mint tint uses 2 intentional hex, dark-branched) | Done (S3) |
| **15 Ratings & Reviews** | Doctor Rating, Review Submission | `rate/[appointmentId]`, `rate/success` | **Preview stub (not built)** ×2 | **StarRating** input, aspect chips, success/recap state | S4 |
| **16 Settings** | Settings, Appearance & Accessibility | `settings/index`, `settings/appearance` | **Complete** (both) | privacy/export/delete = `comingSoon` alerts (intentional); appearance preview-tile swatches use intentional hex | Done (S4) |

---

## Design-system compliance (built screens)

- **Theme tokens:** All built screens consume `useTheme()` color roles (`background, surface, surfaceAlt, text, textMuted, textFaint, textOnPrimary, primary, primaryMuted, accent, accent2, border, inputBackground, overlay, success, warning, error, info, heroFrom, heroTo`). Token files present: `theme/tokens.ts`, `light.ts`, `dark.ts`.
- **Hardcoded color exceptions (only 3 real ones):** `profile.tsx` `#FBE7EC` (light-only — should move to a token); `notifications/index.tsx` mint tints `#D7F0E2` / `rgba(95,207,155,0.20)` (dark-branched, low risk). Everything else is `#FFFFFF`/`rgba` whites used intentionally on the fixed-violet hero surfaces (splash/welcome) which the brand defines as always-violet.
- **Typography:** All built screens use the `Text` primitive variants — no raw `<Text>`. Agatho is correctly limited to heading variants (`display/h1/h2`); Manrope drives `title/body/caption/label`; 29LT Zarid Sans auto-swaps for Arabic. Fonts registered in `theme/typography.ts`. **Abigaila signature font is NOT bundled** — but the app screens never call for it (signature is a brand-collateral face only), so this is not an app blocker.
- **Logo / Me submark:** Official `Logo`, `MeMark`, `MeWordmark`, `BrandIcon` (Highlights set) all wired and theme-tinted.
- **Icons:** Custom single-stroke 24×24 `Icon` set with RTL chevron mirroring.
- **RTL:** Strong on the high-traffic screens (dashboard, search, doctor details, map, settings, notifications). **Gaps (low impact):** onboarding carousel paging, OTP/forgot/reset, specialties grid, family add/edit — single-column or symmetric layouts, but onboarding paging won't reverse for AR.
- **Dark mode:** Token-driven everywhere; only the `#FBE7EC` pill is a genuine light-only literal.
- **i18n:** `en.ts` + `ar.ts` are key-for-key matched (~361 keys each, typed). Eastern-Arabic numeral localizer (`num()` / `localizeDigits`) present and auto-applied.

## Reusable components — present

Full card family (`AppCard`, `PatternCard`, `Card`, `AppointmentCard`, `DoctorCard`, `ClinicCard`, `RecentlyVisitedCard`, `FamilyMemberCard`, `HubActionTile`, `SpecialtyTile`), shells (`Screen`, `AppScreen`, `AppHeader`), forms (`TextField`, `PasswordField`, `PhoneField`, `OtpInput`, `Checkbox`), nav (`BottomTabBar`, `StaticTabBar`, `BackButton`, `ProgressDots`), brand (`Logo`, `MeMark`, `BrandIcon`, `Icon`, `OrbPattern`, `HeroBackground`), typography (`Text`, `AppText`), buttons/chips (`Button`, `CtaButton`, `Chip`), `Avatar`, and state views (`LoadingState`, `ErrorState`, `EmptyState`).

## Reusable components — still needed (for the unbuilt flows)

| Component | Needed by | Notes |
|---|---|---|
| **SegmentedTabs / Segment** | Appointments (Upcoming/Past), Lab Results, Prescriptions | recurring tab control |
| **Stepper** | Booking (Step 1/4 … 4/4) | progress indicator |
| **DayGrid + SlotGrid** | Booking schedule, Doctor Details slots | date row + time grid |
| **SummaryCard** | Booking review, Appointment details | labelled summary rows |
| **FeeBreakdown** | Payment summary, Invoice | line items + VAT + total |
| **CardPreview + masked-card row** | Add Card, Payment method | visual card + `•••• 4421` row |
| **StarRating** (input) | Doctor Rating | tap-to-rate |
| **RatingBars** (distribution) | Reviews (extract from local `Stars`) | 5→1 bars |
| **QRCode** | Check-in | needs a QR dependency |
| **AnalyteRow** | Lab detail | value vs reference + High/OK |
| **TrendChart** | Lab trends, AI insights | needs a charting approach |
| **Slider** | Filters fee range | needs a slider dependency (currently chips) |
| **CategoryCard / FileRow** | Document Vault | vault grid + file list |

## Blockers / dependencies

- **No real map SDK** — Map View is a static branded mock. Real near-me needs a maps provider (or stays a styled mock by decision).
- **No QR / chart / slider deps** — Check-in (QR), Lab/AI trends (chart), Filters (slider) need either a library or a hand-rolled component.
- **Backend:** app currently runs on the **mock data layer** (`src/data/mock`). Per the Agile plan the real HAMS endpoints are reused; UI can be built against the mock repos now and swapped to `src/data/real` later. No backend work blocks UI build.
- **Records tab regression:** while `(tabs)/records` is a stub it renders no bottom tab bar (inconsistent with the other tab roots) — resolved when the real Vault screen is built.
