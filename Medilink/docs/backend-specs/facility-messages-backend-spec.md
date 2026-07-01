# Facility Messages — Backend Implementation Specification (DEFERRED / future task)

> **Status:** Module 4 of the post-integration pass. **No clean backend source exists** for the
> designed Facility Messages inbox (read-only admin updates with a per-row **source**, **unread**
> state, and patient relevance). The screen stays **mock-served** so it renders exactly as designed.
> No backend/API, mock, or placeholder was invented.

## What the design needs (p32)
A read-only inbox of administrative updates, each row: **source** (e.g. "Royal Hospital", "Aster Lab",
"MediLink"), a **preview** line, a **timestamp**, and an **unread** dot.

## What exists in the backend (and why none fits cleanly)
- **`announcements`** (`facility_id, title, message, target_audience, created_at`; RLS
  `announcements_patients_read USING (true)` → public read). Fanned out to `in_app_notifications` by
  the `broadcast-announcement` Edge Function.
  - ✅ has a source (facility name via `facility_id`), preview (`title/message`), timestamp.
  - ❌ **no per-patient unread state** (no `announcement_reads` table).
  - ❌ **not patient-scoped at read time** (public read returns every facility's announcements; the
    `muted_facilities` filter is applied only during fan-out, not on a direct read).
  - ❌ **no "MediLink" system sender** (`facility_id` is NOT NULL — every row belongs to a facility).
- **`in_app_notifications`** (`user_id, type, title, body, data, is_read, created_at`; RLS own-rows).
  - ✅ per-patient + `is_read` (unread) + already receives the announcement fan-out.
  - ❌ **no source/sender name** and **no category** — the fan-out writes `type: "info"` with no
    `data`, so facility messages are indistinguishable from other notifications and carry no source.
- **`messages` / `conversations`** = patient↔doctor **chat** = the **deferred Phase-2 "Doctor
  messaging"** feature (the Design Doc states the MVP replaces it with read-only Facility Messages).
  Not the source for this screen.

**Conclusion:** neither table can back the inbox without fabricating data — `announcements` lacks
unread + patient scoping + system sender; `in_app_notifications` lacks source + a facility category.

## Recommended backend work (reuses the existing notification pipeline)
**Enrich the notification fan-out with a source + category** (preferred — minimal, per-patient, unread
comes for free):
1. Add to `public.in_app_notifications`:
   ```sql
   ALTER TABLE public.in_app_notifications
     ADD COLUMN source_name TEXT,        -- "Royal Hospital" | "Aster Lab" | "MediLink"
     ADD COLUMN category    TEXT;        -- e.g. 'facility_message' (to isolate this inbox)
   CREATE INDEX ix_in_app_notifications_category ON public.in_app_notifications (user_id, category, created_at DESC);
   ```
2. Update **`broadcast-announcement`** to stamp `source_name = facilities.name` and
   `category = 'facility_message'` on each inserted row (join the facility name once).
3. For **system** messages (invoice ready, ID upload requests, etc.), have their producers stamp
   `source_name = 'MediLink'` + `category = 'facility_message'` where they belong in this inbox.
4. **Shared API** `listFacilityMessages(db)` →
   `select id, source_name, title, body, is_read, created_at from in_app_notifications
    where user_id = auth.uid() and category = 'facility_message' order by created_at desc`.
   (Optionally a `markFacilityMessageRead(id)`.)

**Alternative (heavier):** a dedicated per-patient `facility_messages` table (patient_id, source, title,
preview, is_read, created_at) with RLS + read-tracking + fan-out from `announcements`. Only choose this
if Facility Messages must be fully independent of the notification feed.

## Mobile wiring (once the source + category exist)
- Implement `notificationRepo.facilityMessages` (real) → `api.notifications.listFacilityMessages`;
  map rows → `FacilityMessage { source: source_name, preview: body, time: created_at, unread: !is_read }`.
- Flip the hybrid `notification.facilityMessages` from mock → real. No screen change — the screen
  already consumes `useFacilityMessages`; `iconFor`/`isBrand` already special-case "MediLink".

## Until implemented
Facility Messages stays **mock-served** (matches the approved design). The Notification Center
(`in_app_notifications`) is already fully real; Facility Messages is the only notifications sub-surface
that remains mock, purely because it needs a per-row source + category the backend doesn't emit yet.

## Rollout
1. Add `source_name` + `category` to `in_app_notifications` (+ index).
2. Stamp them in `broadcast-announcement` and the system-notification producers.
3. Add `shared` `listFacilityMessages` (+ optional mark-read); implement mobile real
   `notification.facilityMessages`; flip hybrid.
