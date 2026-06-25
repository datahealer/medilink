# MediLink Mobile — UI Build Backlog

**Date:** 2026-06-25
Ordered by the `MediLink_AgileDeliveryPlan_V2.pdf` sprint sequence. Each item is currently a `ScreenPreview` stub (`built:false` in `src/dev/screenRegistry.ts`) unless marked otherwise. Build every screen **EN/AR × Light/Dark together**, reusing theme tokens + shared components.

Legend: ✅ built · 🟡 partial · ⬜ stub (not built)

---

## Sprint 1 — Foundation / Onboarding / Auth / Profile / Family / Dashboard
**Status: ✅ COMPLETE.** No backlog items. Residual polish (optional, low priority):
- Onboarding carousel → mirror paging for Arabic RTL.
- `profile.tsx` → replace hardcoded `#FBE7EC` blood-group pill with a theme token (dark-mode safe).
- Add `isRTL` row handling to OTP / forgot / reset / family-add / family-edit (low visual impact).

## Sprint 2 — Discovery / Doctor / Booking / Appointments
Discovery + Doctor Profile = ✅ built. Remaining:

### 2a. Appointment Booking flow ⬜ (recommended next batch)
1. ⬜ **Select Location & Time** — `booking/[doctorId]/schedule` — clinic radio cards, **DayGrid**, **SlotGrid**, **Stepper** (1/4), Continue. (PDF p20)
2. ⬜ **Review & Patient** — `booking/[doctorId]/review` — **SummaryCard**, patient switcher row, reason field, Proceed-to-payment. (PDF p21)
3. ⬜ **Appointment Success** — `booking/success` — success state, booking ID, amount, add-to-calendar / view. (PDF p21)
   - New components: `Stepper`, `DayGrid`, `SlotGrid`, `SummaryCard`.

### 2b. Appointments Module ⬜
4. ⬜ **Upcoming & Past** — `appointments/index` — **SegmentedTabs**, status badges, inline check-in/details. (PDF p24)
5. ⬜ **Appointment Details** — `appointments/[id]/index` — date/location/patient, check-in / reschedule / cancel. (PDF p24)
6. ⬜ **Cancel Appointment** — `appointments/[id]/cancel` — BottomSheet, refund amount, reason chips. (PDF p25)
7. ⬜ **Check-in** — `appointments/[id]/check-in` — **QRCode**, queue / now-serving. (PDF p25)
8. ⬜ **Refund Policy** — `appointments/refund-policy` — tiered % rules + worked example. (PDF p26)
   - New components: `SegmentedTabs`, `QRCode` (+ dependency), `BottomSheet`.

## Sprint 3 — Payments / Records / Labs / Prescriptions / Notifications
Notifications (Center, Facility Messages, Preferences) = ✅ built. Remaining:

### 3a. Payments ⬜
9. ⬜ **Payment Summary** — `booking/payment` — **FeeBreakdown**, saved cards, apply-coupon, Pay. (PDF p22)
10. ⬜ **Add New Card** — `payments/add-card` — **CardPreview**, number/expiry/CVV/name, set-default. (PDF p22)
11. ⬜ **Payment Confirmation** — `booking/payment-success` — success, reference, masked card, recap. (PDF p23)
12. ⬜ **Invoice & Receipt** — `payments/invoice/[id]` — branded invoice, line items, download/share. (PDF p23)
    - New components: `FeeBreakdown`, `CardPreview`, masked-card row, `InvoiceCard`.

### 3b. Document Vault ⬜
13. ⬜ **Medical Documents** — `(tabs)/records` — category grid, recent files; **must re-add the bottom tab bar**. (PDF p28)
14. ⬜ **Upload Documents** — `records/upload` — upload/scan sheet, category chips. (PDF p28)
15. ⬜ **Document Preview** — `records/document/[id]` — inline preview, metadata, share/download. (PDF p29)
    - New components: `CategoryCard`, `FileRow`, upload/scan sheet.

### 3c. Lab Results ⬜
16. ⬜ **Lab Reports** — `records/labs/index` — Segment (All/Normal/Flagged), LabCard. (PDF p29)
17. ⬜ **Result Trends & Detail** — `records/labs/[id]` — **AnalyteRow** vs reference, AI note, **TrendChart**. (PDF p30)
    - New components: `AnalyteRow`, `TrendChart` (+ charting approach).

### 3d. Prescriptions ⬜
18. ⬜ **Active Prescriptions** — `records/prescriptions/index` — Active/Previous segment, PrescriptionCard. (PDF p30)
19. ⬜ **Medication Details** — `records/prescriptions/[id]` — verified Rx header, dosage, send-to-pharmacy. (PDF p31)
    - New components: `PrescriptionCard`, verified-signature header.

## Sprint 4 — AI / Ratings / Settings / QA
Settings + Appearance = ✅ built. Remaining:

### 4a. AI Features ⬜
20. ⬜ **AI Symptom Checker** — `ai/assistant` — chat bubbles, quick-reply chips, safety disclaimer. (PDF p26)
21. ⬜ **AI Recommendations** — `ai/recommendations` — % match doctor cards, "Why?". (PDF p27)
22. ⬜ **AI Insights & Risk** — `ai/insights` — **TrendChart**, progress callouts, visit summary. (PDF p27)

### 4b. Ratings & Reviews ⬜
23. ⬜ **Doctor Rating** — `rate/[appointmentId]` — **StarRating** input, aspect chips, anon comment. (PDF p33)
24. ⬜ **Review Submission** — `rate/success` — thank-you, submitted recap, rate-clinic prompt. (PDF p33)
    - New components: `StarRating`, reuse `RatingBars`.

### 4c. Hardening (Week 8)
- Full EN/AR × Light/Dark QA across all 50 screens; RTL gap fixes; on-device screenshot parity pass vs the design doc.

---

## Shared components to build (consolidated, in first-needed order)
`Stepper`, `DayGrid`, `SlotGrid`, `SummaryCard` (S2 booking) → `SegmentedTabs`, `QRCode`, `BottomSheet` (S2 appointments) → `FeeBreakdown`, `CardPreview`, `InvoiceCard` (S3 payments) → `CategoryCard`, `FileRow`, `AnalyteRow`, `TrendChart`, `PrescriptionCard` (S3 records/labs/rx) → `StarRating`, `RatingBars` (S4 ratings). Also evaluate a `Slider` for the fee filter and a real map provider for Map View.

## Dependency decisions to confirm with stakeholder
- QR code library (check-in) vs hand-rolled.
- Charting approach for `TrendChart` (lab trends + AI insights).
- Fee `Slider` library vs keep the current chip substitution.
- Real maps SDK vs keep the branded static map mock.
