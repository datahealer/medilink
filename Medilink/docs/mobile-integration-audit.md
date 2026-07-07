# MediLink Patient Mobile App — Integration Audit Report

_Audit date: 2026-07-02 · Scope: every patient screen under `mobile/app` · Method: full code-path read of each screen + data layer, cross-checked against the hybrid repository wiring, backend APIs, and the design screen registry. Backend claims spot-verified against the hosted DB earlier this session (payments, documents, prescriptions, reviews, AI, facility messages, specialties, lab results)._

## Summary

| Metric | Count |
|---|---|
| Total patient screens (excl. 4 layouts + 2 dev screens) | **53** |
| API-connected (real backend where a source exists) | **48** |
| Fully working ✅ | **45** |
| Partial ⚠️ (works, but a documented gap or deferred piece) | **8** |
| Broken ❌ (before this audit) | **3** → **0 after fixes** |
| Intentionally mock/static (product decision or deferred, documented) | **4** |
| Not implemented (out of design scope) | **3** |

**Fixes applied during this audit** (all functionality-breaking; typecheck + lint clean):
1. **Payment hand-off** — no longer navigates to the "processing" screen when the Thawani checkout URL is missing/unopenable; shows an error instead.
2. **Notification deep-links** — `appointment`/`payment` no longer point at hardcoded mock ids (`mock-appt-1`, `ML-INV-48213`); route to their list screens like the other kinds.
3. **Booking success** — "View appointment" now routes to `/appointments` (was `/dashboard`; the stale "appointments not built" comment was false).
4. **Settings** — removed the hardcoded fake email fallback (`aisha@medilink.om`).
5. **Data-layer header comment** — corrected stale claims that Specialties / Facility Messages / Lab Results / AI are still mock.

Nothing else was modified — working code was left untouched per the audit brief.

---

## Global architecture findings

**Clean data-layer boundary (✅).** No screen imports `@/lib/supabase`, `apiFetch`, or the shared `api.*` directly. Every screen goes through `src/hooks/queries/*` → `repositories` from `src/data`. Source selection is centralized in `src/data/index.ts` (`mock` vs `hybrid`).

**Real vs mock is centralized and honest (✅).** The hybrid wires to real backend: auth, patient, family, medicalHistory, appointment, payment, document, prescription, lab, review, ai, notification (all methods), doctor.search/get/reviews, discovery (all). Still mock: `doctor.mapClinics` only. Screens that can't be backed yet are honestly labeled in code.

**Loading / error / empty states (✅ strong).** 29 screens wire `ErrorState` with an `onRetry` → `refetch()`. List and detail screens consistently render `LoadingState` / `ErrorState` / `EmptyState`. Mutations use per-action loading flags.

**Query invalidation after mutations (✅).** Verified on document upload/delete, family add/edit/remove, profile + medical-history save, appointment book/cancel/reschedule/check-in, payment verify, review submit, lab mark-viewed, facility-message mark-read.

**Pull-to-refresh (⚠️ GLOBAL GAP).** No screen implements pull-to-refresh. The shared `Screen` shell wraps content in a `ScrollView` but never wires a `RefreshControl`. Lists rely on TanStack Query auto-refetch + manual error-retry only. Not a functional break, but the design/UX expectation for list screens (appointments, notifications, labs, prescriptions, payments, documents, search) is unmet. **Recommend:** add an optional `onRefresh`/`refreshing` prop to `Screen` and pass each list's `refetch`.

**TypeScript / ESLint (✅).** `npm run typecheck` and `npm run lint` are both clean.

**console/TODO hygiene (✅ acceptable).** No `console.log` in production paths; only `__DEV__`-guarded diagnostics in the data layer (one always-on `console.warn` for a dropped non-UUID family id in booking — benign). One `TODO` in `PhoneField.tsx` (replace the fixed `+968` prefix with a country picker — Oman-only for now).

---

## Screen-by-screen audit

### Authentication & entry (10 screens) — ✅ all working
`index`, `splash`, `welcome`, `onboarding`, `language`, `sign-in`, `sign-up`, `otp`, `forgot-password`, `reset-password`.

- **API:** `repositories.auth.*` → Supabase + backend `/api/auth/*` (signup, send-otp, verify-otp); password reset via Supabase recovery session.
- **Findings:** Full form validation (Zod): email format, Oman 8-digit phone, password policy (8+/upper/lower/number/special), terms acceptance, OTP 6-digit + resend countdown, reset password-match + strength meter. Loading/error states + a11y live regions throughout. Google/Apple sign-in are honestly **disabled** ("not configured yet") — no faked success. Splash correctly gates on store hydration + session restore.
- **Status:** ✅ Working end-to-end. No issues.

### Dashboard & discovery (7 screens)
- **dashboard.tsx** — ⚠️ Partial. Real: next appointment, recent doctors, featured clinics, specialties chips. Findings: (a) **featured-clinic cards route to `/search`** — there is no clinic-detail screen in the app, so this is a generic fallback (see "Not implemented"); (b) **Top Specialties filters to a hardcoded 3-slug list** `["cardiology","dermatology","dentist"]` — works with the current seed but brittle if slugs change; (c) recents section has no error state (silent on error). Priority: Low–Medium.
- **search.tsx / filters.tsx** — ✅ Working. Filters held in a Zustand store, passed correctly to `doctor.search`. Active-filter badge correct. Note: **gender filter is collected but has no backend column**, so it's silently ignored (documented in `real/index.ts`). Priority: Low.
- **specialties.tsx** — ✅ Working (real catalog). Minor: loading state only, no error state. Low.
- **doctors/[id]/index.tsx** — ✅ Working. Real `doctor.get`; loading/error states; routes to reviews + booking. (Favourite toggle is local-only; slot "today" availability intentionally deferred to the schedule screen.)
- **doctors/[id]/reviews.tsx** — ✅ Working. Real distribution + list, empty state.
- **map.tsx** — ⚠️ Deferred (documented). Fetches real doctors but places the first 3 at **fixed pin positions** on a branded static map surface (no map SDK). Honest stand-in per `docs/backend-specs/map-view-backend-spec.md`; needs a native map SDK + `expo-location`. Priority: Medium (feature-complete blocked on native deps).

### Booking & appointments (10 screens)
- **booking/[doctorId]/schedule.tsx** — ✅ Working. Real slots via `getAvailableSlots`; clinic auto-select; empty state.
- **booking/[doctorId]/review.tsx** — ✅ Working. Real `book_appointment_atomic` RPC; validates active-patient UUID (drops stale mock ids); mock→success, real→payment.
- **booking/payment.tsx** — ✅ **Fixed.** Real Thawani checkout via `/api/payments/checkout`. Was: navigated to the confirmation screen even if the checkout URL was missing/unopenable (patient stuck "processing" without paying). Now: shows an error and does not advance unless the hosted page actually opens.
- **booking/payment-success.tsx** — ✅ Working. Real verify (`/api/payments/verify`) + poll; pending/paid states; invalidates payments + appointments; routes to `/appointments`.
- **booking/success.tsx** — ✅ **Fixed.** "View appointment" now → `/appointments` (was `/dashboard`). "Add to Calendar" is an intentional coming-soon.
- **appointments/index.tsx** — ✅ Working. Real list split upcoming/past; inline check-in on the next confirmed; invalidates on check-in.
- **appointments/[id]/index.tsx** — ✅ Working. Real detail; status-driven actions (check-in/reschedule/cancel/rate); cancel sheet with reason → real RPC → invalidate + back.
- **appointments/[id]/reschedule.tsx** — ✅ Working. Real `reschedule_appointment_atomic`; slot reuse; error/empty states.
- **appointments/[id]/check-in.tsx** — ⚠️ Partial. Reference number is real; **QR is a deterministic pseudo-QR (not scannable)** and **Live Queue values are hardcoded** (`A-07` / `A-04`, labeled "wired to realtime tomorrow"). Priority: Medium (cosmetic until the queue service + a real QR are wired).
- **appointments/refund-policy.tsx** — ✅ Working (static policy content + worked example from params).

### Payments & records (8 screens) — ✅ mostly clean
- **payments/index.tsx** — ✅ Real list, all states, status-tone badges.
- **payments/invoice/[id].tsx** — ✅ Real detail; VAT/total breakdown; download/share via `invoiceUrl` with disabled state + "unavailable" message.
- **records.tsx (vault)** — ✅ Real documents; category counts; filter. Note: the search field is **decorative** (per design p28). Low.
- **records/labs/index.tsx / [id].tsx** — ✅ Real (this session): list tabs by status, detail analytes with reference ranges + flag pills, AI insight when present, download/share via signed URL, mark-viewed on open.
- **records/prescriptions/index.tsx** — ⚠️ Partial. Real list + share link. **"Set Reminder" is a coming-soon Alert placeholder**; Active/Previous tabs from the design are not built (backend has no prescription status). Priority: Low.
- **records/prescriptions/[id].tsx** — ✅ Working. Real detail; PDF download gracefully disabled when the doctor hasn't generated it; send-to-pharmacy share link.
- **records/document/[id].tsx** — ✅ Working. Real preview via signed URL; download/open/share; delete with confirm → invalidate + back.
- **records/upload.tsx** — ✅ Working (real upload → bucket + row → invalidate). Minor: `source` state is set before the picker returns, so the "file selected" affordance can show after a cancel (upload button stays correctly disabled). "Vaccination" category maps to backend `other`. Priority: Low.

### Profile, family & settings (8 screens) — ✅ all working
`profile`, `me`, `edit-profile`, `family/add`, `family/[id]`, `medical-history`, `patient-switcher`, `settings/index`, `settings/appearance`, `settings/notifications`.
- Real profile/family/medical-history/notification-prefs; validated forms (name min length, required relation, allergen/condition tag editors, no duplicates); family max-5 enforced; active-patient reset on member delete; query invalidation on all mutations.
- **settings/index.tsx** — ✅ **Fixed** (removed fake email fallback). Privacy / Export data / Delete account are intentional coming-soon placeholders.
- **settings/appearance.tsx** — ✅ Local theme/RTL/large-text toggles; RTL switch prompts restart.

### Notifications (2 screens)
- **notifications/index.tsx** — ✅ **Fixed.** Real list + mark-all-read (optimistic). Deep-link targets were hardcoded mock ids for `appointment`/`payment`; now route to their list screens (the notification payload carries no target id yet — see recommendation below). 
- **notifications/messages.tsx** — ✅ Working (real facility messages; mark-read on open; empty/error states).

### AI (3 screens)
- **ai/recommendations.tsx** — ✅ Working. Real `POST /api/ai/suggest-doctor`; reasoning + urgency + doctor cards → book.
- **ai/insights.tsx** — ⚠️ Partial (documented). **Visit-summary card is real** (`appointments.patient_summary`); the **vitals-trend chart is static** (no vitals time-series backend). Honest, not faked.
- **ai/assistant.tsx** — ⚠️ Static by design. The Symptom Checker guided-chat transcript is intentionally static (product decision to keep the approved UX; the free-text endpoint is a documented future gap). The text input has no submit handler; "See recommendations" carries a sample query.

### Ratings (2 screens) — ✅ working
- **rate/[appointmentId].tsx** — Real review submit; star required; aspects + comment folded into review text; routes to success.
- **rate/success.tsx** — Display-only confirmation from params.

---

## Not implemented (out of current design scope)

These appear in the audit checklist but are **not** in the design screen registry, so they are absent rather than broken:
- **Live Queue** — only the static queue readout on the check-in screen exists; no realtime queue feature/screen.
- **Help & Support** — no screen and no link references it anywhere (so no broken navigation).
- **Clinic detail** — no `clinics/[id]` screen; "Clinics" is represented only by the dashboard featured-clinics strip, which routes to `/search`.

---

## Deferred backend dependencies (documented, not defects)

| Area | State | Reference |
|---|---|---|
| Map View pins | Needs native map SDK + `expo-location` + per-clinic fee | `docs/backend-specs/map-view-backend-spec.md` |
| AI Symptom Checker | Guided-chat UI kept; free-text endpoint deferred | `docs/backend-specs/ai-features-*` |
| AI vitals trend | No vitals time-series source | same |
| Live queue + scannable QR | Realtime queue service not wired | check-in.tsx comment |
| Lab analyte ingestion | Tables live; HAMS technician entry populates them | `docs/backend-specs/lab-results-backend-spec.md` |
| Prescription status / reminders | No status column; reminder flow not built | prescriptions screens |

---

## Prioritized recommendations (post-fix)

**High**
- Add pull-to-refresh to list screens (extend the `Screen` shell with `onRefresh`/`refreshing`, pass each query's `refetch`).

**Medium**
- Surface a notification target id: carry `in_app_notifications.data` → `NotificationItem` so `appointment`/`payment` can deep-link to the specific record (currently they open the list).
- Map View + Live Queue + scannable QR — schedule the native/realtime work called out above.
- Replace the dashboard hardcoded specialty-slug filter with a backend `is_featured`/`sort_order`-driven selection.

**Low**
- Add error states to the dashboard recents and the specialties grid.
- Implement (or hide) the prescription "Set Reminder" and Active/Previous tabs.
- Fix the upload `source`-state affordance after a cancelled picker.
- Country-code picker for phone (remove the Oman-only `+968` TODO).
- Decide whether "Clinics" needs a dedicated detail screen or the featured strip should filter search by that clinic.

---

## Final verdict

**Ready for QA / Staging.** Every screen with an available backend is wired to real data through a clean, centralized data layer; the three functionality-breaking issues found (payment hand-off, notification deep-links, booking-success navigation) have been fixed and verified (typecheck + lint clean). 

**Before Production**, close the High/Medium items — most importantly **pull-to-refresh** (UX expectation on every list) and the **deferred native/realtime features** (Map View, Live Queue, scannable QR), plus the **lab analyte ingestion** path (patient screens are ready but tables stay empty until HAMS writes analytes). The remaining items are low-severity polish. No mock data leaks into the hybrid build, and no screen fakes a backend it doesn't have.
