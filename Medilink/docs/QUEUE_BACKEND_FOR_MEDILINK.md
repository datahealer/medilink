# Queue Backend — HAMS ↔ MediLink Integration Contract

**Branch:** `integration/queue-backend`
**Linked Supabase project:** `zojrwuvxrkmgnlwyuypg` — *Appointment for Healthcare* (ap-south-1, PostgreSQL 17)
**Migration state:** 146 synced with remote · 5 new, **not yet applied**

HAMS owns queue business logic, APIs, schema, security, realtime and lifecycle.
MediLink consumes the endpoints below and implements **UI only**.

---

## 1. Completed work

### 1.1 Branch integration

`satyam1` and `raman03` had diverged from a common base (`a86b4fe`, 23 Apr) and both
carried unique work. Merged conflict-free into `integration/queue-backend`.

| Branch | Ahead of main | Contribution |
|---|---:|---|
| `satyam1` | 165 | Queue RPCs, atomic enqueue, `done_at` retention, appointment↔queue sync, staff role |
| `raman03` | 164 | Facility doctor management UI, per-doctor availability API, public doctor profile |

Verified: 0 commits from either branch unreachable from `HEAD`; `satyam1` authoritative for
every queue file; 9 files exist only on `raman03` and were preserved.

### 1.2 Migration history synchronization

The repo was **25 migrations behind** the live database. Those files existed only in the
MediLink repo, which shares this backend.

Before copying: all 121 pre-existing migrations were confirmed **byte-identical** across
both repos, and MediLink was confirmed a clean superset. Copied with original filenames and
timestamps — no squash, no schema regeneration, chronological order intact.

```
supabase migration list
  synced (local == remote)   146
  remote-only                  0
  local-only (pending)         5   ← the new queue migrations
```

### 1.3 Migrations added (5) — **not yet applied**

| Version | Purpose |
|---|---|
| `20260728000001` | `queue_items` → `supabase_realtime`, `REPLICA IDENTITY FULL`, `realtime_published_tables()` verification helper |
| `20260728000002` | Patient RLS, orphaned-policy fix, technician policy, `_owns_appointment` drift recovery, one index |
| `20260728000003` | `queue_items.acknowledged_at`, `.acknowledged_kind` (+ 2 CHECK constraints) |
| `20260728000004` | `get_my_queue_position()` |
| `20260728000005` | `acknowledge_queue_call()` |

### 1.4 Security fix — orphaned RLS policy

The base schema created `queue_items_staff_only`
([`20260319071603:767`](../supabase/migrations/20260319071603_hams_complete_schema.sql)) with
**no facility scoping**. Two later migrations meant to replace it
([`20260422102441:44`](../supabase/migrations/20260422102441_new_staff_role_migration.sql),
[`20260422103305:75`](../supabase/migrations/20260422103305__f20_f22_production_fixes.sql))
both drop `queue_items_access` — a policy that did not exist yet — and never drop the orphan.

Permissive RLS policies are OR-ed, so the unscoped policy wins: **the facility isolation added
in April has never actually taken effect.** Any doctor, technician or facility_admin can
currently read and modify queue rows at every facility. `20260728000002` drops the orphan.

> ⚠️ Confirm against production before pushing — see §4.

### 1.5 Schema drift recovered

`public._owns_appointment(uuid)` is live on the remote project but defined in **no migration**
across the entire 146-file history — created manually. `20260713000001` already depends on it
and its header calls it "already-present", but it was never committed, so
`supabase db reset` produces a database where `checkin_my_appointment()` compiles and then
fails at runtime.

`20260728000002` creates it **only when absent**, so fresh environments become reproducible
while the live definition is never overwritten.

### 1.6 Cleanup

- **Deleted** `src/app/dashboard/facility/queue-management/` — dead page carrying a hard-coded
  facility UUID (`80e5d09d-…`), unreferenced by `sidebarConfig.ts`. No hard-coded facility IDs
  remain anywhere in `src/`.
- **Extracted** [`src/lib/auth/facilityAccess.ts`](../src/lib/auth/facilityAccess.ts), replacing
  three divergent copies of `verifyFacilityAccess`. That divergence is exactly why technicians
  saw a Queue menu entry but received a 403.
- **Technician access restored** on the queue read path (facility-scoped, read-only — narrower
  than the unscoped read+write they hold today).

### 1.7 Incidental pre-existing fixes

Both were blocking validation and are unrelated to queue:

- `src/types/supabase.ts` — a previous `supabase gen types` run appended two lines of CLI
  stdout ("A new version of Supabase CLI is available…") into the file, breaking `tsc` for the
  entire repository.
- `supabase/functions/broadcast-announcement/index.ts:137` — unclosed `fetch()` object literal
  (`);` instead of `});`), a genuine syntax error making that function undeployable.

---

## 2. Backend available to MediLink

Both endpoints authenticate via `Authorization: Bearer <supabase_access_token>`
([`src/lib/supabase/api.ts:14`](../src/lib/supabase/api.ts)). Patients are exempt from AAL2
([`src/lib/auth/api.ts:43`](../src/lib/auth/api.ts)), so no 2FA friction on mobile.

The handlers contain **no SQL** — all logic lives in the RPCs, so the two apps cannot drift.

### 2.1 `GET /api/patients/me/queue-status`

Live queue state for the calling patient.

**Query:** `appointment_id` *(optional, UUID)* — omit to let the server pick the most relevant
entry (called → waiting → done within 2 h).

**200**
```json
{
  "success": true,
  "data": {
    "found": true,
    "queue_item_id": "8f3c…",
    "position": 7,
    "people_ahead": 2,
    "now_serving_position": 5,
    "queue_status": "waiting",
    "is_waiting": true,
    "is_called": false,
    "is_done": false,
    "is_checked_in": true,
    "checked_in_at": "2026-07-28T09:12:04.113Z",
    "called_at": null,
    "done_at": null,
    "acknowledged_at": null,
    "acknowledged_kind": null,
    "is_walkin": false,
    "is_online": true,
    "estimated_wait_minutes": 30,
    "avg_consultation_minutes": 15,
    "appointment": {
      "id": "1a2b…", "reference_number": "HAMS-4F2A91C7",
      "slot_date": "2026-07-28", "slot_start": "10:00:00", "slot_end": "10:15:00",
      "status": "checked_in", "type": "in_person",
      "checked_in_at": "2026-07-28T09:12:04.113Z"
    },
    "doctor": {
      "id": "9c1d…", "full_name": "Dr. Fatima Al-Said", "specialty": "Cardiology",
      "status": "with_patient", "status_updated_at": "2026-07-28T09:40:11.002Z"
    },
    "facility": { "id": "80e5…", "name": "Muscat Central Clinic" },
    "server_time": "2026-07-28T09:42:00.517Z"
  }
}
```

**Errors** — `{ "success": false, "error": { "code", "message" } }`

| code | HTTP | Meaning | Client action |
|---|---|---|---|
| `not_in_queue` | 404 | No active queue entry | Show "not checked in yet" |
| `not_checked_in` | 404 | That appointment isn't queued | Offer check-in |
| `forbidden` | 403 | Not the caller's appointment | Generic error — never reveals existence |
| `unauthorized` | 401 | No session | Re-authenticate |
| `validation_error` | 400 | `appointment_id` not a UUID | Fix request |
| `server_error` | 500 | Unexpected | Retry |

**Semantics worth knowing**

- `people_ahead` is scoped to the **same doctor** when one is assigned — doctors consult in
  parallel and `position` is a facility-wide sequence, so raw position badly overstates the wait.
  Rows with status `called` count as ahead (that patient still occupies the room).
- `estimated_wait_minutes` = `people_ahead × avg_consultation_minutes`; `0` once called.
- `now_serving_position` is an integer only — never another patient's identity.
- Use `server_time` rather than device time to drive countdowns.

### 2.2 `POST /api/patients/me/queue-status/acknowledge`

Patient confirms a call.

**Body** *(all optional; empty body = acknowledge current entry as `seen`)*
```json
{ "appointment_id": "1a2b…", "kind": "seen" }
```
`kind` ∈ `"seen"` ("I've seen the call") | `"on_my_way"`.

**200**
```json
{
  "success": true,
  "data": {
    "success": true,
    "queue_item_id": "8f3c…",
    "queue_status": "called",
    "acknowledged_kind": "on_my_way",
    "first_acknowledgement": true,
    "acknowledged_at": "2026-07-28T09:44:12.881Z"
  }
}
```

| code | HTTP | Meaning |
|---|---|---|
| `not_in_active_queue` | 409 | No `waiting`/`called` entry |
| `invalid_kind` | 400 | `kind` not `seen`/`on_my_way` |
| `forbidden` | 403 | Not the caller's appointment |
| `unauthenticated` | 401 | No session |

Repeat calls are allowed — latest signal wins. Only the first is written to `audit_logs`.

### 2.3 Realtime

After `20260728000001`, patients may subscribe directly:

```ts
supabase
  .channel(`my-queue:${appointmentId}`)
  .on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "queue_items",
    filter: `appointment_id=eq.${appointmentId}`,
  }, () => refetchQueueStatus())
  .subscribe();
```

RLS delivers **only the patient's own row** (`queue_items_patient_read`). Treat the event as a
signal to re-call `GET /queue-status` — the row alone has no `people_ahead` or ETA.

### 2.4 Pre-existing RPCs MediLink should reuse

| RPC | Signature | Use |
|---|---|---|
| `checkin_my_appointment` | `(p_id uuid, p_patient_name text, p_patient_phone text) → json` | **Patient self check-in.** Ownership-gated wrapper over `checkin_and_enqueue`. Call with the user's client. |
| `cancel_my_appointment` | `(p_id uuid, p_reason text?) → json` | Patient cancel |
| `reschedule_my_appointment` | `(…) → json` | Patient reschedule |
| `_owns_appointment` | `(p_id uuid) → boolean` | Ownership predicate |
| `doctors_available_today` | `(…)` | Availability |

Alternatively `POST /api/appointments/[id]/check-in` wraps `checkin_and_enqueue` with the
T-30-minute window check and the documented error codes in
[`README.md:229`](../README.md).

### 2.5 Full RPC contract

```
get_my_queue_position(p_appointment_id UUID DEFAULT NULL) RETURNS JSON
  SECURITY DEFINER · STABLE · search_path = public, pg_temp
  EXECUTE: authenticated, service_role   (REVOKEd from PUBLIC, anon)
  Ownership from auth.uid(). p_appointment_id is a filter, never a trust boundary.
  MUST be called with the user's client — auth.uid() is NULL under service role.

acknowledge_queue_call(p_appointment_id UUID DEFAULT NULL,
                       p_kind TEXT DEFAULT 'seen') RETURNS JSON
  SECURITY DEFINER · VOLATILE · search_path = public, pg_temp
  EXECUTE: authenticated, service_role   (REVOKEd from PUBLIC, anon)
  Locks the row FOR UPDATE; writes only acknowledged_at + acknowledged_kind.
```

### 2.6 PHI guarantee

`get_my_queue_position` returns only: the caller's own queue row and appointment; integer
counts (`position`, `people_ahead`, `now_serving_position`); and doctor/facility identity that
is already public via the doctor profile and facility listing pages. **No other patient's name,
phone, appointment or queue row is ever returned.**

This is why it is an RPC rather than a table read: `people_ahead` aggregates over rows the
patient must not see, and RLS cannot express *"count rows you cannot read"*.

---

## 3. Remaining HAMS work

Ordered. None blocks MediLink's queue screen.

| # | Item | Notes |
|---|---|---|
| 1 | **Apply the 5 migrations** | Review, then `supabase db push`. See §4 — not done here. |
| 2 | **Regenerate types** | `supabase gen types typescript --linked > src/types/supabase.ts`, then drop the two `(supabase as any).rpc(...)` casts. **Redirect stdout carefully** — the CLI's upgrade notice is what corrupted the file before. |
| 3 | Notification on `→ called` | Trigger + Edge Function fan-out to `device_tokens` (table already exists, 2 rows). Only then is the patient actively told. |
| 4 | `called_by_staff_id` | Column exists since Apr 22; still never written by `call/route.ts`. Audit trail is incomplete. |
| 5 | End-of-day cleanup cron | `position` is `MAX+1` per facility with no date scope and no reset — grows unbounded across days. Three `cron.schedule` jobs exist; none for queue. |
| 6 | Staff ops | `call_next`, `skip`, `recall`, `pause`/`resume`, `mark_no_show`, priority/emergency queue-jump. All still absent. |
| 7 | `serving_started_at` | `called` and "in consultation" remain indistinguishable. |
| 8 | Queue analytics | Now possible (`done_at` retained since satyam1) but nothing consumes it. |
| 9 | `needs_queue_sync` retry job | Flag is set on sync failure; nothing ever reads it. The "will retry automatically" message shown to staff is currently false. |
| 10 | `isStaff()` omits `'staff'` | [`src/lib/auth/roles.ts:1`](../src/lib/auth/roles.ts) — front-desk staff with 2FA enabled bypass AAL2 at the API layer, while `aal2_or_no_2fa()` enforces it at the DB layer. Deliberately left alone: app-wide blast radius, outside queue scope. |
| 11 | 119 pre-existing type errors | Masked until now by the corrupted types file. `next.config.ts` sets `ignoreBuildErrors: true`, so builds pass regardless. |

---

## 4. Before applying — three unverifiable assumptions

Docker is unavailable on the machine where this was written, so `supabase db pull`,
`db dump` and a local shadow database were all impossible. **The SQL has not been executed
anywhere.** It was validated by static review against the live schema (via
`gen types --linked` and `inspect db`), not by running it.

Confirm these in the SQL editor before `supabase db push`:

```sql
-- 1. Is the orphaned policy still live? (20260728000002 drops it)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'queue_items';

-- 2. Is queue_items already published? (20260728000001 is idempotent either way)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public';

-- 3. Any queue triggers added by the 25 MediLink migrations?
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.queue_items'::regclass AND NOT tgisinternal;
```

Expected: (1) both `queue_items_staff_only` and `queue_items_access` present — dropping the
first is the fix; if it is already gone, the DROP is a harmless no-op. (2) `queue_items` absent.
(3) `enforce_queue_item_integrity` only.

Migrations `…0001`, `…0003`, `…0004`, `…0005` are additive and idempotent and are safe
regardless of the answers. `…0002` is the one that changes existing security state.

**Verify after applying:**

```sql
SELECT public.realtime_published_tables();          -- must contain queue_items
SELECT public.get_my_queue_position();              -- as a patient with an active queue item
SELECT public.acknowledge_queue_call(NULL,'seen');  -- same session
```

Cross-tenant check — as Patient A, with Patient B's appointment id:

```sql
SELECT public.get_my_queue_position('<patient-B-appointment-uuid>');
-- expected: {"found": false, "reason": "forbidden"}
SELECT count(*) FROM queue_items;
-- expected: only rows belonging to Patient A
```

---

## 5. Validation performed

| Check | Result |
|---|---|
| `npm run build` | ✅ Compiled in 52 s; all 5 queue routes emitted |
| `tsc --noEmit` | ⚠️ 119 errors — **byte-identical with and without these changes** (verified by stashing). New files: 0 errors. |
| `next lint` (changed files) | ✅ 0 new issues; the refactor removed three `any` parameters |
| `supabase migration list` | ✅ 146 synced, 0 remote-only |
| Branch integrity | ✅ 0 commits lost from `satyam1`, `raman03`, `dev`, `main` |
| Migration SQL execution | ❌ **Not executed** — no Docker, and pushing to production was not authorised |

---

## 6. Division of responsibility

| Concern | Owner |
|---|---|
| Queue state machine, position arithmetic, ETA | 🗄️ Shared Postgres RPCs |
| Authorisation | 🗄️ RLS (API checks are defence-in-depth only) |
| Call / skip / recall / pause / done / no-show / walk-in | 🏥 HAMS — staff authority, never exposed to patients |
| Full queue list *(contains other patients' PHI)* | 🏥 HAMS |
| Display board, analytics, doctor status | 🏥 HAMS |
| Show my position / ETA / doctor status | 📱 MediLink — read-only, own row |
| Check-in, acknowledge | 📱 MediLink — via the RPCs above |
| Push fan-out | 🗄️ Shared trigger → Edge Function — **never** client-initiated |

**Never duplicate:** the queue state machine · position arithmetic (the non-atomic `count+1`
was already duplicated across two routes before `enqueue_appointment` centralised it — do not
reintroduce it) · ETA computation · status transition rules · authorisation · push triggers ·
the `queue_items` schema.
