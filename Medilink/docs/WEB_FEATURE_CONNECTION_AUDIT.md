# MediLink Web — Feature Connection Audit

**Scope:** 12 specific backend features, checked against the actual implementation (not filenames) to determine: does a UI already exist that could use this backend, is it already connected, or does new work (frontend and/or backend) genuinely need to be built.
**Date:** 2026-07-07 · **App:** `Medilink/frontend` (Next.js patient web) + `Medilink/shared` (`api.*`) + `Medilink/backend` (privileged routes) + `Medilink/supabase` (RPCs/migrations)
**No code changed.** This is a read-only audit.

**How data flows in this repo** (needed to read the findings below): the web app calls `api.<domain>.<fn>(supabase, …)` from `@medilink/shared`, which runs direct Supabase queries/RPCs under RLS. A few privileged actions (payments, PDF, AI, GDPR) go through `Medilink/backend`'s Next.js route handlers instead. `Medilink/docs/API_CATALOG.md` is the authoritative, already-verified list of every API/RPC/route — this audit cross-checked it against the actual RPC bodies in `Medilink/supabase/migrations/*.sql` and the actual frontend components.

---

## 1. Web Check-in

**Backend:**
🟡 Exists, but not patient-safe and not exposed in the shared layer.
`checkin_and_enqueue(p_appointment_id, p_patient_name, p_patient_phone)` — SECURITY DEFINER RPC in `supabase/migrations/20260429000006_unified_queue_rpcs.sql`. It flips `appointments.status` from `confirmed` → `checked_in`, stamps `checked_in_at`, and calls `enqueue_appointment` to create a `queue_items` row. **It does not verify that the caller owns the appointment** — it takes `p_patient_name`/`p_patient_phone` as free-text args, which is correct for a *reception* check-in (staff typing in a walk-in) but unsafe to call directly from patient-authenticated web, since any signed-in patient could pass an arbitrary `p_appointment_id`. It is not wrapped in `shared/src/api/appointments.ts` and is absent from `API_CATALOG.md`'s patient-facing RPC list.
No QR-related table, column, or code exists anywhere in the repo.

**UI:**
❌ Missing. `dashboard/appointments/page.tsx` renders only **Reschedule** and **Cancel Appointment** buttons for upcoming appointments (the `isUpcoming` action row). There is no Check-in button, no appointment-status gating for "day of, confirmed → show check-in," no queue-position display, and no QR code anywhere in the frontend.

**Navigation:**
```
Dashboard
 → Appointments
   → [expand appointment]
     → Reschedule | Cancel   (Check-in button does not exist)
```

**Current Status:** 🟡 Backend only — and even the backend primitive needs a safety fix before it can be called from the patient app.

**Missing Work:**
- A patient-scoped RPC or a shared-layer wrapper that derives the patient from `auth.uid()` and validates ownership + appointment status + a check-in time window (e.g., don't allow check-in a week early) before calling/adapting `checkin_and_enqueue`.
- A "Check-in" button in the appointments list, shown only when `status === 'confirmed'` and the appointment is today.
- A minimal post-check-in state (e.g., "You're checked in — queue position #3") — there is currently no patient-facing read of `queue_items`.
- QR support: not started; no schema, no library, no UI. Confirm whether this is truly required for Phase 2 web (QR is more natural for in-clinic kiosk flows).

**Reuse:** The existing Reschedule/Cancel button row (`dashboard/appointments/page.tsx`, `isUpcoming` block) is the natural place to add a third conditional button — same component, same styling, same `busyId` loading pattern already used for Cancel.

**Recommendation:** Create backend (safety wrapper) + connect existing UI pattern (extend the button row). Not a new page.

---

## 2. Waitlist (Join / Leave / Claim Waitlist)

**Backend:**
🟡 Split — claim is fully done; join/leave have no convenience wrapper (though RLS permits doing it directly).
- **Claim:** ✅ `claim_waitlist_appointment(p_entry_id)` RPC, fully wrapped as `api.appointments.claimWaitlistAppointment(db, entryId)`. Documented in `API_CATALOG.md`.
- **Join / Leave:** 🟡 The `waitlist_entries` table has RLS policy `waitlist_patient_own ... FOR ALL` — a patient can already `INSERT`/`DELETE` their own rows directly via Supabase (no RPC required). But `shared/src/api/appointments.ts` has **no `joinWaitlist`/`leaveWaitlist` function** — this convenience wrapper simply hasn't been written.
- **Automation:** ✅ `notify-waitlist` edge function (offers a freed slot on cancellation), `expire_waitlist_entries()` + trigger (expires stale offers) — both already exist and run server-side.

**UI:**
❌ Missing entirely. Read `components/dashboard/DoctorBooking.tsx` in full: when `getAvailableSlots` returns nothing for a chosen date, the modal shows a dead-end message ("No available times on this day.") with **no "Join Waitlist" call to action**. There is no waitlist tab/list anywhere (Appointments page has only All/Upcoming/Completed/Cancelled tabs), no waitlist-status view, and no "claim this freed slot" banner despite the claim function being ready to call.

**Navigation:**
```
Find Doctors → Doctor Profile → Book Appointment → [no slots for chosen date]
  → dead end (no "Join Waitlist" option exists)

Appointments → (no Waitlist tab exists)
```

**Current Status:** 🟡 Backend only (partially — claim is production-ready; join/leave need a small wrapper).

**Missing Work:**
- Add `joinWaitlist(db, {doctorId, facilityId, preferredDate})` / `leaveWaitlist(db, entryId)` to `shared/src/api/appointments.ts` (thin insert/delete against `waitlist_entries` — RLS already allows it).
- Add a "Join Waitlist" button to the BookingModal's empty-slots state.
- Add a "Waitlist" tab to the Appointments page listing the patient's `waitlist_entries` (status, preferred date, position) with a "Claim" button wired to the already-working `claimWaitlistAppointment`.

**Reuse:** BookingModal's `step === "time"` empty-state block (`slotGroups.length === 0`) is exactly where the CTA belongs. The Appointments page's existing tab pattern (`TABS` array + filter logic) extends cleanly to a 5th "Waitlist" tab.

**Recommendation:** Connect existing UI pattern (tabs, modal empty-state) + a small shared-layer addition (join/leave wrappers — not new backend infrastructure, since RLS/table already permit it).

---

## 3. One-Tap Rebooking / Follow-up Booking

**Backend:**
✅ Fully exists. RPC `rebook_appointment(p_original_id)` → fully wrapped as `api.appointments.rebookAppointment(db, originalId): Promise<Json>` in `shared/src/api/appointments.ts`, documented in `API_CATALOG.md`. Nothing to build.

**UI:**
❌ Missing. In `dashboard/appointments/page.tsx`, the expanded-card action row is gated by `isUpcoming` — for **Completed** or **Cancelled** appointments, expanding the card shows Type/Date/Time/Notes only, with **zero action buttons**. No "Book Again" anywhere in the app (dashboard home's "Book Appointment" quick action starts a fresh search, not a same-doctor rebook).

**Navigation:**
```
Dashboard → Appointments → Completed tab → [expand appointment]
  → (no button — dead end; the wired rebookAppointment function is never called)
```

**Current Status:** 🟡 Backend only.

**Missing Work:** Only a button. Add a "Book Again" action to the expanded-card block for `Completed` (and arguably `Cancelled`) appointments that calls `api.appointments.rebookAppointment(supabase, appt.id)` and then reloads the list — the same `busyId`/error-handling pattern already used for Cancel.

**Reuse:** Same button row, same component, same loading/error plumbing as Cancel/Reschedule in `dashboard/appointments/page.tsx`. This is the single cleanest quick win in the whole audit — the backend function signature already matches exactly what the UI needs.

**Recommendation:** Connect existing UI pattern. No new page, no new backend.

---

## 4. Refund Request / Refund Status

**Backend:**
✅ Fully exists. `POST /api/payments/[id]/refund` (backend route, session-authed), `GET /api/payments/[id]/invoice`, `hams_payment_status`/`refund_status` enums in schema, and a scheduled edge function `poll-refund-status` that reconciles gateway state. `GET /api/payments` (already consumed) already returns `refunded`/`partial_refund` statuses.

**UI:**
🟡 Status display only. `dashboard/payments/page.tsx` maps backend statuses to a "Refunded" badge (`mapStatus`, `STATUS_META.refunded`) — so *if* a payment is already refunded server-side, the patient sees it. But there is **no way for the patient to request a refund** — the expanded-row action buttons are Preview / Download / Print only. No refund eligibility text (cutoff hours, policy), no refund history separate from the general payment list.

**Navigation:**
```
Dashboard → Payments → [expand payment]
  → Preview | Download | Print   (no "Request Refund" button)

Dashboard → Appointments → Cancel Appointment
  → cancels immediately (no refund quote shown, no refund request triggered)
```

**Current Status:** 🟡 UI exists but only for the read side; the request action is not connected.

**Missing Work:** A "Request Refund" button (shown for `paid` payments, or surfaced from the appointment-cancel flow for paid appointments) that does `POST {BACKEND_URL}/api/payments/[id]/refund` — same `fetch` + `credentials: "include"` pattern the page already uses for `GET /api/payments`. Refund-eligibility copy (cutoff policy) is not implemented anywhere and would need product input on the exact policy text.

**Reuse:** The exact button row already in the expanded payment card (Preview/Download/Print) — add a fourth button using the same `fetch(env.BACKEND_URL...)` pattern already imported into the file.

**Recommendation:** Connect existing UI (add one button, reuse existing fetch pattern). No new backend, no new page.

---

## 5. Clinic / Facility Search

**Backend:**
✅ Fully exists. `api.facilities.listFacilities(db, {service?, limit?, offset?})`, `getFacility(db, id)`, `nearbyFacilities` (RPC `get_nearby_facilities`), `nearbyBranches` (RPC `get_nearby_branches`).

**UI:**
🟡 Partial — a map exists, but there is no text search. `components/dashboard/NearbyDoctorsMap.tsx` calls `get_nearby_facilities` directly (inline `supabase.rpc`, not via `api.facilities`) and renders facility pins with popups (name, distance, rating, top doctors) — but this is geolocation-gated and passive, not searchable by name/service. `components/dashboard/SiteSearch.tsx` (the header search bar used everywhere) queries **only `doctors`**, plus static indexes for pages/lab-tests/surgeries/articles — it never queries `facilities`. `api.facilities.listFacilities` (the actual list/filter function) is called from **zero** frontend files.

**Navigation:**
```
Dashboard → header search bar → doctors, pages, lab-tests, surgeries, articles
  (facilities are not a search category)

Find Doctors page → "Clinics near you" map
  (facility markers shown, but not searchable/filterable by name or service)
```

**Current Status:** 🟡 UI exists (map) but the actual `listFacilities` search/filter backend is entirely unconnected.

**Missing Work:** Extend `SiteSearch.tsx` with a facilities branch mirroring its existing doctor-query block (debounced `.ilike` on `facilities.name`, or call `api.facilities.listFacilities`); optionally a service-type filter chip row (the function already supports `service`).

**Reuse:** `SiteSearch.tsx`'s doctor-search `useEffect` (lines ~73–92) is a near drop-in template for a facilities branch — same debounce, same result-group rendering (`ResultGroup`).

**Recommendation:** Connect existing UI pattern (extend SiteSearch). No new page, no new backend.

---

## 6. Clinic / Facility Profile

**Backend:**
✅ Fully exists. `api.facilities.getFacility(db, id)` returns the full facility detail row (`DETAIL_SELECT`).

**UI:**
❌ Missing entirely. There is no `/dashboard/facilities/[id]` route or equivalent anywhere. `DoctorProfilePage` hardcodes `hospital: "MediLink Network"` / `"شبكة ميدلينك"` for **every** doctor regardless of their actual `facility_id` — the real facility name isn't even displayed, let alone linked. `NearbyDoctorsMap`'s popups link straight to `/dashboard/find-doctors/${doc.id}` (doctor pages), bypassing any facility page entirely.

**Navigation:** None exists — there is no path in the current app that leads to a facility profile.

**Current Status:** ❌ Neither UI nor a reachable path exists (backend alone is ready).

**Missing Work:** A genuinely new page: facility hero (name, address, hours, rating), a real "Doctors at this facility" list (query `doctors` by `facility_id` — already done ad hoc inside the map popup, so the query pattern exists), services list, reviews (reuse `api.reviews`), and available-appointments entry points into the existing `BookingModal`.

**Reuse:** `DoctorProfilePage`'s overall layout (hero → details grid → reviews section → sticky booking CTA) is a strong structural template to adapt — most of the visual/component work doesn't need to be invented from scratch.

**Recommendation:** Create new page. Backend is ready; this is UI-only work, but substantial enough (a full page with several sections) to flag as its own line item rather than a "quick win."

---

## 7. Favourites (Doctors / Clinics)

**Backend:**
✅ Fully exists. `api.favourites.listFavourites(db, targetType?)`, `isFavourite(db, {targetId, targetType})`, `toggleFavourite(db, {targetId, targetType})` — generically supports both doctors and facilities via `targetType`.

**UI:**
❌ Missing entirely. A repo-wide search for `favourites`/`isFavourite`/`toggleFavourite` inside `frontend/src` returns **zero matches**. No heart/bookmark/star-toggle icon on `DoctorCard` (find-doctors list) or `DoctorProfilePage`. No "Favourites" entry in `DashboardNav`'s nav links or user menu. No favourites list page.

**Navigation:** None exists.

**Current Status:** ❌ Neither.

**Missing Work:** A toggle icon (heart/star) on `DoctorCard` and on the doctor-profile hero, wired to `toggleFavourite` + `isFavourite` (to render initial state); a "Favourites" nav-menu entry; a favourites list view.

**Reuse:** The favourites list view doesn't need a bespoke layout — it can reuse `FindDoctorsPage`'s existing grid + `DoctorCard` component, just sourced from `listFavourites` instead of `searchDoctors`. Only the toggle icon itself and the list route are net-new.

**Recommendation:** Create new UI (icon is trivial; a dedicated list page is optional-but-small since it reuses the Find Doctors grid). No new backend.

---

## 8. Notification APIs (List, Bell, Mark Read, Mark All Read, Delete)

**Backend:**
✅ Fully exists and used correctly where it's wired: `api.notifications.listNotifications`, `markAllRead`, `markRead`, `deleteNotification`, `unreadCount`.

**UI:**
✅ Exists and connected on the dedicated page — 🟡 but a second, disconnected copy exists in the header.
- `/dashboard/notifications` (`dashboard/notifications/page.tsx`): real list, filter tabs, mark-one-read, mark-all-read, dismiss/delete — every action is a genuine optimistic call to the shared API with rollback on failure. This is fully working.
- `dashboard/page.tsx` (home): also real — same `listNotifications`/`markAllRead` calls, correctly mapped.
- `components/dashboard/DashboardNav.tsx` `NotificationBell`: **uses a fully hardcoded `NOTIF_ITEMS` array** (5 fake notifications — "Dr. Aisha reminder," "Dr. Omar confirmed," etc.) with a fake unread badge. This is a second, independent notification surface that never calls the real API — it contradicts what the notifications page and dashboard home already show correctly.

**Navigation:**
```
Dashboard → 🔔 bell (header, every page) → dropdown → "View all" → /dashboard/notifications
  (bell dropdown content itself is currently FAKE — the "View all" link is real)

Dashboard home → Notifications section → real data
```

**Current Status:** ✅ Connected on the two real surfaces (page + dashboard home) / 🟡 duplicate mock on the header bell.

**Missing Work:** No new capability needed — this is purely a **defect fix**: replace `NOTIF_ITEMS` in `DashboardNav.tsx` with a real `listNotifications({limit: 5})` + `unreadCount()` call (the exact logic already exists in `dashboard/page.tsx`'s notification-loading code and can be lifted/shared).

**Reuse:** `dashboard/page.tsx`'s `toNotif`-equivalent mapping and `notifications/page.tsx`'s `toNotif`/`uiTypeOf`/`relTime` helpers should be extracted or duplicated into the bell instead of the static array.

**Recommendation:** Connect existing UI (fix the nav bell to match the already-correct notifications page). No new backend, no new page.

---

## 9. Notification Preferences / Push Preferences

**Backend:**
✅ Fully exists. `api.notifications.getPreferences(db)` / `updatePreferences(db, {push?, email?, sms?, categories?})` against table `notification_preferences`; backend route `POST /api/notifications/push` for server-to-server dispatch (Expo → FCM/APNs).

**UI:**
❌ Missing entirely. Zero references to `getPreferences`/`updatePreferences`/"preference" anywhere in `frontend/src` (verified by direct grep of `profile/page.tsx` and the whole `frontend/src` tree). No toggle switches for channel (push/email/SMS) or category preferences exist on the Notifications page, the Profile page, or anywhere else.

**Navigation:** None exists.

**Current Status:** ❌ Neither (functions exist, nothing calls them).

**Missing Work:** A preferences panel — toggle rows for push/email/SMS and per-category mute — that reads `getPreferences` on load and calls `updatePreferences` on change.

**Reuse:** Two good insertion points, either works: (a) a "Preferences" panel/drawer at the top of `/dashboard/notifications` (colocated with the feature it controls), or (b) a new `#preferences` anchor-section on the Profile page, reusing the existing anchor-section pattern already used for Personal/Health/Emergency/Family/Medications/Documents.

**Recommendation:** Create new UI (small — a panel, not a page). No new backend.

---

## 10. Data Export (and related Privacy UI)

**Backend:**
✅ Fully exists. `GET/POST /api/users/me/data-export`, `GET /api/users/me/data-export/[id]`, `DELETE /api/users/me/account`, `POST /api/users/me/account/cancel-deletion`; edge functions `export-user-data` and `purge-user-auth` do the actual work asynchronously.

**UI:**
❌ Missing entirely. No related UI anywhere in `frontend/src` — no "Export my data," no "Delete my account," no export-status/download list, no cancel-deletion affordance.

**Navigation:** None exists. There is no Settings or Privacy page of any kind in the app (confirmed: `DashboardNav` has no Settings link; Profile page's anchor sections stop at Documents).

**Current Status:** ❌ Neither.

**Missing Work:** A genuinely new Privacy/Data section: "Request my data" button + a list of past export requests with status/download links (`GET /api/users/me/data-export`), and a "Delete my account" flow with a confirmation step and a way to cancel a pending deletion (`POST .../cancel-deletion`).

**Reuse:** No existing UI to reuse directly, but it pairs naturally with Notification Preferences (#9) as one combined "Settings & Privacy" destination rather than two separate pages.

**Recommendation:** Create new page (backend fully ready — this is pure frontend work, but a full page's worth).

---

## 11. Prescription Share / PDF

**Backend:**
✅ Fully exists. `POST /api/prescriptions/[id]/generate-pdf`, `GET /api/prescriptions/[id]/download`, `GET /api/prescriptions/[id]/share-link` (signed, presumably time-limited per the "24h pharmacy share link" requirement).

**UI:**
🟡 Partial — a UI exists, but it's generic and disconnected from the real endpoints. `dashboard/records/page.tsx` aggregates prescriptions into a flat record list. Its "Download Record" button generates a **client-side plaintext `.txt` blob** (`downloadRecord()` — builds a text file from in-memory fields, not the real PDF endpoint), and "Share" uses the **Web Share API / clipboard** with a plain-text summary (`shareRecord()`) — neither calls `generate-pdf`, `download`, or `share-link`. There is no prescription detail page and no "send to pharmacy" affordance.

**Navigation:**
```
Dashboard → Records → [expand a prescription row] → Download | Share
  (both actions are local/generic — they never reach the real backend PDF/share-link endpoints)
```

**Current Status:** 🟡 UI exists but uses mock/local actions instead of the real backend for this specific record type.

**Missing Work:** For records where `category === "Prescriptions"`, swap the Download button to call `GET /api/prescriptions/[id]/download` (or trigger `generate-pdf` then download) and the Share button to fetch `GET /api/prescriptions/[id]/share-link` and share/copy the real signed URL instead of a text summary. A dedicated prescription detail view (medication list, dosage, doctor, "send to pharmacy") would be a further improvement but isn't strictly required to connect the existing buttons correctly.

**Reuse:** Same expand/Download/Share button row already built in `records/page.tsx` — only the `onClick` handlers for prescription-category rows need to change, not the surrounding UI.

**Recommendation:** Connect existing UI (swap the action implementation for one record type). No new page, no new backend.

---

## 12. Lab Result Detail & Mark Viewed

**Backend:**
✅ Fully exists. `api.labs.listLabResults(db)`, `markLabResultViewed(db, id)`, `getLabResultSignedUrl(db, path, expiresIn=300)`.

**UI:**
🟡 Partial — same situation as Prescriptions. `dashboard/records/page.tsx` lists lab results generically (title from `test_name`, detail from `notes`); expanding a row shows only that text plus the same generic Download (.txt blob)/Share (text) actions. `markLabResultViewed` is **never called** anywhere in the frontend, so `lab_results.is_viewed` never flips from a patient viewing it in the web app. `getLabResultSignedUrl` (the function that would let a patient actually open/download the real uploaded lab file) is likewise **never called** — confirmed by grep, its only two hits in the whole repo are its own definition and one incidental doc-comment reference in `lab-tests/page.tsx` explaining why that (unrelated, static) page can't reuse it. There is no analyte-detail-vs-reference-range view and no "AI note" (both called for explicitly in the Delivery Plan V2 scope for this module).

**Navigation:**
```
Dashboard → Records → [expand a lab result row] → Download | Share  (generic, local)
  (no "View Report" that opens the real file; no mark-as-viewed on open)
```

**Current Status:** 🟡 UI exists (list) but the two real backend calls for this feature are unused.

**Missing Work:** Call `markLabResultViewed(supabase, id)` when a lab-category record is expanded/opened (fire-and-forget, matching the optimistic pattern used elsewhere in the app). Add a "View Report" button that calls `getLabResultSignedUrl` and opens the real file, replacing/supplementing the generic text export. An analyte-detail view (values vs. reference range) and an "AI note" are net-new UI (and for the AI note, likely a net-new small backend call) beyond what exists today.

**Reuse:** Same expand block in `records/page.tsx` — add the two calls; no structural change needed for the base "connect it" work. The detail/reference-range/AI-note enhancement would need new UI (and possibly reuse the symptom-checker's streaming-AI pattern for the "AI note").

**Recommendation:** Connect existing UI (mark-viewed + signed URL — trivial). The richer detail/AI-note view is a separate, larger addition.

---

## Summary Table

| Feature | Backend | UI | Connected | New Page Needed? |
|---|:---:|:---:|:---:|:---:|
| Web Check-in | 🟡 (unsafe as-is) | ❌ | ❌ | No |
| Waitlist (Join/Leave/Claim) | 🟡 (claim ✅, join/leave need wrapper) | ❌ | ❌ | No |
| One-Tap Rebooking | ✅ | ❌ | ❌ | No |
| Refund Request/Status | ✅ | 🟡 (status only) | 🟡 | No |
| Clinic/Facility Search | ✅ | 🟡 (map only) | 🟡 | No |
| Clinic/Facility Profile | ✅ | ❌ | ❌ | **Yes** |
| Favourites | ✅ | ❌ | ❌ | No (icon + reused grid) |
| Notification List/Bell/Mark/Delete | ✅ | ✅ page / 🟡 bell | 🟡 | No |
| Notification Preferences | ✅ | ❌ | ❌ | No (panel/section) |
| Data Export & Privacy | ✅ | ❌ | ❌ | **Yes** |
| Prescription Share/PDF | ✅ | 🟡 (generic mock actions) | 🟡 | No |
| Lab Result Detail & Mark Viewed | ✅ | 🟡 (list only) | 🟡 | No |

---

## Prioritized Implementation Plan

### P0 — Both backend and UI exist but aren't connected (quick wins)
1. **Fix Notification Bell** (`DashboardNav.tsx`) — replace `NOTIF_ITEMS` with real `listNotifications`/`unreadCount`. Corrects an active inconsistency, not just a gap.
2. **One-Tap Rebooking** — add a "Book Again" button to completed appointments calling the already-wrapped `api.appointments.rebookAppointment`.
3. **Prescription Share/PDF** — point the existing Download/Share buttons (for prescription rows) at the real `download`/`share-link` endpoints instead of the local text blob.
4. **Lab Result mark-viewed + real file view** — call `markLabResultViewed` on expand and add a "View Report" button using `getLabResultSignedUrl`.

### P1 — Backend exists; needs a small-to-moderate new UI element (button/modal/panel/page), no new backend work
5. **Refund Request button** on the Payments page → `POST /api/payments/[id]/refund`.
6. **Favourites toggle icon** on doctor cards/profile → `api.favourites.toggleFavourite` (+ optional list page reusing the Find Doctors grid).
7. **Clinic/Facility Search** — extend `SiteSearch.tsx` with a facilities branch mirroring its existing doctor-search block.
8. **Notification Preferences panel** → `getPreferences`/`updatePreferences`.
9. **Waitlist Join/Leave** — add thin wrapper functions (RLS already permits the underlying table ops) + a "Join Waitlist" CTA in the booking modal's empty-slots state, plus a Waitlist tab on the Appointments page that surfaces the already-working claim flow.
10. **Clinic/Facility Profile page** — new page, backend (`getFacility`) fully ready; adapt `DoctorProfilePage`'s layout.
11. **Data Export & Privacy page** — new page, backend fully ready.

### P2 — Requires both new UI and new backend work
12. **Web Check-in** — the existing `checkin_and_enqueue` RPC isn't patient-safe as-is (no ownership check, staff-oriented parameters); needs a new patient-scoped RPC or wrapper that validates `auth.uid()` ownership and appointment timing, plus the check-in button and a basic post-check-in state.

### P3 — Large, new features to confirm scope before building
13. **Live queue-position visibility for patients** (real-time `queue_items` subscription/read) — patients currently have no visibility into queue position after check-in; bigger than a single feature.
14. **QR-code check-in** — no schema, library, or UI exists; confirm this is actually needed for *web* (vs. an in-clinic kiosk/mobile flow) before scoping it.
15. **Full waitlist productization** — offer countdown/expiry display, push-driven "a slot opened up" flow end-to-end, position-in-line display. The backend automation (`notify-waitlist`, `expire_waitlist_entries`) already exists; a complete patient-facing UX around it is more than the P1 join/leave/claim buttons.
16. **Analyte-detail-vs-reference-range + AI note** for lab results — Delivery Plan V2 calls for this explicitly; it's more than "connect the existing list," it's a new detail view (and likely a new small AI endpoint for the note).
