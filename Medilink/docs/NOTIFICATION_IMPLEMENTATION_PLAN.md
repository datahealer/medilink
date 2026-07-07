# MediLink Patient Notification System — Implementation Plan

**Author role:** Senior Backend Engineer / Architect review
**Status:** Planning only — **no code has been written**. This document is the deliverable for review before Phase 1 implementation begins.
**Scope:** Patient-facing notifications only (`in_app_notifications`, consumed by the Notification Bell and `/dashboard/notifications`). Clinic-portal/staff notification consumption is out of scope, but two of the affected RPCs are shared with that (unbuilt-in-this-repo) surface, which materially affects the design — see §0.4.

---

## Phase 0 — Architecture Review

### 0.1 Current architecture (as it exists today, verified by reading source — not assumed)

```
Write side (scattered, no shared helper):
  backend/src/app/api/payments/webhook/route.ts   → 4 separate inline .insert() calls
  supabase/functions/notify-waitlist/index.ts     → 1 inline .insert() call
  supabase/functions/notify-lab-result/index.ts   → 2 inline .insert() calls
  supabase/functions/broadcast-announcement/index.ts → 1 inline .insert() call
  supabase/functions/generate-health-insights/index.ts → 2 inline .insert() calls
  book_appointment_atomic / cancel_appointment_safe /
  reschedule_appointment_atomic RPCs               → ZERO inserts (nothing happens)

Storage:
  public.in_app_notifications (id, user_id, type, title, body, data jsonb, is_read, created_at)
  user_id → FK → public.profiles(id)  [the auth uid — NOT patient_profiles.id]
  type    → Postgres ENUM notification_type_enum, currently exactly {'info','warning','error'}

Read side (correct, already fixed in the previous session):
  shared/src/api/notifications.ts → listNotifications / unreadCount / markAllRead / markRead / deleteNotification
  All filter by .eq("user_id", getCurrentUserId(db))  — i.e. auth.uid(). Correct.
  frontend DashboardNav bell + /dashboard/notifications page — both correctly wired to this API.
```

### 0.2 Every place a notification *should* originate (from the task's event list), and what exists today

| Event | Insert exists today? | Mechanism today |
|---|---|---|
| Appointment booked | ❌ No | `book_appointment_atomic` RPC — appointments-table insert only |
| Appointment confirmed (payment success) | 🔴 Yes, but wrong `user_id` | `payments/webhook/route.ts:274` |
| Appointment cancelled | ❌ No | `cancel_appointment_safe` RPC — status update only |
| Appointment rescheduled | ❌ No | `reschedule_appointment_atomic` RPC — slot update only |
| Upcoming appointment reminder | ❌ No | No mechanism of any kind exists |
| Payment successful | 🔴 Yes, but wrong `user_id`, and **only reachable via the webhook** | `payments/webhook/route.ts:274` |
| Refund processed | ❌ No | `poll-refund-status` edge function only updates `refunds.status` |
| Lab result uploaded | ⚠️ Written, but unreachable | `notify-lab-result` edge function is correct; its trigger was deliberately dropped and never replaced |
| Prescription uploaded | ❌ No | No mechanism |

*(Full evidence trail for this table was produced in the prior investigation turn and re-verified independently for this plan — see §0.4 for the parts that change the design.)*

### 0.3 Existing infrastructure inventory (what to reuse vs. what to build)

| Component | Exists? | Reuse plan |
|---|---|---|
| Notification table | ✅ `in_app_notifications` | Reuse as-is — schema is sound |
| Read API | ✅ `shared/src/api/notifications.ts` | Reuse as-is — **zero frontend changes needed for Phases 1–2** |
| Write helper/service | ❌ None anywhere in the repo | **Must be built** — see §0.5 |
| Correct `patient_profiles.id → user_id` resolution pattern | ✅ Exists (`notify-lab-result`, `notify-waitlist`) | Reuse the pattern, don't reinvent |
| Backend→edge-function call convention | ✅ `fetch(SUPABASE_URL/functions/v1/<fn>, {Authorization: Bearer SERVICE_ROLE_KEY})` | Reuse if Phase 3 ever needs an edge function (current recommendation avoids needing one — see Phase 3) |
| Working cron precedent | ✅ `auto-unavailable-doctors` (pure SQL, `*/5 * * * *`, no edge function) | **This is the template for Phase 3**, not the broken `net.http_post`-trigger pattern |
| Broken cron/trigger precedent | 🔴 `notify_waitlist_edge()` trigger — hardcoded placeholder URL/service-role key, never fires successfully | Do **not** copy this pattern |
| SECURITY DEFINER precedent for privileged writes from a patient-invoked RPC | ✅ `checkin_and_enqueue`, `claim_waitlist_appointment`, `enqueue_appointment` | **This is the template for the new `create_notification()` DB helper** |
| Per-facility configurable timing precedent | ✅ `facility_settings.cancellation_cutoff_hours` / `.reschedule_cutoff_hours` | Reuse this table for Phase 3's configurable reminder window |
| Notification `type` enum | ⚠️ Exists but too narrow, and already has one confirmed-broken value (`waitlist_offer`, not a member) | Must be widened/changed — see §0.6 |

### 0.4 Two facts from re-verification that change the design

1. **`book_appointment_atomic`, `cancel_appointment_safe`, and `reschedule_appointment_atomic` all run as `SECURITY INVOKER`** (confirmed: no `SECURITY DEFINER` clause in any of their currently-active definitions). This means if we naively insert `user_id: auth.uid()` inside these functions to notify "the patient who just acted," it works correctly for every real patient-web call path (RLS already guarantees the caller owns the appointment whenever the action succeeds) — **but** these RPCs are also callable by facility-admin-role sessions (`appointments_facility_admin` RLS policy grants staff `FOR ALL`). If a staff session ever calls one of these (e.g., a future clinic-portal build), `auth.uid()` would be the *staff member's* id, not the patient's, and a naive self-notify would notify the wrong person. This is why the plan uses a dedicated `SECURITY DEFINER` helper that resolves the recipient from the **appointment's own `patient_id`**, not from `auth.uid()` — correct regardless of caller.

2. **The Thawani webhook is not the only path that can mark a payment "paid."** `backend/src/app/api/payments/verify/route.ts` independently re-checks Thawani's API and, if paid, flips `payments.status` and `appointments.status` itself — its own doc-comment says this exists specifically because *"the webhook... cannot reach a local/LAN backend during development."* **This route currently has zero notification logic.** If a tester's webhook never reaches their machine (very likely in local/dev testing — exactly the scenario the comment describes), the *only* code that ever runs is `verify`, and today it creates no notification at all, independent of the `user_id` bug. **This is a second, independent explanation for "no notifications ever appeared" and must be fixed in the same phase as the webhook, using the same shared helper**, or the bug will appear "fixed" in production but keep failing for exactly the audience most likely to be testing it (dev/local).

### 0.5 Should a reusable notification helper be created? — Yes, and it needs two layers, not one

A single shared function is not sufent because the codebase has two genuinely different trust contexts that write notifications:

**Layer A — Database layer: `public.create_notification(p_user_id, p_type, p_title, p_body, p_data)`**
A small `SECURITY DEFINER` Postgres function (same pattern already proven safe in this codebase by `checkin_and_enqueue`/`claim_waitlist_appointment`). Used **from inside** the `SECURITY INVOKER` appointment RPCs (book/cancel/reschedule) and the Phase 3 reminder cron function, so a notification can always be written for the *correct resolved patient*, regardless of who technically invoked the parent RPC.

Because this function must be `GRANT EXECUTE`'d to `authenticated` (patients call it transitively through the booking/cancel/reschedule RPCs, which run as invoker), it needs one guard clause to prevent a signed-in patient from calling `create_notification()` directly to spam another user's feed:

```sql
IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
  RAISE EXCEPTION 'Cannot create a notification for another user';
END IF;
```

`auth.uid()` is `NULL` for service-role connections (no user JWT), so this guard never blocks the backend's own service-role writes, and it never blocks the legitimate self-notify case (patient booking their own appointment — the resolved recipient always equals `auth.uid()` in every real flow, because RLS already prevents the RPC from succeeding otherwise). It *does* block a malicious `supabase.rpc('create_notification', {p_user_id: '<someone-else>', ...})` call from the browser.

**Layer B — Backend (Next.js) layer: `backend/src/lib/notifications/`**
A small TypeScript module used by routes that already hold a **service-role** client (which bypasses RLS entirely, so Layer A's guard is irrelevant there). Its job is purely to stop the *duplication* already visible in `payments/webhook/route.ts` (4 inline insert call sites in one file) and to hold the **one** correct `patient_profiles.id → user_id` resolution function, so the exact bug that caused this investigation can't recur at a fifth call site later.

```ts
// backend/src/lib/notifications/resolvePatientUserId.ts
export async function resolvePatientUserId(service: ServiceClient, patientProfileId: string): Promise<string | null>

// backend/src/lib/notifications/createNotification.ts  (added in Phase 2, once new types exist)
export async function createNotification(service: ServiceClient, input: {
  userId: string; type: NotificationType; title: string; body: string; data?: Record<string, unknown>;
}): Promise<void>
```

Both layers write to the exact same table and the exact same column names — there is no data-model split, only a call-site split by trust context. This directly answers the brief's question: **yes, a shared helper is the correct architecture**, because (a) the duplication is already visible and already caused a real bug, (b) two genuinely different privilege contexts exist and each needs its own safe entry point, and (c) every future notification-writing feature (Phase 3's reminders, and eventually refunds/labs/prescriptions) can reuse Layer A or Layer B without adding a sixth hand-rolled `.insert()` call.

### 0.6 Notification type standardization

**Finding:** `in_app_notifications.type` is a native Postgres `ENUM` (`notification_type_enum`), currently constrained to exactly `'info' | 'warning' | 'error'`. This is confirmed by reading the enum's creation and the column's `ALTER COLUMN ... TYPE notification_type_enum` in `20260406051128_hams_missing_+_fix_patch.sql`. **This already causes one silent, currently-broken insert**: `notify-waitlist/index.ts` inserts `type: "waitlist_offer"`, which is not a member of the enum — every waitlist-offer notification insert has been failing (caught, logged, ignored) since that code was written. This is independent evidence that the enum is too narrow for the product's actual needs, not just for this task's new types.

**Recommendation:** convert `type` from a native `ENUM` to `TEXT NOT NULL DEFAULT 'info'` with a `CHECK` constraint enumerating the canonical set, rather than repeatedly `ALTER TYPE ... ADD VALUE`. Reasons:
- Postgres enum value additions are transactionally awkward (a value added by `ALTER TYPE ... ADD VALUE` cannot always be used later in the *same* transaction/migration, depending on Postgres version) — a `CHECK` constraint has no such restriction and can be replaced in one statement when the list changes.
- A `CHECK` constraint list is simple to keep in lockstep with a single TypeScript source of truth (below), whereas a native enum's values must be queried from `pg_enum` to stay in sync.

**Canonical list** (mirrors the task's proposed set, plus two additions justified by evidence above):

```
info, warning, error,                                  -- existing, kept for backward compatibility
appointment_booked, appointment_confirmed,
appointment_cancelled, appointment_rescheduled,
appointment_reminder,
payment_success, payment_failed,                        -- payment_failed added: no current inserter, but reserved now
                                                          --   so Phase 1's helper doesn't need a second migration later
refund_processed,
lab_result_ready, prescription_uploaded,
waitlist_offer                                           -- added: fixes the already-broken notify-waitlist insert as a side effect
```

This exact list will live in one place — `shared/src/config/notifications.ts` — exported as both a `const` array (for the DB `CHECK` constraint generation / migration authoring) and a TypeScript union type, imported by the backend helper. **No duplicate/conflicting name is introduced**; every value maps 1:1 to one event.

**Frontend impact: none required.** The existing bell/notifications-page categorizer (`notifUiType()` in `frontend/src/app/dashboard/page.tsx` and `.../notifications/page.tsx`) does substring matching (`t.includes("pay")`, `t.includes("lab")`, `t.includes("book")`, `t.includes("confirm")`, etc.). I checked every new type string against it: all but two (`appointment_cancelled`, `appointment_rescheduled`) fall into a sensible existing bucket automatically. Those two fall through to the default "Reminder ⏰" bucket — cosmetically imprecise (wrong icon/tag colour) but functionally correct (the notification still appears, is readable, and is mark-as-read/delete-able). I recommend a **one-line, optional, non-blocking follow-up** (add `cancel`/`reschedul` to the matcher) rather than bundling a frontend change into this backend-focused plan — flagged here so it isn't forgotten, not silently deferred.

---

## Recommended architecture (summary diagram)

```
                       ┌────────────────────────────┐
                       │ shared/src/config/          │
                       │   notifications.ts          │   ← single source of truth for `type` values
                       └─────────────┬────────────────┘
                                     │ imported by
             ┌───────────────────────┼───────────────────────┐
             │                                                │
   ┌─────────▼─────────┐                          ┌───────────▼───────────┐
   │ DB: create_notification()  │                  │ backend/src/lib/notifications/ │
   │ SECURITY DEFINER            │                  │  resolvePatientUserId()        │
   │ guards p_user_id = auth.uid()│                  │  createNotification()          │
   │ or NULL (service role)      │                  └───────────┬───────────┘
   └─────────┬─────────┘                                        │
             │ called from                                       │ called from
   ┌─────────┼──────────────────────┐                ┌──────────┼───────────┐
   │ book_appointment_atomic (RPC)   │                │ payments/webhook/route.ts │
   │ cancel_appointment_safe (RPC)   │                │ payments/verify/route.ts  │
   │ reschedule_appointment_atomic   │                └────────────────────────────┘
   │ reminder cron function (Ph.3)   │
   └──────────────────────────────────┘
                                     │
                                     ▼
                       public.in_app_notifications
                                     │
                                     ▼
              shared/src/api/notifications.ts  (UNCHANGED — already correct)
                                     │
                                     ▼
        DashboardNav bell  +  /dashboard/notifications page  (UNCHANGED)
```

---

## Implementation Phases

### Phase 1 — Payment Notification Fix (smallest possible diff, ships first)

**Goal:** make the *already-attempted* patient payment notification actually land, in **both** places a payment can be finalized. No schema change, no new types — `type` stays `"info"`, exactly as today, to keep this phase's blast radius minimal.

**Files that change:**
| File | Change | Why |
|---|---|---|
| `backend/src/lib/notifications/resolvePatientUserId.ts` (new) | Small function: `patient_profiles.select("user_id").eq("id", patientProfileId).single()` | Centralizes the exact correct pattern already used in `notify-lab-result`/`notify-waitlist`, so it's defined once, not re-typed |
| `backend/src/app/api/payments/webhook/route.ts` | Replace `payment.patient_id` at line 248 (`auth.admin.getUserById`) and line 275 (`in_app_notifications.insert`) with `resolvePatientUserId(service, payment.patient_id)`, resolved once near the top of the handler | Fixes the confirmed root cause; the doctor/facility-admin notification blocks (lines 101-140, already correct) are **not touched** |
| `backend/src/app/api/payments/verify/route.ts` | When this route itself detects `payment_status === "paid"` and flips status (lines 112-123), call the same patient-notification logic (via the Phase-1 helper) that the webhook uses | Closes the second gap found in §0.4 — the dev/local fallback path currently notifies no one |

**Duplicate-notification prevention:** both routes already guard against re-processing a payment that's already `"paid"` (`alreadyPaid` in the webhook; `payment.status !== "paid"` in `verify`) — this phase reuses those existing guards unchanged, it does not add new ones. Since both routes gate on the *same* underlying `payments.status` column, only one of them will ever actually transition a given payment from not-paid → paid, so only one of them will ever fire the notification for a given payment — even though both routes *can* run.

**Verification plan (as requested):**
- **Successful payment:** complete a real booking → Thawani checkout → webhook fires → confirm exactly one `in_app_notifications` row appears for the patient's real `auth.uid()`, visible in both the bell and `/dashboard/notifications`.
- **Failed payment:** cancel out of Thawani checkout / simulate a non-`paid` gateway status. Confirm **no** patient notification is created (this webhook is success-only by design; a rejected/abandoned checkout should not flip `payments.status`, so the `!alreadyPaid` block's notification code should never execute) — this test also proves the fix doesn't accidentally fire on non-success states.
- **Duplicate webhook retry:** manually replay the same webhook payload (Thawani does retry on non-2xx). Confirm the second call sees `alreadyPaid === true` and creates zero additional notification rows.
- **Local/dev path with no reachable webhook:** complete a checkout in an environment where the webhook cannot reach the backend (the exact scenario the `verify` route's own comment describes), rely on the frontend calling `/api/payments/verify`, and confirm the patient notification still appears via the new verify-route logic.

**Effort estimate:** 0.5–1 day including the four verification scenarios above.

---

### Phase 2 — Appointment Lifecycle Notifications

**Prerequisite sub-phase — schema foundation (must land before 2a–2d):**
| File | Change |
|---|---|
| New migration, e.g. `supabase/migrations/<ts>_notification_type_text_check.sql` | `ALTER TABLE in_app_notifications ALTER COLUMN type TYPE TEXT USING type::text; ALTER TABLE in_app_notifications ALTER COLUMN type SET DEFAULT 'info'; ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_type_check CHECK (type IN (...canonical list...));` |
| New migration, e.g. `supabase/migrations/<ts>_create_notification_function.sql` | Defines `public.create_notification(...)` (Layer A, §0.5), with the `auth.uid()` guard, `GRANT EXECUTE` to `authenticated` and `service_role` |
| `shared/src/config/notifications.ts` (new) | Canonical `NOTIFICATION_TYPES` const + `NotificationType` union (§0.6) |
| `backend/src/lib/notifications/createNotification.ts` (new) | Layer B wrapper, typed against the shared union, used by webhook/verify (extends Phase 1's module) |

This sub-phase is independently testable: after it lands, run the existing Phase-1 payment flow again and confirm nothing regresses (the `CHECK` constraint must still accept `'info'`; the new `create_notification()` function isn't called by anything yet, so it's inert until 2a–2d wire it up).

**2a — Appointment Booked**
- **Insertion point:** inside `book_appointment_atomic`, immediately after the successful `INSERT ... RETURNING id INTO v_appointment_id` (before `RETURN json_build_object('success', TRUE, ...)`).
- **Recipient resolution:** the function already validates `p_patient_id`'s ownership against `auth.uid()` earlier in its body — reuse that same `patient_profiles` row (already selected) to get `user_id`, rather than adding a second lookup.
- **Call:** `PERFORM public.create_notification(v_patient_user_id, 'appointment_booked', 'Appointment Booked', format('Your appointment with Dr. %s has been booked for %s at %s.', v_doctor_name, p_slot_date, p_slot_start), jsonb_build_object('appointment_id', v_appointment_id));`
- **Why here, not client-side:** this is the *only* place "an appointment was successfully created" is known with certainty, atomically, exactly once, regardless of which frontend surface calls it (booking modal, rebook, symptom-checker-initiated booking, mobile app — all funnel through this one RPC). A client-side (React) notification-trigger would be skippable by a dropped connection right after the RPC returns.
- **Files changed:** one migration redefining `book_appointment_atomic` (`CREATE OR REPLACE FUNCTION`, additive — the existing signature/return shape is unchanged, so no frontend change needed).

**2b — Appointment Confirmed**
- **Insertion point:** `payments/webhook/route.ts` and `payments/verify/route.ts` — the exact locations touched in Phase 1, now additionally inserting an `appointment_confirmed` notification via the Phase-2 `createNotification()` TS helper, alongside the (now-fixed) `payment_success` one.
- **Design decision to confirm with you before implementing:** the task's spec lists `appointment_confirmed` and `payment_success` as two distinct types firing at the *same* moment (payment webhook). I recommend inserting **two separate rows** (matches the explicit type taxonomy requested, and the bell already renders multiple notifications per moment cleanly) rather than merging them into one message — but this is a UX call, not a technical constraint, and I want your sign-off before Phase 2 ships two notifications where the patient perceives "one thing happened."
- **Files changed:** `payments/webhook/route.ts`, `payments/verify/route.ts` (both already touched in Phase 1 — this is an additive change to the same call sites, not a new file).

**2c — Appointment Cancelled**
- **Insertion point:** inside `cancel_appointment_safe`, immediately after the `UPDATE ... SET status = 'cancelled' ...` succeeds, before `RETURN json_build_object('success', true)`.
- **Recipient resolution:** the function already locks and reads the full appointment row (`v_appt`) via `SELECT * INTO v_appt FROM appointments WHERE id = p_id FOR UPDATE` — resolve `v_appt.patient_id → patient_profiles.user_id` with one added lookup (this is the §0.4 safety case: never trust `p_user_id`/`auth.uid()` blindly here, resolve from the appointment's true owner).
- **Files changed:** one migration redefining `cancel_appointment_safe`.

**2d — Appointment Rescheduled**
- **Insertion point:** inside `reschedule_appointment_atomic`, immediately after the successful `UPDATE` (which sets the new slot columns), before `RETURN json_build_object('success', true)`.
- **Recipient resolution:** identical pattern to 2c, using the already-locked `v_appt`.
- **Files changed:** one migration redefining `reschedule_appointment_atomic`.

**Duplicate-notification prevention across 2a–2d:** each RPC reaches its new `create_notification()` call on exactly one control-flow path — the single success path immediately before its existing `RETURN`. None of these functions can be re-entered mid-transaction, and each models one atomic state transition (create / cancel / reschedule) that can only happen once per call. No idempotency flag is needed at this layer because the *trigger condition itself* (a successful RPC call) cannot naturally repeat for the same logical action.

**Effort estimate:** schema foundation 0.5 day; 2a/2c/2d each ~0.5 day (small, mechanical, same pattern three times); 2b ~0.5 day (extends Phase 1's files). ~2.5–3 days total for Phase 2.

---

### Phase 3 — Reminder Notifications (design only, per instructions — not implemented this round)

**Mechanism recommendation: `pg_cron` running a plain PL/pgSQL function directly — not an edge function.**

Justification, weighed against the two alternatives the task asked me to consider:
- **Supabase Scheduled (Edge) Function** — rejected as the primary mechanism. This codebase already tried the "cron → `net.http_post` → edge function" pattern for waitlist offers (`notify_waitlist_edge()`), and it is **confirmed broken today** (hardcoded placeholder project ref and service-role key, never replaced). Recommending the same pattern again would repeat a known failure mode and add avoidable operational risk (network call reliability, secret management inside `net.http_post` headers) for a feature that doesn't need it.
- **Plain `pg_cron` + SQL function** — recommended. This codebase already has a **proven-working** precedent for exactly this shape: `auto-unavailable-doctors`, a `pg_cron` job on `*/5 * * * *` that runs a pure-SQL state check and update with no edge function involved. Reminders are in-app-only per the stated requirements (no SMS/email/push in scope here), so there is no need to leave the database at all — the new reminder function can call `create_notification()` (Layer A, built in Phase 2) directly, making Phase 3 pure reuse of Phase 2's infrastructure.

**Design:**

1. **Dedup table** (new, small): `appointment_reminders_sent (appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE, window_minutes INT, sent_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (appointment_id, window_minutes))`. A composite primary key naturally prevents the same appointment from getting the same window's reminder twice, and independently allows a *different* window (e.g. 30-min) to still fire later for the same appointment. This mirrors the same "let a unique constraint prevent the double-write" philosophy already used for queueing (`unique_active_queue_position`, `unique_appointment_active_queue` in `checkin_and_enqueue`'s migration) — not a new pattern for this codebase.

2. **Configurable window:** add `reminder_offsets_minutes INTEGER[] NOT NULL DEFAULT ARRAY[120, 30]` to the **existing** `facility_settings` table, exactly alongside `cancellation_cutoff_hours`/`reschedule_cutoff_hours` (same table, same "per-facility configurable timing" precedent, no new config table needed).

3. **The cron function** (runs every 5 minutes, matching the proven `auto-unavailable-doctors` cadence):
   ```
   FOR each confirmed appointment whose slot_date = CURRENT_DATE:
     FOR each offset in that facility's reminder_offsets_minutes:
       IF now() is within [slot_time - offset - 2.5min, slot_time - offset + 2.5min]   -- tolerance = half the tick interval
          AND NOT EXISTS (SELECT 1 FROM appointment_reminders_sent WHERE appointment_id=... AND window_minutes=offset)
       THEN
          INSERT INTO appointment_reminders_sent (appointment_id, window_minutes) VALUES (..., offset)
            ON CONFLICT DO NOTHING;
          IF the insert above actually happened (not a conflict) THEN
            PERFORM create_notification(patient_user_id, 'appointment_reminder', 'Appointment Reminder',
              format('Your appointment with Dr. %s is in %s minutes.', ..., offset), jsonb_build_object('appointment_id', ...));
          END IF;
   ```
   The `ON CONFLICT DO NOTHING` + "did it actually insert" check is the same claim-then-act idiom already used elsewhere in this codebase for exactly this class of race (two overlapping cron ticks must not both send the same reminder).

4. **Requirements checklist:**
   - ✅ Only confirmed appointments — filtered in the `WHERE` clause (`status = 'confirmed'`).
   - ✅ Only today's appointments — `slot_date = CURRENT_DATE` (cheap index-friendly filter; the offset math further narrows to the actual time window).
   - ✅ No duplicate reminders — the composite-PK dedup table.
   - ✅ Configurable window — per-facility array on `facility_settings`, not hardcoded.

5. **Recommended default schedule: 2 hours and 30 minutes before** (`ARRAY[120, 30]`), not three separate reminders. Two well-spaced reminders (an early heads-up + a final nudge) covers the useful cases from the task's example (2h/1h/30min) without the redundancy of a middle 1-hour ping that arrives too close to the 2-hour one to add new information for a same-day appointment. Facilities that want the full 2h/1h/30min cadence can opt in by setting `reminder_offsets_minutes = ARRAY[120,60,30]` — the mechanism supports any list, this is just the recommended default.

**Not implemented this round, per your instruction** — this section is the design to review before Phase 3 coding starts.

---

## Implementation Order (safest first)

| Order | Phase | What ships | Depends on |
|---|---|---|---|
| 1 | Payment bug fix | Fix `user_id` resolution in webhook **and** verify route | Nothing — smallest, highest-value, zero schema risk |
| 2 | Schema foundation | `type` → TEXT+CHECK, `create_notification()` DB function, shared TS type list, backend helper module | Phase 1 (reuses its new `resolvePatientUserId`) |
| 3 | Appointment Booked | Insert inside `book_appointment_atomic` | Phase 2 foundation |
| 4 | Appointment Confirmed | Insert inside webhook/verify (extends Phase 1's files) | Phase 2 foundation |
| 5 | Appointment Cancelled | Insert inside `cancel_appointment_safe` | Phase 2 foundation |
| 6 | Appointment Rescheduled | Insert inside `reschedule_appointment_atomic` | Phase 2 foundation |
| 7 | Reminder system | `pg_cron` + dedup table + `facility_settings` column (design above; implement only after your sign-off) | Phase 2 foundation (reuses `create_notification()`) |

This order is deliberately "smallest independently-shippable and testable unit first": each numbered step can be deployed, verified against the Notification Bell, and rolled back independently without touching the steps before or after it. Booked/Confirmed/Cancelled/Rescheduled are ordered 3→6 purely by how commonly a patient encounters them (nearly everyone sees "booked" and "confirmed"; fewer see "cancelled"/"rescheduled"), so the highest-traffic paths get tested first and any issue surfaces early.

---

## Before Coding — Summary

**Which files will change, and why:**

| File | Phase | Why this file |
|---|---|---|
| `backend/src/lib/notifications/resolvePatientUserId.ts` (new) | 1 | Centralize the one correct `patient_profiles.id → user_id` lookup, reused by every later phase |
| `backend/src/app/api/payments/webhook/route.ts` | 1, 2b | Contains the confirmed bug; already has the correct patient-uid-resolution pattern nearby (unused) for other purposes |
| `backend/src/app/api/payments/verify/route.ts` | 1, 2b | The second, currently-silent path that can finalize a payment without ever notifying anyone |
| `supabase/migrations/<ts>_notification_type_text_check.sql` (new) | 2 | Widens `type` safely without native-enum transactional pitfalls |
| `supabase/migrations/<ts>_create_notification_function.sql` (new) | 2 | Introduces the single reusable, guarded DB-level write primitive |
| `shared/src/config/notifications.ts` (new) | 2 | One canonical list of type strings, no duplicate/conflicting names |
| `backend/src/lib/notifications/createNotification.ts` (new) | 2 | Backend-side reuse of the canonical types + one insert wrapper |
| `book_appointment_atomic` (migration, `CREATE OR REPLACE`) | 2a | Only place a booking's success is known atomically, exactly once |
| `cancel_appointment_safe` (migration, `CREATE OR REPLACE`) | 2c | Same reasoning for cancellation |
| `reschedule_appointment_atomic` (migration, `CREATE OR REPLACE`) | 2d | Same reasoning for reschedule |
| *(Phase 3, pending sign-off)* new `appointment_reminders_sent` table, `facility_settings.reminder_offsets_minutes` column, one new `pg_cron` job + function | 3 | Dedup + configurability, reusing the existing per-facility settings table |

**Why this architecture is the safest available option:**
- Every write path reuses one of exactly two small, purpose-built primitives (§0.5) instead of a sixth/seventh/eighth hand-rolled `.insert()` — the class of bug that caused this entire investigation (wrong id, wrong table, wrong enum value) cannot recur at a new call site without someone bypassing the shared helper on purpose.
- Phase 1 touches zero schema and zero new types — it is a pure bug fix with the smallest possible blast radius, shippable and revertable independently of everything else.
- The appointment-lifecycle notifications live *inside* the same RPCs that already atomically own each state transition, so "did we notify" can never drift out of sync with "did the thing actually happen" (no separate webhook/queue to fall out of step).
- The reminder design reuses a cron pattern *already proven to work in this exact codebase*, and explicitly avoids the one pattern *already proven broken* in this exact codebase.
- The `SECURITY DEFINER` guard clause closes a real spam/impersonation vector that a naive version of this helper would have introduced.

**Existing code being reused (not rebuilt):**
- `shared/src/api/notifications.ts` (read side) — untouched, zero changes.
- Frontend bell + notifications page — untouched, zero changes (verified the existing fuzzy-match categorizer already handles the new type strings correctly).
- The `patient_profiles.id → user_id` join pattern from `notify-lab-result`/`notify-waitlist`.
- The `SECURITY DEFINER` pattern from `checkin_and_enqueue`/`claim_waitlist_appointment`.
- The pure-SQL `pg_cron` pattern from `auto-unavailable-doctors`.
- The `facility_settings` per-facility configuration table.
- The `alreadyPaid`/status-gate idempotency pattern already in the webhook.

**How duplicate notification creation is prevented:**
- Phase 1: reuses the existing `alreadyPaid` / `payment.status !== "paid"` gates unchanged in both routes — only one route will ever transition a given payment, so only one notification fires per payment.
- Phase 2a/2c/2d: each insert sits on the single success path of an RPC that models one atomic, non-repeatable state transition.
- Phase 2b: extends the already-guarded Phase 1 call sites.
- Phase 3: composite-primary-key dedup table with a claim-then-act (`ON CONFLICT DO NOTHING`, check rowcount) pattern already precedented in this codebase's queueing logic.

---

## Risks

| Risk | Mitigation |
|---|---|
| Postgres enum→TEXT column conversion on a live table could momentarily lock `in_app_notifications` | Table is small/low-write-volume relative to `appointments`/`payments`; run in a maintenance window if the production table has grown large by the time this ships |
| `CREATE OR REPLACE FUNCTION` on `book_appointment_atomic`/`cancel_appointment_safe`/`reschedule_appointment_atomic` touches business-critical booking RPCs | Each redefinition is additive-only (adds a `PERFORM create_notification(...)` call before the existing `RETURN`) — the existing validation, locking, and return contract are unchanged; each phase is independently testable against the existing booking/cancel/reschedule flows before merging the next |
| `create_notification()`'s `authenticated` grant could be misused if the guard clause has a logic error | Guard is a single, simple, testable condition (`p_user_id <> auth.uid()` when `auth.uid()` is not null) — unit-testable by attempting to notify another user id as a patient session and asserting rejection |
| Sending both `appointment_confirmed` and `payment_success` at once may feel like duplicate/noisy notifications to patients | Flagged explicitly in Phase 2b as a decision to confirm with you before implementation, not silently decided |
| Reminder cron running every 5 minutes at scale (many facilities × many appointments) | Query is filtered to `status='confirmed' AND slot_date=CURRENT_DATE` first (small row count per facility per day) before the per-offset window check; matches the existing 5-minute-tick precedent already running in production-shape code today |
| `waitlist_offer` becoming valid fixes a previously-silent failure — its notification will now start actually appearing | This is a desired side effect, but worth confirming you want it to start firing now rather than being explicitly excluded from the canonical list |

## Estimated Effort (total)

| Phase | Effort |
|---|---|
| Phase 1 (payment fix, both routes, full verification) | 0.5–1 day |
| Phase 2 foundation (schema, DB helper, TS helper, shared types) | 0.5 day |
| Phase 2a–2d (booked/confirmed/cancelled/rescheduled) | 2.5–3 days |
| Phase 3 (design only, this round) | 0 days (design delivered above) |
| **Total for Phases 1–2** | **~4 days** |

---

**No code has been changed or committed as part of this plan.** Awaiting your review and sign-off — in particular on: (a) the Phase 2b "two separate notifications vs. one combined message" decision, (b) the recommended `TEXT + CHECK` conversion vs. staying with a native enum, and (c) the Phase 3 default reminder windows (`[120, 30]`) — before any implementation begins.
