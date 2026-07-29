# Queue Management — Architecture & Product Audit

> # ⛔ SUPERSEDED — DO NOT IMPLEMENT §8 OF THIS DOCUMENT
> **Superseded on 2026-07-28 by `QUEUE_BACKEND_FOR_MEDILINK.md` (the HAMS ↔ MediLink
> integration contract), which is now the single source of truth for the queue backend.**
>
> HAMS built and owns the queue backend. Its design differs from the one proposed in §8 here:
>
> | §8 proposed (NOT built) | HAMS shipped (authoritative) |
> |---|---|
> | New `queue_state` broadcast table | **No new table** — patients subscribe to their own `queue_items` row directly |
> | `get_my_queue_status()` RPC | **`get_my_queue_position()`** |
> | `queue_state` in the realtime publication | **`queue_items`** in the publication + `REPLICA IDENTITY FULL` |
> | ~9 new `queue_items` columns (priority, queue_date, sequence…) | **2 columns** — `acknowledged_at`, `acknowledged_kind` |
> | MediLink-authored staff RPCs (§6.2) | HAMS-owned; still unbuilt (contract §3.6) |
>
> **What remains valid and was used:** §1 (the repository audit — every finding was independently
> confirmed by HAMS, including the orphaned-RLS-policy bug in G1's vicinity and the `_owns_appointment`
> schema drift), §2 (hospital workflow), §3 (lifecycle), §4 (UX/screen design — implemented),
> §5.3 (polling-vs-realtime), §7 (patient experience).
>
> **What is void:** §8 (implementation plan — the DB/RPC/table design), §9 (phasing), and §10's
> answers about what to build. Current integration state: `QUEUE_INTEGRATION_STATUS.md`.

> **Status:** Pre-implementation audit. **No code has been written.**
> **Date:** 2026-07-28 · **Branch at time of audit:** `feature/ai-completion`
> **Scope:** every queue-related artefact in this repository, real-hospital workflow analysis, target
> MediLink design, scalability model, and a phased implementation plan.
>
> Everything in §1 is verified against the current repository. Everything from §2 onward is design.
> Claims that could **not** be verified from this repo (i.e. behaviour of the HAMS staff console, which
> is not in this codebase) are flagged **[UNVERIFIED]** and surfaced as decisions, not assumptions.

---

## Contents

1. [Repository audit — what actually exists](#1)
2. [How queue management works in a real hospital](#2)
3. [How MediLink should work — the lifecycle](#3)
4. [User experience — every screen](#4)
5. [Scalability](#5)
6. [Hospital / staff side](#6)
7. [Patient experience](#7)
8. [Technical implementation plan](#8)
9. [Development plan — phases, hours, risk](#9)
10. [Final verdict](#10)

---

<a name="1"></a>
## 1. Repository audit — what actually exists

### 1.1 Search coverage

Searched across `mobile/`, `backend/`, `shared/`, `frontend/`, `supabase/migrations/`,
`supabase/functions/`, `docs/`, and the generated schema types for: `queue`, `queue_position`,
`live_queue`, `estimated_wait`, `waiting`, `checkin`, `appointment_status`, `appointment_queue`,
`walk_in`, `priority`, `current_position`, `doctor_queue`, `facility_queue`, `realtime`,
`subscriptions`, `.channel(`, `postgres_changes`.

51 files matched `queue`; after excluding false positives (`ReadableStream.enqueue` in the AI SSE
route, "invoice queued", "review queue" in Arabic-name docs, `package-lock.json`) the **real** queue
surface is **12 files**, all of them either SQL or i18n strings.

### 1.2 What exists and is production-ready ✅

**Table `public.queue_items`** — `supabase/migrations/20260319071603_hams_complete_schema.sql:693`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `facility_id` | uuid NOT NULL → facilities | |
| `branch_id` | uuid → branches | never populated by any code path in this repo |
| `appointment_id` | uuid → appointments | nullable in DDL, **forced NOT NULL by trigger** |
| `doctor_id` | uuid → doctors | nullable |
| `patient_name` | text NOT NULL | denormalized (walk-ins have no `patient_id`) |
| `patient_phone` | text | denormalized |
| `is_walkin` / `is_online` | boolean | channel flags |
| `position` | integer NOT NULL DEFAULT 0 | facility-wide, `CHECK (position > 0)` |
| `status` | `queue_status` = `waiting\|called\|done\|expired` | |
| `checked_in_at` | timestamptz NOT NULL DEFAULT now() | |
| `called_at` / `done_at` | timestamptz | **never written by any code in this repo** |
| `created_by_staff_id` / `called_by_staff_id` | uuid → facility_staff | added `20260422102441:88` |

**Integrity — genuinely well built.** `20260429000006_unified_queue_rpcs.sql`:
- `unique_active_queue_position` — `UNIQUE (facility_id, position) WHERE status IN ('waiting','called')`
- `unique_appointment_active_queue` — `UNIQUE (appointment_id) WHERE status IN ('waiting','called')`
- Trigger `enforce_queue_item_integrity` → `validate_queue_item()` rejects NULL `appointment_id` /
  `facility_id` / `status` on INSERT.
- `chk_queue_position CHECK (position > 0)` (`20260422103305:145`)
- Indexes `ix_queue_items_facility_id`, `ix_queue_items_status`, `ix_queue_items_facility_status`,
  `ix_queue_items_facility_position`.

**RPCs (all `SECURITY DEFINER`, `search_path = public`)**

| RPC | File | Purpose | Reuse? |
|---|---|---|---|
| `enqueue_appointment(...)` | `...0006:2` | Shared atomic insert. **Idempotent** — returns the existing active row if one exists. | **Reuse as-is** (one hardening, §1.5) |
| `add_walkin_to_queue(...)` | `...0006:65` | Walk-in appointment + queue item in one txn. Supersedes `...0005`. | Reuse (staff-side) |
| `checkin_and_enqueue(...)` | `...0006:116` | Locks the appointment `FOR UPDATE`, flips `confirmed → checked_in`, sets `checked_in_at`, enqueues. Idempotent on re-check-in. | **Reuse as-is** |
| `checkin_my_appointment(p_id, name, phone)` | `20260713000001` | Patient-facing wrapper: `auth.uid()` gate + `_owns_appointment()` gate → delegates to `checkin_and_enqueue`. | **Reuse as-is** |
| `_owns_appointment(p_id)` | live only, **no migration** | ownership predicate | Reuse |

**Working patient check-in path (end-to-end, real, today):**

```
mobile  app/(app)/appointments/[id]/index.tsx:151  (also dashboard.tsx:174, appointments/index.tsx:161)
   → useCheckInAppointment()              src/hooks/queries/usePatient.ts:190
   → repositories.appointment.checkIn()   src/data/repositories.ts:107
   → real impl                            src/data/real/index.ts:472
   → api.appointments.checkInAppointment  shared/src/api/appointments.ts:145
   → RPC checkin_my_appointment → checkin_and_enqueue → enqueue_appointment
web     frontend/src/app/dashboard/appointments/page.tsx:507 (same shared API)
```

**Emergency auto-enqueue after payment** — `backend/src/app/api/payments/webhook/route.ts:237-289`.
Service-role, one-shot-guarded by the `alreadyPaid` claim, calls `enqueue_appointment` directly and
clears `appointments.needs_queue_sync`.

**Supporting data already present and usable for ETA/priority:**
- `facility_settings.avg_consultation_minutes`, `.buffer_minutes_between_appts`, `.walkin_slots_per_hour`
- `doctors.status` (`available|with_patient|on_break|unavailable`) + `status_updated_at`, with a
  `pg_cron` job (`auto-unavailable-doctors`, every 5 min) flipping stale doctors to `unavailable`
  (`20260326110433`)
- `appointments.is_emergency`, `.emergency_reason`, `.checked_in_at`, `.completed_at`,
  `.call_started_at`, `.call_ended_at`, `.follow_up_of`, `.reference_number`
- `appointment_status` enum: `pending|confirmed|checked_in|completed|cancelled|no_show|approved`

**Push notification pipeline — complete and reusable.** `backend/src/lib/notifications/sendPush.ts`
(device_tokens + `profiles.notification_prefs.push` opt-in + Expo 100-msg batching +
`DeviceNotRegistered` cleanup), dispatched via `POST /api/notifications/push` behind
`x-internal-secret`. Mobile tap-routing already exists: `mobile/src/utils/notifications.ts`
classifies `checkin`/`check_in` into the `appointment` kind and honours an explicit `data.url`.
**A queue push needs zero new plumbing** — only a new caller and a `data.url`.

### 1.3 Partially implemented ⚠️

| Item | Reality |
|---|---|
| **Queue lifecycle** | Only the *entry* half exists. Nothing anywhere writes `status='called'`, `'done'` or `'expired'`, nor `called_at`, `done_at`, `called_by_staff_id`. A row enters `waiting` and stays `waiting` forever from this repo's perspective. |
| **`appointments.needs_queue_sync`** | Added `20260424120000`. Only ever set to `false` (webhook `route.ts:272`). **Nothing ever sets it `true`.** Dead flag. |
| **`branch_id` on queue_items** | Column + FK exist; no RPC or caller populates it. Multi-branch facilities cannot be queued separately. |
| **Realtime** | Enabled at DB level for `in_app_notifications`, `appointments` (`20260427000001`) and `doctor_availability` (`20260430100000`). `queue_items` is **not** in the `supabase_realtime` publication. |
| **i18n** | `mobile/src/i18n/en.ts:140-145` + `ar.ts:141-143` already carry `checkedInTitle`, `checkedInBody`, `checkInQrCaption`, `queueNumber`, `nowServing` — commented *"Check-in (design p25) — QR pass + live queue"*. **Orphaned strings; no screen renders them.** |

### 1.4 Unused / must not be recreated ❌

- **`add_walkin_to_queue` in `20260429000005`** is fully superseded by the version in `...0006`
  (`CREATE OR REPLACE`, so only the later one is live). Do not touch `...0005`.
- **Trigger `enforce_queue_appointment_id`** was explicitly dropped by `...0006:214`. Don't revive it.
- **`waitlist_entries`** is a *different feature* (F-25/F-26: notify-me-when-a-slot-frees, with the
  `trg_waitlist_on_cancel` auto-offer trigger and a 15-minute claim window). It is **not** the
  day-of-visit queue. Keep them separate; the code comment "FIFO queue" in
  `20260331043944_F_26_trigger.sql:22` refers to waitlist ordering, not queue_items.
- **`appointment_status='approved'`** exists in the enum (`20260430000001`) but no MediLink path
  produces or consumes it. Ignore it; do not add it to queue logic.

### 1.5 Gaps — the honest list

**G1 — Patients cannot read the queue at all. (Blocker.)**
`queue_items` RLS is `queue_items_access` (`20260422103305:77`), granting `FOR ALL` to
`facility_admins` / active `facility_staff` / the owning `doctor` / `super_admin`. There is **no
patient policy**. A patient who successfully checks in receives a `position` in the RPC's JSON
response and **can never read it again** — not on refresh, not on another device. Today the mobile
app throws that number away entirely (`real/index.ts:472` ignores the return value).

**G2 — Zero realtime clients exist in the entire repository.**
A repo-wide search for `.channel(`, `postgres_changes`, `removeChannel` returns **no matches** in
`mobile/`, `frontend/`, `shared/` or `backend/`. Three tables are realtime-enabled at the DB level
and nothing subscribes to any of them. Queue would be the **first** realtime consumer in the
codebase — treat that as new infrastructure, not a small addition.

**G3 — `position` is facility-wide, monotonic, and never reset by date.**
`unique_active_queue_position (facility_id, position)` puts every doctor in a facility on one number
line. A patient waiting for Dr A is numerically interleaved with Dr B's walk-ins. Worse: because the
partial index only covers `waiting|called`, `MAX(position)` over *active* rows **falls back to 0
whenever the queue drains**, so the next patient gets `position = 1` again — mid-morning. Any UI
showing "Your queue number: 7" would be wrong twice over (wrong scope, non-monotonic).
**`position` is unusable as a patient-facing number.**

**G4 — No priority.** `enqueue_appointment` always appends at `MAX+1`. An emergency arriving through
the payments webhook (`route.ts:259`) lands **behind** every walk-in already waiting. There is no
priority column, no triage level, no VIP flag, no clinical override.

**G5 — No date scoping.** A `waiting` row from three days ago still holds its slot in the unique
index and still counts as "ahead of you". Nothing expires it. `queue_status` has an `'expired'`
value that nothing ever sets, and there is no sweeper job.

**G6 — No wait estimation of any kind.** No column, no function, no observed-duration tracking.

**G7 — No shared API, no repository, no screen.**
- No `shared/src/api/queue.ts` (13 API modules exist; queue is not one of them).
- No `QueueRepository` in `mobile/src/data/repositories.ts`; no `queue` key in `Repositories`.
- No route in `mobile/app/` (verified against the full 63-file route tree). Per
  `docs/MOBILE_COMPLETION_TRACKER.md:183` (item 6.11), an orphaned hardcoded QR check-in screen was
  **deliberately deleted**, with the follow-up noted: *"surface the RPC's queue `position` in the
  success Alert."* That follow-up is this feature.
- No `queue` field on the mobile `Appointment` domain type (`src/data/types.ts:114`).
- No backend route (`backend/src/app/api/**` has 41 routes, none queue-related).
- No Edge Function (16 exist, none queue-related).

**G8 — No staff surface exists in this repository.**
MediLink is patient-only by design (`CLAUDE.md`: *"HAMS's own staff/admin web frontend was **not**
reused — `frontend/` here is a brand-new patient-only portal"*). Every "call next / skip / recall /
pause" action described in §6 has **no UI owner in this codebase**. **[UNVERIFIED]** — whether the
live HAMS staff console writes `queue_items.status` cannot be determined from this repo. Given that
`called_at`/`done_at`/`called_by_staff_id` columns were added by a HAMS migration in April
(`20260422102441`), it is *likely* HAMS has or plans such a console — but this must be confirmed
before committing to a plan. See **Decision D1** (§9.0).

**G9 — Concurrency hardening gap in `enqueue_appointment`.**
The position calculation locks existing rows in a subquery then aggregates:

```sql
SELECT COALESCE(MAX(pos), 0) + 1 INTO v_position
FROM (SELECT position AS pos FROM queue_items
      WHERE facility_id = p_facility_id AND status IN ('waiting','called')
      FOR UPDATE) locked_rows;
```

This is correct *when rows exist*, but on an **empty active queue there is nothing to lock** — two
concurrent enqueues both compute `1`, and one dies on the `unique_active_queue_position` violation
(SQLSTATE 23505). Data integrity holds (good), but the loser gets a raw Postgres error instead of a
position. Low frequency, non-corrupting, but it must be fixed before this is patient-visible.

### 1.6 Verdict on existing work

| Layer | Completeness |
|---|---|
| Storage & integrity | **~85%** — well-modelled, well-constrained, honestly the strongest part |
| Entry (check-in / walk-in / emergency enqueue) | **~90%** — works end-to-end today on web + mobile |
| Progression (call/skip/complete) | **0%** |
| Patient read access | **0%** |
| Ordering / priority / ETA | **0%** |
| Realtime | **0%** (and no precedent anywhere in the repo) |
| Patient UI | **0%** (i18n strings only) |
| Staff UI | **0%** in this repo (HAMS-owned, unverified) |
| **Overall** | **≈ 30–35%** — the write path in, none of the loop out |

**Reuse, do not recreate:** `queue_items` + its indexes/trigger, `enqueue_appointment`,
`checkin_and_enqueue`, `checkin_my_appointment`, `_owns_appointment`, `add_walkin_to_queue`,
`facility_settings.*_minutes`, `doctors.status`, the entire push pipeline, the existing check-in
call sites and i18n keys.

---

<a name="2"></a>
## 2. How queue management works in a real hospital

### 2.1 The core truth

**An appointment time is a promise about ordering, not about the clock.** A 10:00 slot means "you are
in the 10:00 position of the morning list", not "you will be seen at 10:00". Outpatient departments
routinely run 20–90 minutes behind by mid-session. Every downstream design decision follows from
this: patients do not need the schedule, they need *their position in the actual sequence and how
fast it is moving*.

A hospital queue is therefore **not a FIFO queue**. It is a **priority queue with continuous human
override**, per doctor, per session, per day.

### 2.2 Who is in the queue and how they are ordered

| Class | Typical handling |
|---|---|
| **Appointment patients** | Enter the queue **at arrival + check-in**, not at booking. Ordered by scheduled slot, but only among those who have actually arrived. |
| **Walk-ins** | Reception issues a token. Either a separate parallel line, or interleaved at a fixed ratio (e.g. 1 walk-in per 3 appointments) so neither line starves. `facility_settings.walkin_slots_per_hour` and the `walkin_reserved` slot type in `doctor_availability` show this ratio model is already the HAMS assumption. |
| **Emergency** | Bypasses everything. In a hospital with an ED this is a different physical pathway; in a clinic the doctor is interrupted or the next slot is commandeered. Triage scales (ESI 1–5, Manchester) assign the level; software must never compute it. |
| **VIP / priority** | Insurance tier, staff family, elderly/pregnant/disabled statutory priority (common in Gulf public health), corporate contracts. Usually a receptionist flag, sometimes automatic from patient attributes. |
| **Re-entry (the "come back with your results" loop)** | Patient is seen, sent for labs/X-ray/vitals, returns to see the *same* doctor. **This is the most under-modelled case in queue software.** They must not restart at the back — clinics slot them at "next available gap" or a boosted priority. |
| **Follow-ups / re-checks** | Short-duration visits (5 min vs 15). Some clinics run a separate fast lane. |

### 2.3 Organisational structures

- **Per-doctor queue** (most clinics) — each doctor has their own line. This is what the *patient*
  experiences.
- **Per-department / pooled** (ED, radiology, phlebotomy) — one line, next-free-provider. What the
  *department* needs.
- **Per-room** — the physical constraint in busy OPDs; a doctor may run two rooms alternating.
- **Facility-wide token, per-doctor service** — one ticket printer at the door, the display board
  routes tokens to counters. Common in banks and in large Gulf polyclinic receptions.

Real facilities run several of these simultaneously. **MediLink's current schema hard-codes the
fourth model** (facility-wide `position`) while patients experience the first — this is the source
of gap G3.

### 2.4 The disruptions the system must survive

| Event | What actually happens |
|---|---|
| **Doctor delayed / arrives late** | The whole session shifts. Nobody is reordered. Reception tells people "the doctor is 40 minutes late" — verbally, once, to whoever is in the room. |
| **Doctor break / prayer / rounds / tea** | Queue *pauses*. Positions are preserved. Patients need to know the queue is paused, not stalled — otherwise they queue at the desk to ask. |
| **Consultation overrun** | The single largest source of drift. One 45-minute consultation in a 15-minute grid pushes everyone 30 minutes. Absorbed silently; nobody is notified. |
| **Emergency insert** | Everyone waiting is silently pushed back one slot. |
| **Late arrival** | Grace period (commonly 10–15 min). Within grace → keep your slot. Beyond grace → you are inserted *after* the currently-waiting cohort, or asked to rebook. **Policy varies wildly by facility.** |
| **Missed / no-show at call** | Token is called 2–3 times, then **skipped** (not deleted). Recalled at the end of the current block, or after N subsequent patients. Formally marked `no_show` only after the recall fails. |
| **Cancellation** | Frees a slot. If cancelled before arrival, they were never in the queue. If after check-in, they are removed and everyone behind advances. |
| **Clinic closing / session end** | Remaining patients are either extended into overtime, rebooked, or transferred to another doctor. |
| **Doctor pulled to theatre/ward** | Whole queue reassigned, split across colleagues, or rescheduled. |

### 2.5 What real hospitals actually give the patient today

A number on a wall display, a token slip, and a receptionist to interrupt. The information asymmetry
is total: staff know the queue state precisely; patients know only their own number and whatever is
on the board. **This asymmetry — not the ordering algorithm — is the problem worth solving.**

---

<a name="3"></a>
## 3. How MediLink should work — the lifecycle

### 3.1 The full path

```
Book → Pay → Confirmed → [T-24h reminder] → [T-2h "leave soon"] → Arrive
  → CHECK-IN (geofence/QR/manual)  ← ENTERS QUEUE HERE
  → Waiting (position + ETA, live)
  → "You're next" (push, ~2 patients out)
  → CALLED (push + full-screen state)  ← staff action
  → In consultation                     ← staff action
  → Completed                           ← LEAVES QUEUE HERE
  → Prescription / Medical record / Invoice / Rate
```

### 3.2 Precise answers to the lifecycle questions

**When does the patient enter the queue?**
At **check-in**, never at booking and never at payment. Enqueue is the side-effect of
`checkin_and_enqueue` flipping `confirmed → checked_in`. Three legitimate entry points:
1. **Patient self-check-in** (app) — allowed only inside a window: `slot_start − 60 min` to
   `slot_start + grace`, **and** optionally validated by geofence (within ~300 m of the facility).
   Without a location or QR constraint, self-check-in is a lie — patients will tap it from home to
   "hold their place", which corrupts the queue for everyone physically present.
2. **Reception check-in** (HAMS) — the authoritative fallback and the norm for walk-ins.
3. **System enqueue** — the emergency-after-payment path that already exists
   (`webhook/route.ts:237`), which deliberately bypasses check-in.

**When does the patient leave the queue?**
On `queue_items.status → 'done'`, written when the consultation ends (staff action, or derived from
`appointments.status → 'completed'`). Also on `cancelled`, `no_show` (after failed recall), and by
the end-of-day sweeper (`waiting|called` rows older than the session → `expired`).

**What if the patient never checks in?**
They never enter the queue and no position is consumed. At `slot_start + grace`, the appointment is
flagged *at risk*; the app nudges ("You have 8 minutes to check in"). At session end, reception
marks `no_show` (this must remain a **human** action — auto-no-show punishes patients for a broken
lift or a full car park). MediLink should surface a **"Running late"** button that notifies reception
before the grace expires — this is a genuine improvement over the phone call nobody makes.

**What if they arrive late?**
Within grace (default 15 min, `facility_settings`-configurable): normal check-in, normal position.
Beyond grace: check-in still succeeds but the item is enqueued with a **late flag** and placed after
the currently-waiting cohort (a lower priority band), with an honest in-app message — *"You arrived
after your slot. You'll be seen after the patients currently waiting."* Never silently give them
their original position; that steals from patients who arrived on time.

**What if they cancel?**
Pre-check-in: nothing to do (never queued); the existing `cancel_appointment_safe` +
`trg_waitlist_on_cancel` auto-offer handles the slot. Post-check-in: the queue item is set to
`done`/`expired` and everyone behind advances one place. Their app switches to the cancelled state
immediately; those behind get a *silent* position update (no push — a push saying "you moved up" is
noise; only "you're next" and "you're called" earn an interrupt).

**What if the doctor is delayed?**
The queue is **paused**, not reordered. Nobody loses their position. Patients see a distinct paused
state with the reason and, if reception provided one, an expected resume time. Every ETA is
recomputed from the resume time. This is the single highest-value screen state in the whole
feature — it is exactly the moment patients currently walk to the desk.

**What if a consultation takes longer?**
Nothing structural changes; the ETA absorbs it. The estimator must be **observation-driven**: a
rolling per-doctor average of *actual* recent consultation durations, not the static
`facility_settings.avg_consultation_minutes`. When ETA slips past a threshold (e.g. +15 min), send
one "running behind" push — throttled to at most one per hour per patient.

**What if another emergency arrives?**
The emergency is inserted with priority. Everyone behind shifts back one place and their ETA grows.
Show it **honestly**: *"An emergency case is being seen. Your wait increased by about 15 minutes."*
Patients accept emergency delays readily when told the reason — and resent identical delays with no
explanation. The current system does not even support the insert (G4), let alone the message.

---

<a name="4"></a>
## 4. User experience — every screen

### 4.0 Constraints these designs must respect (from `CLAUDE.md`)

- Screens import from `mobile/src/data/index.ts` only — **never** Supabase or REST directly.
- Global `headerShown:false`; every screen renders its own `AppHeader` (needed for RTL).
- Full-screen routes without the tab bar are declared as sibling `Stack.Screen`s in
  `app/(app)/_layout.tsx`, outside `(tabs)`.
- Bottom sheets use `presentation:"formSheet"` with detents (the `search/filters` convention).
- Buttons use `radii.md` (14px); pill shape is chips only.
- Colours come from `theme/light.ts`/`dark.ts` semantics, never `tokens.ts` directly.
- All strings go through `src/i18n/en.ts` with a typed `ar.ts` counterpart. Five keys already exist
  (`checkedInTitle`, `checkedInBody`, `checkInQrCaption`, `queueNumber`, `nowServing`) and should be
  adopted rather than re-invented.
- RTL is runtime-flipped via the JS `isRTL` context — every new row needs
  `flexDirection: isRTL ? "row-reverse" : "row"`.

### 4.1 Screen map

| # | Screen | Route | New? |
|---|---|---|---|
| S0 | Dashboard hero card (queue-aware) | `app/(app)/(tabs)/dashboard.tsx` | modify |
| S1 | Appointment detail (pre-check-in) | `app/(app)/appointments/[id]/index.tsx` | modify |
| S2 | Check-in sheet | `app/(app)/appointments/[id]/check-in.tsx` | **new** (formSheet) |
| S3 | **Live Queue** | `app/(app)/appointments/[id]/queue.tsx` | **new** (the hero screen) |
| S4 | Called state | S3 state | — |
| S5 | In-consultation state | S3 state | — |
| S6 | Completed / post-visit | S3 → redirect to S1 | — |

---

### S1 — Appointment detail, pre-check-in

**Purpose** Get the patient to the right place at the right time, and make check-in obvious the
moment it becomes possible.

**Displays** Existing doctor card + `SummaryCard` rows, plus a new **check-in eligibility strip**:
- `> 60 min before`: "Check-in opens at 09:00" (informational, no button).
- `≤ 60 min before`, not arrived: primary **Check in** button + distance/travel hint.
- Beyond `slot_start + grace`: amber "You're running late" + **Check in** + **Tell the clinic**.
- Already checked in: the strip collapses into a **Live Queue** entry card showing position + ETA,
  tapping through to S3.

**Actions** Check in · Tell the clinic I'm running late · Reschedule · Cancel · Directions.
**State changes** `confirmed → checked_in` (server-authoritative; never optimistic).
**Errors** `invalid_status:<x>` → "This appointment can't be checked in yet." · `FORBIDDEN` → generic
failure + support hint · `appointment_not_found` → refetch and show the not-found screen.
**Offline** Check-in button disabled with "You need a connection to check in." **Never queue this
mutation offline** — a check-in that never reached the clinic is worse than an error.

---

### S2 — Check-in sheet (`presentation: "formSheet"`)

**Purpose** One deliberate confirmation, replacing today's `Alert.alert` (`[id]/index.tsx:51`).

**Displays** Doctor + time + clinic; "Are you at the clinic?"; the **QR pass** (`checkInQrCaption`,
encoding `reference_number` — already on the appointment row) for facilities that scan at reception;
a location-verified badge when geofence passes; the late warning when past grace.
**Actions** Confirm check-in (primary) · Not there yet (dismiss).
**Animation** Sheet slide + a short success morph (checkmark) before dismissal; respect
`prefers-reduced-motion`.
**State changes** On success, dismiss and **replace** the route with S3 (`router.replace`) so Back
doesn't land on a stale sheet.
**Error / offline** Inline in-sheet error, sheet stays open, button re-enabled — no toast that
disappears behind the sheet.

---

### S3 — Live Queue (the hero screen)

**Purpose** Eliminate uncertainty. This screen replaces walking to the reception desk.

**Layout (top → bottom)**

1. **Header** — `AppHeader` with the clinic name + a live "connected / updating / offline" dot.
2. **Position ring** — a large circular progress showing patients-ahead → 0. The dominant element.
   Centre: **"3"**, caption **"patients ahead of you"**. *Not* a raw ticket number (see G3 — the
   existing `position` value is not meaningful to a patient). If a facility uses physical tokens,
   show the token as secondary text under the ring.
3. **ETA** — "About **35 minutes**", with a deliberately visible confidence qualifier ("about",
   rounded to 5 min). Never show a precise clock time; a wrong "10:42" destroys trust in a way a
   wrong "about 35 minutes" does not.
4. **Now serving** (`nowServing`) — the number/token currently in the room, never another patient's
   name.
5. **Doctor status chip** — driven by the existing `doctors.status`: Available · With a patient · On
   a break · Unavailable.
6. **Progress bar** — arrived → waiting → called → in consultation → done.
7. **Timeline** — "Checked in 09:12 · Queue moved 4 places · Last update 12s ago". The *last-update
   timestamp is mandatory* — it is what makes a stale screen honest.
8. **Actions** — Directions · Call clinic · Leave-and-return toggle (§7) · Cancel (with a
   post-check-in warning).

**Realtime** Subscribe to **one row** — the doctor/day `queue_state` broadcast row (§8.3) — and use
any change purely as an **invalidation signal** to refetch the authoritative
`get_my_queue_status` RPC. Never render straight from the realtime payload.

**Animations** Ring counts down with a spring; number transitions cross-fade (never a jarring
snap); the "you're next" transition pulses once and triggers haptics. All animation is Reanimated —
recall that `react-native-worklets/plugin` must stay the last Babel plugin.

**Error states**
- RPC error → keep the last known state, overlay "Couldn't refresh — retrying", auto-retry with
  backoff. **Never blank the screen**; a patient staring at a spinner will go ask the desk.
- Realtime disconnect → silently fall back to polling (§5.3), swap the dot to "updating".
- Queue item vanished (staff removed it) → explain and route back to S1.

**Offline** Full last-known state, dimmed, with a prominent **"Offline — last updated 6 minutes
ago"** banner and no ETA countdown ticking (a counter that keeps running while disconnected is an
active lie). React Query persistence (`QueryProvider.tsx`) already gives us the cache; the queue
query needs a short `staleTime` and an explicit `dataUpdatedAt` render.

**Background** iOS will suspend the socket. On foreground: immediate refetch + resubscribe. While
backgrounded, **push notifications are the transport** — this is why §8.6 pushes are not optional.

---

### S4 — Called

Full-bleed accent takeover: **"You're being called"**, room/counter number, doctor name, an
"I'm on my way" acknowledgement button (which writes an ack timestamp so reception knows the patient
is moving rather than lost), and a countdown showing how long before the token is skipped. Haptic +
sound + a high-priority push with `data.url` deep-linking straight here. This state must be
unmissable — it is the entire payoff of the feature.

### S5 — In consultation

Calm, minimal: "You're with Dr X". No timers (nobody wants a stopwatch on their consultation). Live
Activity / persistent notification ends here.

### S6 — Completed

Auto-transition to a post-visit summary: prescription (if any), invoice, and the existing rate flow
(`app/(app)/rate/[appointmentId].tsx`). Queue UI disappears from the dashboard.

### S0 — Dashboard hero card

`HeroAppointmentCard` gains a queue-aware variant: when the patient is checked in, the primary
action changes from **Check in** to **View queue · 3 ahead · ~35 min**, with a live-updating badge.
Today's card (`dashboard.tsx:172`) always shows Check in regardless of state.

---

<a name="5"></a>
## 5. Scalability

### 5.1 The load model

Load is **per doctor-session**, not per hospital. A single doctor sees 4–6 patients/hour. Even a
50-doctor hospital generates ~250 queue transitions per hour — **0.07 writes/second**. The database
work is negligible. **The scaling problem is not writes; it is fanout of reads to idle mobile
clients.**

| Concurrent waiting patients | Naive design (every client subscribes to `queue_items`) | Proposed design (§8.3) |
|---|---|---|
| **10** | Fine either way | Fine |
| **100** | 100 sockets; every insert/update runs RLS **per subscriber** → ~100 RLS evaluations per movement | 100 sockets on ~10 rows; 1 DB write per movement, fanned out by the Realtime server |
| **500** | ~500 RLS evaluations per movement, plus per-client filtering; Realtime CPU becomes the bottleneck | Unchanged shape: ~30–60 `queue_state` rows, 1 write per movement |
| **1000+** | Connection-pool and Realtime limits reached; needs a plan upgrade **and** still degrades | Still ~1 write per movement; the constraint becomes raw concurrent connections (a plan/quota question, not an architecture question) |

### 5.2 Why the `queue_state` broadcast row is the whole answer

Patients must **not** subscribe to `queue_items`:
1. **PHI** — `queue_items` carries `patient_name` and `patient_phone`. Any patient-readable policy on
   that table risks leaking other patients' identities through realtime payloads (Realtime sends the
   whole row).
2. **Cost** — RLS is evaluated per subscriber per change.
3. **Irrelevance** — your own row does **not** change when the patient ahead of you finishes, so
   subscribing to your own row alone doesn't even solve the problem.

One denormalized, **zero-PHI** row per `(facility, doctor, date)` — maintained by an AFTER trigger on
`queue_items` — collapses all of that: N patients subscribe to 1 row, one write per movement, nothing
private on the wire, and the row is exactly the "display board" the patient wants.

### 5.3 Polling vs realtime — use both

| Condition | Transport |
|---|---|
| Foreground, socket healthy | Realtime on `queue_state` → invalidate → refetch RPC |
| Foreground, socket down | Adaptive polling: **10 s** when ≤2 ahead, **30 s** when 3–5, **60 s** beyond |
| Background | Push only (no polling — battery + iOS suspension) |
| Foreground return | Immediate refetch + resubscribe |

Realtime is an **optimisation and an invalidation signal**. Polling is the correctness floor. This
means **the MVP can ship with polling alone** and add realtime with no client-visible redesign.

### 5.4 Race conditions and how each is closed

| Race | Mitigation |
|---|---|
| Two receptionists "Call next" simultaneously | `pg_advisory_xact_lock(hashtext(facility||doctor||date))` at the top of `call_next_patient`, then `SELECT … FOR UPDATE SKIP LOCKED` |
| Two enqueues into an empty queue (**G9, live today**) | Same advisory lock in `enqueue_appointment`, plus a bounded retry (3 attempts) on 23505 |
| Patient checks in from two devices | Already solved — `unique_appointment_active_queue` + `enqueue_appointment`'s idempotent early return |
| Staff completes while patient's app is mid-refetch | Server is authoritative; RPC returns the terminal state and the client reconciles. No optimistic queue writes on the client, ever. |
| Clock skew | Every timestamp is `now()` server-side; the client renders *relative* time from a server-supplied `as_of` |
| Concurrent skip + complete on the same row | Row-level `FOR UPDATE` in every mutating RPC |
| Duplicate push on retry | Dedupe key `queue_item_id + transition` recorded before dispatch |

### 5.5 Multi-clinic / multi-doctor / multi-device

- **Multi-doctor** — the queue key is `(facility_id, doctor_id, queue_date)`. Independent number
  lines, independent pauses, independent ETAs. This is the fix for G3.
- **Multi-branch** — extend the key with `branch_id` (the column already exists and is unused).
- **Multi-clinic** — no shared state between facilities; every index is already `facility_id`-first,
  so partitioning by facility later is a non-event.
- **Multi-device (same patient)** — both devices call the same RPC; both converge. Push is delivered
  to every registered `device_tokens` row, which `sendPush.ts` already handles.
- **Family members** — one guardian may track several queue items (`for_family_member_id` exists on
  appointments). The queue query must be keyed by appointment, not by patient.

---

<a name="6"></a>
## 6. Hospital / staff side

> **Read §1.5 G8 first.** There is **no staff UI in this repository**. This section defines the
> contract that must exist; §9.0 D1 decides who builds it.

### 6.1 Roles (all already modelled in the DB)

| Role | Table | Queue permissions |
|---|---|---|
| **Reception** (`facility_staff`, `role_type='receptionist'`) | `facility_staff` | Check-in, walk-in add, priority flag, mark arrived, reorder, no-show |
| **Nurse / assistant** (`role_type='assistant'`) | `facility_staff` | Call next, skip, recall, vitals-first routing |
| **Doctor** | `doctors` | Call next / start / complete / pause **for their own queue only** (RLS already scopes this: `d.id = queue_items.doctor_id`) |
| **Facility admin** | `facility_admins` | Everything + settings + reassignment |

The existing `queue_items_access` policy (`20260422103305:77`) already grants exactly the right
write scope. **No RLS change is needed on the staff side** — only on the patient side (G1).

### 6.2 Staff actions → RPC contract

Every one of these is a new `SECURITY DEFINER` RPC that re-checks the caller's facility membership
(never trusting the client) and writes an audit row via the existing `hams_audit_log`.

| Action | RPC | Effect |
|---|---|---|
| Check in a patient | `checkin_and_enqueue` | **exists** |
| Add walk-in | `add_walkin_to_queue` | **exists** |
| Call next | `call_next_patient(facility, doctor)` | advisory lock → next by `(priority, sequence)` → `status='called'`, `called_at`, `called_by_staff_id` → push |
| Call specific | `call_queue_item(id)` | explicit override |
| Start consultation | `start_consultation(id)` | `serving_started_at`; `doctors.status='with_patient'`; `appointments.call_started_at` |
| Complete | `complete_queue_item(id)` | `status='done'`, `done_at`; `appointments.status='completed'`, `completed_at`; feeds the duration EMA |
| Skip | `skip_queue_item(id)` | `skipped_at`, `recall_count++`; keeps the item alive |
| Recall | `recall_queue_item(id)` | back to `waiting` at a boosted priority |
| No-show | `mark_queue_no_show(id)` | `appointments.status='no_show'` — **human action only** |
| Pause / resume | `set_queue_paused(facility, doctor, bool, reason, resume_at)` | sets the paused flag on `queue_state`; recomputes every ETA; optional broadcast push |
| Emergency insert | `enqueue_appointment(..., p_priority)` | priority band 10 |
| Priority flag | `set_queue_priority(id, priority)` | VIP / elderly / statutory |
| Reassign doctor | `reassign_queue_item(id, doctor)` | doctor pulled away |
| Close session | `close_queue_session(facility, doctor, date)` | remaining `waiting` → `expired` + notify |

### 6.3 How staff actions reach patient apps

```
staff RPC  ──writes──▶ queue_items
                          │
                    AFTER trigger
                          ▼
                    queue_state  (1 row / doctor / day, zero PHI, realtime-published)
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  Realtime broadcast  Push dispatch     Polling clients
  (foreground apps)   (called/next)     (fallback + background)
        │                 │                  │
        └────────── all refetch ─────────────┘
                get_my_queue_status()   ← single authoritative source
```

Two properties matter: **one write, many readers**, and **one authority** — every client, on every
transport, ends up reading the same RPC. No client ever derives position or ETA locally.

---

<a name="7"></a>
## 7. Patient experience

### 7.1 What the feature delivers

| Capability | How |
|---|---|
| Position in queue | `get_my_queue_status().patients_ahead` |
| Estimated wait | Observation-driven EMA per doctor + remaining current consultation |
| Patients ahead | Count within the same `(facility, doctor, date)` key, priority-ordered |
| Who's being served | `queue_state.now_serving_number` — number only, never a name |
| Running-late alerts | Push when ETA slips >15 min (throttled, ≤1/hour) |
| Reminders | T-24h and T-2h "leave soon" (travel-time aware, §7.2) |
| Push notifications | Existing pipeline (`sendPush.ts`) — zero new plumbing |
| QR check-in | `reference_number` already on every appointment |
| Arrival confirmation | Existing `checkin_my_appointment` |
| Automatic status updates | Trigger → `queue_state` → realtime/push |
| Live progress | Ring + progress bar on S3 |
| Delay notifications | Pause events push once with the reason |
| Family tracking | Keyed by appointment; guardians see each dependent's queue |
| Accessibility | §7.3 |
| Offline | Cached last-known state + explicit staleness |
| Background refresh | Push-driven, plus refetch-on-foreground |

### 7.2 Recommended additions that genuinely change the experience

Ranked by value ÷ effort:

1. **"Leave now" travel-time nudge.** The app knows the ETA and (with permission) the patient's
   location; the clinic's coordinates are already stored (`get_nearby_facilities`,
   `20260723000000_nearby_facilities_coords`). Push *"Leave in about 10 minutes to arrive as you're
   called."* This is the feature that lets people wait at home instead of on a plastic chair — the
   single biggest quality-of-life win available here.
2. **Leave-and-return mode.** Explicit patient toggle: "I've stepped out — I can be back in 15 min."
   Reception sees it; if the patient is called while out, they are auto-skipped-with-recall rather
   than marked no-show. This makes #1 *safe* — without it, leaving is a gamble. Ship them together.
3. **"Tell the clinic I'm running late."** One tap → a facility notification. Replaces the phone call
   nobody makes and lets reception hold the slot deliberately.
4. **Honest delay reasons.** "An emergency case is being seen" vs. silent slippage. Costs one text
   field; buys most of the goodwill.
5. **Live Activity (iOS 16.2+) / persistent Android notification.** Position + ETA on the lock
   screen, no app open. Perfect fit for this data shape. Requires a native module — Phase 4.
6. **Pre-consultation form while waiting.** `pre_consultation_forms` already exists in the schema
   (`full_schema.sql:725`, unique per appointment, with RLS and grants) and is entirely unused. Dead
   waiting time converts into a better consultation. Very high value per unit of effort.
7. **Post-visit auto-transition** into prescription/invoice/rating (all three flows already built).
8. **Queue history** — "your average wait at this clinic is 22 minutes" sets expectations at booking
   time and is derivable from data the feature generates anyway.

**Deliberately not recommended:** paid queue-skipping (ethically indefensible in healthcare);
showing other patients' names; auto-no-show without human confirmation; a precise clock-time ETA;
gamified "invite friends to skip the queue" mechanics.

### 7.3 Accessibility (non-negotiable for a health app)

Full VoiceOver/TalkBack labels on the ring ("3 patients ahead of you, about 35 minutes");
`AccessibilityInfo.announceForAccessibility` on transitions to called; Dynamic Type support (the ring
must reflow, not clip); WCAG AA contrast in both themes; a non-colour indicator for every state
(icon + text, since "called" being green is invisible to a colour-blind user); haptics *in addition
to* sound; full RTL mirroring for Arabic; **and** the "you're being called" state must be
comprehensible with sound off, screen dimmed, at a glance.

---

<a name="8"></a>
## 8. Technical implementation plan

### 8.1 Guiding principles

1. **Additive migrations only** — the Supabase project is shared with live HAMS
   (`supabase/README.md`). Never alter or drop an existing column, policy or RPC that HAMS may use.
2. **The server is the single source of truth for position and ETA** — exactly the precedent set by
   `getAvailableSlots` (`shared/src/api/appointments.ts:186`, "R3 — the backend is the SINGLE SOURCE
   OF TRUTH"). No client-side queue arithmetic, ever.
3. **Zero PHI on the realtime wire.**
4. **Realtime is an optimisation; polling is the correctness floor.**
5. **Tier discipline** (`CLAUDE.md`): patient reads/writes under RLS → `shared/src/api/queue.ts`;
   only push dispatch and cron-style sweeps → `backend/`.
6. **Reuse everything in §1.2.** No re-implementation of check-in.

### 8.2 Database — additive migrations

**M1 · Harden existing enqueue (fixes G9)** — `CREATE OR REPLACE FUNCTION enqueue_appointment`
adding `pg_advisory_xact_lock` + bounded retry on 23505. Signature unchanged → HAMS callers unaffected.

**M2 · New columns on `queue_items`** (all nullable or defaulted; HAMS reads are unaffected):

| column | type | purpose |
|---|---|---|
| `queue_date` | `date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Muscat')::date` | fixes G5 |
| `priority` | `smallint NOT NULL DEFAULT 100` | 10 emergency · 50 VIP/statutory · 100 appointment · 150 re-entry · 200 walk-in · 250 late — fixes G4 |
| `sequence` | `integer` | stable per-`(facility,doctor,date)` arrival order — the patient-facing number, fixes G3 |
| `serving_started_at` | `timestamptz` | consultation start |
| `skipped_at` | `timestamptz` | skip without losing the row |
| `recall_count` | `smallint NOT NULL DEFAULT 0` | call-3-times policy |
| `acknowledged_at` | `timestamptz` | patient tapped "I'm on my way" |
| `away_until` | `timestamptz` | leave-and-return mode |
| `estimated_call_at` | `timestamptz` | denormalized ETA |

`position` is **retained untouched** for HAMS compatibility and simply stops being patient-facing.
New indexes: `(facility_id, doctor_id, queue_date, priority, sequence)` and `(appointment_id)`.

**M3 · New table `queue_state`** — the only new table, and the crux of §5.2.

```
PK (facility_id, doctor_id, queue_date)
now_serving_sequence int | now_serving_at timestamptz
waiting_count int | is_paused bool | pause_reason text | resume_expected_at timestamptz
avg_observed_minutes numeric   -- rolling EMA of real consultation durations
last_movement_at timestamptz | updated_at timestamptz
```

Zero PHI → safe to publish to Realtime and safe to expose to any authenticated patient who has an
active queue item at that facility. Maintained by an AFTER INSERT/UPDATE trigger on `queue_items`.

**M4 · Patient RLS (fixes G1)** — two narrow, additive policies:
- `queue_items_patient_own` — `FOR SELECT`, `USING (public._owns_appointment(appointment_id))`.
  Reuses the existing helper. Grants a patient sight of **their own row only**.
- `queue_state_patient_read` — `FOR SELECT` to authenticated where the caller has an active
  queue item in that `(facility, doctor, date)`.

Aggregates (`patients_ahead`) never come from RLS reads — they come from M5.

**M5 · Patient read RPC** — `get_my_queue_status(p_appointment_id uuid) RETURNS json`, `SECURITY
DEFINER`, gated by `_owns_appointment`. Returns **only derived, non-PHI** values:

```json
{ "queue_item_id": "...", "status": "waiting", "your_sequence": 7, "patients_ahead": 3,
  "now_serving_sequence": 4, "estimated_wait_minutes": 35, "estimated_call_at": "...",
  "doctor_status": "with_patient", "is_paused": false, "pause_reason": null,
  "resume_expected_at": null, "position_changed_at": "...", "as_of": "..." }
```

`as_of` is what the UI renders as "last updated" — it is what keeps a stale screen honest.

**M6 · Staff RPCs** — the §6.2 contract (`call_next_patient`, `start_consultation`,
`complete_queue_item`, `skip_queue_item`, `recall_queue_item`, `mark_queue_no_show`,
`set_queue_paused`, `set_queue_priority`, `reassign_queue_item`, `close_queue_session`). Each takes
an advisory lock, re-checks facility membership, writes `hams_audit_log`.

**M7 · Realtime publication** — `ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_state;`
(**`queue_items` is deliberately NOT added** — PHI.)

**M8 · Sweeper** — `pg_cron` (already installed, `20260326110433:51`) every 15 min: expire stale
`waiting|called` rows from previous `queue_date`s, and flag appointments past `slot_start + grace`
with no check-in. **Flags only — never auto-`no_show`.**

**M9 · Type regeneration** — `npm run db:types`. Note `shared/src/types/supabase.ts` is currently
**UTF-16LE encoded** and shows as modified in git; regenerating will likely rewrite the encoding.
Verify the diff before committing.

### 8.3 Realtime architecture

```
staff RPC → queue_items (UPDATE)
              └─ AFTER trigger → queue_state (1 UPDATE, no PHI)
                                   └─ supabase_realtime → N subscribers
                                        └─ each: invalidateQueries(['queue', apptId])
                                             └─ refetch get_my_queue_status()  ← authority
```

Client rules: subscribe **only** while (a) the app is foregrounded **and** (b) the patient has an
active queue item today; unsubscribe on background/blur/unmount; never render the realtime payload
directly. Since this is the repo's **first** realtime consumer (G2), the channel-lifecycle helper
should be written as a reusable hook (`useRealtimeInvalidation`) so notifications and appointments
can adopt it later.

### 8.4 Shared library — `shared/src/api/queue.ts` (new, 14th module)

```ts
getMyQueueStatus(db, appointmentId): Promise<QueueStatus>   // RPC M5
subscribeToQueue(db, key, onChange): () => void             // channel + unsubscribe
setAwayMode(db, queueItemId, until): Promise<void>
acknowledgeCall(db, queueItemId): Promise<void>
notifyRunningLate(db, appointmentId, minutes): Promise<void>
```

Same generic-`DB` pattern as the other 13 modules, so web and mobile share it verbatim. Exported from
both `shared/src/index.ts` and `shared/src/mobile.ts`.

### 8.5 Mobile

**Data layer** (follow the documented convention in `CLAUDE.md`: types → interface → mock → real →
hybrid wiring):
1. `src/data/types.ts` — `QueueStatus`, `QueueItemStatus`.
2. `src/data/repositories.ts` — `QueueRepository` + a `queue` field on `Repositories`.
3. `src/data/mock/index.ts` — a **time-driven simulation** (position decrements every ~20 s, pauses,
   an emergency insert, a call event) so all six screen states are demoable with no backend. This is
   not optional polish — it is how S3 gets designed and reviewed.
4. `src/data/real/index.ts` — wraps `api.queue.*`.
5. `src/data/index.ts` — add `queue: realRepositories.queue` to `hybridRepositories` and update the
   header comment (the file's contract is that the comment stays accurate).

**Hooks** — `src/hooks/queries/useQueue.ts`: `useQueueStatus(appointmentId)` (adaptive
`refetchInterval` per §5.3), `useQueueRealtime(key)`, `useAppStateRefetch()`.

**Routes** — `app/(app)/appointments/[id]/queue.tsx` and `.../check-in.tsx` (formSheet), both
declared as sibling `Stack.Screen`s in `app/(app)/_layout.tsx`.

**Components** — `QueuePositionRing`, `QueueStatusCard`, `NowServingBadge`, `QueueTimeline`,
`CalledOverlay`, `QueueStaleBanner`.

**i18n** — extend the existing `appointments` namespace, adopting the five orphaned keys; add ~25 new
keys to `en.ts` **and** `ar.ts` (the `Leaves<Messages>` mapped type makes a missing Arabic key a
silent key-string fallback, so it will not fail the typecheck — review Arabic coverage by hand).

**Push** — `src/utils/notifications.ts` already classifies `checkin`/`check_in` as `appointment`;
add a `queue` kind routing to `/appointments/{id}/queue`, or simply have the backend send an explicit
`data.url` (already supported at `notifications.ts:77`). Prefer `data.url` — no client change needed.

### 8.6 Backend

- `POST /api/queue/notify` — internal, `x-internal-secret`-guarded (mirrors
  `/api/notifications/push`), called by the staff RPC layer via a DB webhook or by the Edge Function.
  Dispatches `you_are_next` / `you_are_called` / `queue_paused` / `running_late` via the existing
  `sendPushToUser`.
- Edge Function `queue-sweeper` (optional; the `pg_cron` job of M8 covers the MVP).
- **No new patient-facing REST route** — patients read via RLS/RPC, per the tier rule.

### 8.7 Security

| Risk | Control |
|---|---|
| Patient reads another patient's PHI | `get_my_queue_status` is `SECURITY DEFINER` + `_owns_appointment`-gated and returns **only aggregates**; `queue_items` patient policy is own-row-only; `queue_state` holds no PHI |
| Realtime payload leakage | `queue_items` is deliberately kept **out** of the publication |
| Fake remote check-in | Time-window gate + optional geofence + QR-at-reception; reception override always wins |
| Position manipulation | `position`/`sequence`/`priority` are writable only through `SECURITY DEFINER` RPCs that re-check membership; the patient `GRANT` stays SELECT-only |
| Staff acting outside their facility | Existing `queue_items_access` + an explicit re-check inside each RPC |
| Audit | Every staff mutation writes `hams_audit_log` (the trigger infrastructure already exists) |
| PHI at rest on device | Queue data is low-sensitivity (no diagnosis) but still goes through the AsyncStorage cache — keep the queue query's `gcTime` short and let `clearPersistedCache()` on logout cover it |

### 8.8 Performance

- Every query is covered by `(facility_id, doctor_id, queue_date, priority, sequence)`.
- `patients_ahead` is a single indexed `COUNT` over the active partial index — sub-millisecond at
  realistic cardinality.
- `queue_state` is one row per doctor-day: the hot read path is a PK lookup.
- The ETA EMA is maintained incrementally on completion, never recomputed by scanning history.
- Client: one RPC per invalidation, `staleTime` 10 s, `structuralSharing` so unchanged fields don't
  re-render the ring.

### 8.9 Testing

There is **no automated test suite anywhere in this repo** (`CLAUDE.md`: no jest config, no
`*.test.*`). Testing therefore follows `docs/TESTING_GUIDE.md`'s manual/curl pattern — and the queue
is the strongest candidate yet for introducing pgTAP or a SQL-level harness, because its failure
modes are concurrency-shaped and cannot be caught by hand.

**Minimum manual matrix:** happy path (check-in → waiting → called → done); two concurrent check-ins
into an **empty** queue (G9 regression); two concurrent "call next"; emergency insert reorders
correctly; pause/resume preserves order; skip → recall → served; late arrival lands in the correct
band; end-of-day sweeper expires yesterday's rows; realtime drop → polling takeover → reconnect;
airplane mode shows the stale banner and no ticking ETA; background → push → tap → deep-link to S3;
Arabic RTL on every state; two devices for one patient converge; a guardian tracking two family
members; RLS negative tests (patient B cannot read patient A's row via REST **or** realtime).

**Load:** simulate 200 concurrent subscribers against one `queue_state` row and measure Realtime CPU
and delivery latency before committing to realtime in production.

### 8.10 Deployment order

Each step is independently deployable and inert until the next lands:

1. M1 (enqueue hardening) — pure fix, ships alone.
2. M2 + M3 + M8 — schema + trigger + sweeper. **Backfill `queue_date`/`sequence` for existing rows.**
3. M6 staff RPCs — inert until a caller exists (HAMS or the fallback console).
4. M4 + M5 — patient read path. Still invisible (no UI).
5. `npm run db:types` (M9) + `shared/src/api/queue.ts`.
6. Mobile behind an `EXPO_PUBLIC_FEATURE_QUEUE` flag → internal → one pilot clinic → general.
7. M7 realtime **last**, with the polling fallback already proven in production.

**Rollback:** the feature flag disables the UI instantly; the DB objects are additive and can be left
in place (no HAMS behaviour depends on them). Only M1 alters an existing function — keep the prior
definition to hand.

---

<a name="9"></a>
## 9. Development plan

### 9.0 Decisions required before Phase 1 (blocking)

| # | Decision | Why it blocks | Recommendation |
|---|---|---|---|
| **D1** | **Who calls patients?** Does the live HAMS staff console write `queue_items.status`? **[UNVERIFIED from this repo]** | If nobody ever sets `called`/`done`, the patient screen shows "3 ahead" forever and the feature is worse than nothing. **This is the single largest risk in the project.** | Verify against live HAMS in week 1. If HAMS does not: build a minimal MediLink staff console (Phase 2b, +3–4 d) — a `frontend/(staff)` route gated by existing `facility_staff` RLS. Do **not** ship the patient UI without a proven writer. |
| **D2** | Queue scope: per-doctor or per-facility? | Determines the key on `queue_state` and the meaning of every number shown | **Per (facility, doctor, date)**, retaining `position` for HAMS compat |
| **D3** | Self-check-in constraint: time-window only, or + geofence, or + QR? | Affects M4/M5 and S2 | Time-window for MVP; geofence in Phase 3; QR display from day 1 (the data already exists) |
| **D4** | Grace period + late policy per facility? | New `facility_settings` columns if configurable | Hard-code 15 min for MVP; make it configurable in Phase 3 |
| **D5** | Pilot facility for rollout | Realtime and ETA calibration need real traffic | One clinic, one doctor, two weeks |

### 9.1 Phases

| Phase | Scope | Effort | Complexity | Depends on | Risk |
|---|---|---|---|---|---|
| **0 · Discovery** | Verify D1 against live HAMS; confirm `queue_items` usage in production; agree D2–D5 | **6–10 h** | Low | — | **Findings can reshape everything** |
| **1 · DB foundation** | M1 hardening · M2 columns + backfill · M3 `queue_state` + trigger · M8 sweeper · M4 patient RLS · M5 `get_my_queue_status` · `db:types` | **20–26 h** | **High** (concurrency, live shared DB) | 0 | Migration against a live HAMS DB; needs a staging rehearsal |
| **2a · Staff RPCs** | M6 — full §6.2 contract + audit + advisory locks | **16–20 h** | High | 1 | Contract must match HAMS's model |
| **2b · Fallback staff console** *(only if D1 = HAMS won't)* | Minimal `frontend/(staff)`: today's list, call next, skip, complete, pause | **24–32 h** | Medium | 2a | New surface in a patient-only repo — scope creep risk |
| **3 · Shared + mobile data layer** | `shared/src/api/queue.ts` · types · `QueueRepository` · mock simulation · real impl · hybrid wiring · `useQueue` hooks (**polling only**) | **16–20 h** | Medium | 1 | Low — well-trodden path in this repo |
| **4 · Mobile UI** | S2 check-in sheet · S3 Live Queue + all states · S0/S1 modifications · components · animations · i18n EN+AR · a11y | **32–40 h** | Medium-High | 3 | The ring/ETA UX will need iteration |
| **5 · Push** | `/api/queue/notify` · you're-next / called / paused / running-late · dedupe · deep-link · throttling | **12–16 h** | Medium | 2a, 4 | Blocked by the **existing** open item: APNs/EAS creds (tracker Phase 2.7) |
| **6 · Realtime** | M7 · `useRealtimeInvalidation` · lifecycle · fallback proof · load test | **14–18 h** | **High** (first realtime consumer in the repo) | 4 | Socket lifecycle on RN backgrounding is fiddly |
| **7 · ETA intelligence** | Observed-duration EMA · pause-aware recompute · late-band handling · accuracy telemetry | **12–16 h** | Medium | 2a | Needs real traffic to calibrate |
| **8 · Differentiators** | Leave-now nudge + leave-and-return (**ship together**) · running-late button · pre-consultation form | **20–28 h** | Medium | 4, 5 | Product-validation dependent |
| **9 · Hardening & pilot** | Concurrency tests · RLS negative tests · load test · pilot · calibration | **16–24 h** | Medium | all | — |

**Totals:** MVP (0,1,2a,3,4,5,9) ≈ **118–156 h** ≈ **3–4 weeks** for one engineer.
Full production (+6,7,8) ≈ **164–218 h** ≈ **4.5–6 weeks**. Add **24–32 h** if D1 forces Phase 2b.

### 9.2 Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **HAMS never calls patients (D1)** | **Fatal** — feature is inert | Medium | Phase 0 verification; Phase 2b fallback budgeted |
| Migration disturbs live HAMS | High | Low | Additive-only; nothing existing altered except `enqueue_appointment` (signature-compatible); staging rehearsal first |
| Inaccurate ETA erodes trust | High | **High** | "About" language, 5-min rounding, observation-driven EMA, accuracy telemetry, hide the ETA when confidence is low |
| Realtime cost/limits at scale | Medium | Medium | `queue_state` fanout design; polling floor; load test before enabling |
| Patients fake remote check-in | Medium | **High** | Time window + geofence + reception override |
| Push undelivered (APNs creds still open) | High | Medium | Already the top open item in the tracker; polling + in-app states degrade gracefully |
| Scope creep into a full staff product | Medium | Medium | Phase 2b is explicitly minimal and flagged as such |
| No automated tests to catch concurrency regressions | Medium | High | Introduce a SQL-level concurrency harness in Phase 1 (the first tests in the repo) |

---

<a name="10"></a>
## 10. Final verdict

**1 · Is the current backend already enough?**
**No — roughly 30–35%.** Storage, integrity constraints and the *entry* path (check-in, walk-in,
emergency enqueue) are genuinely production-quality and work end-to-end today. Everything that makes
a queue a queue is missing: patients cannot read it (G1), nothing advances it (§1.3), ordering is
wrong (G3, G4), it never resets (G5), and there is no ETA (G6). It is a well-built inbox with no
outbox.

**2 · Can Queue be built without new tables?**
**Almost — one new table is strongly recommended.** `queue_items` alone can carry the feature via
added columns. But **`queue_state`** (one zero-PHI row per doctor-day) is what makes realtime both
*safe* (no patient data on the wire) and *cheap* (one write fans out to N subscribers instead of N
RLS evaluations per movement). Without it you must choose between leaking PHI through realtime
payloads and not having realtime. **One new table, ~9 new columns, no destructive change.**

**3 · Can existing RPCs be reused?**
**Yes — reuse all of them, recreate none.** `checkin_my_appointment` → `checkin_and_enqueue` →
`enqueue_appointment` is a correct, idempotent, ownership-gated chain already wired into web and
mobile. It needs exactly one hardening (the empty-queue race, G9) with **no signature change**.
`add_walkin_to_queue`, `_owns_appointment`, `facility_settings.*_minutes`, `doctors.status` and the
entire push pipeline are all reusable as-is. Roughly **40% of the backend work is already done** —
it is just the wrong 40% to ship alone.

**4 · Does Queue require realtime?**
**Not for correctness — yes for the product to be worth building.** Adaptive polling (10/30/60 s) is
functionally sufficient and should be the MVP transport. But the moment that matters most — *"you're
being called"* — happens with the phone in a pocket, where **push**, not realtime, is the transport.
Priority order: **push > polling > realtime**. Realtime is a foreground polish layer, and it is worth
noting it would be the **first realtime consumer in this entire codebase** (G2) — budget it as new
infrastructure, not a small addition.

**5 · What should be MVP?**
Phases 0, 1, 2a, 3, 4, 5, 9 — **≈3–4 weeks**:
patient read RPC + RLS · per-doctor/per-day ordering with priority · staff RPC contract ·
`shared/src/api/queue.ts` + repository + mock simulation · check-in sheet + Live Queue screen with
all six states · adaptive polling · you're-next / called push · static-average ETA labelled "about" ·
EN+AR + a11y · one pilot clinic behind a feature flag.
**Explicitly out:** realtime, learned ETA, geofence, Live Activity, leave-and-return.

**6 · What should be Production?**
MVP + Phase 6 (realtime + load-tested fallback) + Phase 7 (observation-driven ETA with accuracy
telemetry) + Phase 8's first two items (**leave-now nudge and leave-and-return, shipped together**) +
Phase 9 hardening: concurrency and RLS negative tests, geofenced check-in, pause/resume with reasons,
end-of-day sweeper, full audit trail. **≈4.5–6 weeks.**

**7 · Future enhancements?**
Live Activity / Dynamic Island · pre-consultation form during the wait (`pre_consultation_forms`
already exists, unused) · multi-branch queues (`branch_id` already exists, unused) ·
department/pooled queues for labs and radiology · the re-entry "back from tests" lane · predictive
ML ETA from historical patterns · waiting-room display board (a web route rendering `queue_state`) ·
queue analytics for facilities · SMS fallback for patients without the app · Apple/Google Wallet
queue pass · integration with the existing waitlist so a no-show instantly offers the slot onward.

---

### Recommendation — traditional hospital queue, or modernise?

**Model the hospital's reality exactly. Modernise the patient's experience completely.**

These are not in tension; they are different layers, and conflating them is how queue software fails.

**Keep faithful to how hospitals actually work** — because the alternative breaks clinical safety and
gets the software switched off:
- It must remain a **priority queue with human override**, not FIFO. Doctors and receptionists
  reorder for clinical reasons software cannot evaluate. Any design that makes override hard will be
  bypassed via paper within a week.
- **Emergencies jump. Always.** No configuration, no exception.
- Real-world events — breaks, overruns, late doctors, re-entry after labs — must be **first-class
  states**, not error paths.
- No-show must stay a **human decision**.
- Reception must always be able to override anything the app decided.

**Modernise decisively — because the patient's actual problem is not the ordering.** Nobody objects
to waiting 40 minutes for a doctor. They object to waiting 40 minutes *without knowing it will be
40 minutes*, on a chair, unable to leave, asking a receptionist who is already busy. The pain is
**information asymmetry**, and it is entirely a software problem:
- **Do not "fix" the queue order** — hospitals need it flexible.
- **Do fix the information gap** — position, honest ETA, live movement, the *reason* for delay.
- **Do give back the waiting room** — travel-time-aware "leave now" plus leave-and-return converts a
  plastic chair into a coffee shop. This is the feature patients will actually talk about.
- **Do close the loop** — "running late" and "I'm on my way" turn a one-way board into a
  conversation, which also measurably helps the clinic (fewer surprise no-shows, better slot
  recovery).
- **Do be honest above all** — "about 35 minutes", a visible last-updated stamp, a stated reason for
  every delay, and never a ticking countdown while offline. One confidently wrong ETA costs more
  trust than ten vague ones.

A traditional queue optimises for **staff throughput**. MediLink should keep that intact and add the
layer hospitals have never had the channel to deliver: **a patient who knows exactly what is
happening.** That is the entire product, and it is achievable on top of the schema that already
exists.

---

*End of audit. No implementation has begun; awaiting decisions D1–D5 (§9.0).*
