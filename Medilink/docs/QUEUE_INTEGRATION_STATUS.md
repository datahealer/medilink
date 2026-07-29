# Queue Management — MediLink Integration Status

**Date:** 2026-07-28 · **Branch:** `feature/ai-completion`
**Backend source of truth:** [`QUEUE_BACKEND_FOR_MEDILINK.md`](./QUEUE_BACKEND_FOR_MEDILINK.md) (HAMS)
**Superseded design doc:** [`QUEUE_MANAGEMENT_AUDIT_AND_PLAN.md`](./QUEUE_MANAGEMENT_AUDIT_AND_PLAN.md) §8–§10 — void

HAMS owns the queue backend. MediLink consumes it and owns the patient experience only.

---

## 1. Backend synchronization summary

MediLink was **behind HAMS by exactly the 5 new queue migrations** and the 2 patient endpoints.
Nothing else diverged.

Verified before copying anything:

```
migration filenames in HAMS only  →  5  (all 20260728000001-05, the queue set)
migration filenames in MediLink only →  0
shared migrations byte-identical  →  146 of 146   (cmp, not eyeballed)
```

So HAMS had already absorbed MediLink's 25-migration lead (contract §1.2) and MediLink needed a
pure fast-forward. No merge, no conflict, no reconciliation.

**Nothing was rewritten.** Every file below was copied with `cp -p` and then `cmp`-verified
byte-identical against its HAMS original. No SQL was authored in this repo. No RPC was
re-implemented. No queue calculation exists anywhere in MediLink code.

---

## 2. Files migrated from HAMS

| File | Bytes identical | Notes |
|---|---|---|
| `backend/src/app/api/patients/me/queue-status/route.ts` | ✅ | Copied verbatim, including the `(supabase as any).rpc` cast and its explanatory comment |
| `backend/src/app/api/patients/me/queue-status/acknowledge/route.ts` | ✅ | Copied verbatim |
| `docs/QUEUE_BACKEND_FOR_MEDILINK.md` | ✅ | The contract itself, so both repos carry it |

The two routes import `createApiSupabaseClient`, `getAal2UserOrThrow` and `logAudit`. All three
already existed in MediLink at the same paths with compatible signatures — `logAudit` is
byte-identical to HAMS's, and `getAal2UserOrThrow` has identical patient-exempt semantics. This is
why the routes compile unmodified: the only difference between the repos is the `Database` type
import path, which these files never touch.

**Deliberately NOT copied:** HAMS's staff-side queue files (`facilities/[id]/queue/*`,
`queue-items/[id]/call`, `src/lib/auth/facilityAccess.ts`). Those are staff authority and contain
other patients' PHI — contract §6 assigns them to HAMS, and MediLink is patient-only.

---

## 3. Migrations copied

All 5, with original filenames and timestamps preserved. No squash, no regeneration, no renumbering.
They sort after MediLink's previous last migration (`20260726000000_invoice_recovery`), so
chronological order is intact and no existing object is touched out of sequence.

| Migration | What it does |
|---|---|
| `20260728000001_enable_realtime_queue_items.sql` | `queue_items` → `supabase_realtime`, `REPLICA IDENTITY FULL`, `realtime_published_tables()` helper |
| `20260728000002_queue_patient_rls.sql` | Patient SELECT policy, drops the orphaned unscoped `queue_items_staff_only`, technician read policy, `_owns_appointment` drift recovery, `ix_queue_items_appointment_id` |
| `20260728000003_queue_acknowledgement_columns.sql` | `acknowledged_at`, `acknowledged_kind` + 2 CHECK constraints |
| `20260728000004_get_my_queue_position_rpc.sql` | `get_my_queue_position()` |
| `20260728000005_acknowledge_queue_call_rpc.sql` | `acknowledge_queue_call()` |

**✅ APPLIED AND VERIFIED LIVE (2026-07-28).** Contract §1.3/§3.1 and §4 are now **out of date** —
they were written before HAMS commit `a868192 "feat(queue): apply shared queue backend migrations"`,
which applied them and regenerated types.

Confirmed empirically, not taken on trust (a recorded migration version does not prove the SQL ran):

```
supabase db push --include-all   →  "Remote database is up to date"  (nothing pending)
supabase migration list          →  all 5 present as BOTH local and remote
supabase gen types --linked      →  get_my_queue_position     FOUND
                                    acknowledge_queue_call     FOUND
                                    realtime_published_tables  FOUND
                                    acknowledged_at / _kind    FOUND
```

Security clauses verified live as `anon` (see §8) — the `REVOKE` statements really executed.

**Conflict check against MediLink's newer migrations:** none. No MediLink migration after
`20260422103305` touches `queue_items` policies, and `20260713000001` (`checkin_my_appointment`)
only *depends on* `_owns_appointment`, which `…0002` creates only when absent. Compatible.

---

## 4. APIs reused (not rebuilt)

| Surface | Origin | MediLink usage |
|---|---|---|
| `GET /api/patients/me/queue-status` | HAMS route, copied | The **only** queue read. Called by `queueRepo.getStatus()` |
| `POST /api/patients/me/queue-status/acknowledge` | HAMS route, copied | Called by `queueRepo.acknowledge()` |
| `get_my_queue_position()` | HAMS RPC | Never called directly from MediLink — only through the route above |
| `acknowledge_queue_call()` | HAMS RPC | Never called directly — only through the route above |
| `checkin_my_appointment()` | Pre-existing, already wired | Check-in unchanged; **no new check-in logic was written** |
| `queue_items` realtime | HAMS migration `…0001` + RLS `…0002` | Subscribed via `api.queue.subscribeToMyQueue`, invalidation-only |
| `sendPushToUser` / device_tokens | Pre-existing MediLink | Ready for HAMS's `→ called` push; MediLink added only tap-routing |

---

## 5. Mobile screens completed

Flow: **Upcoming Appointment → Check In → Live Queue → Doctor Calling → Consultation → Completed**

| Layer | File | Status |
|---|---|---|
| Shared types + realtime helper | `shared/src/api/queue.ts` | ✅ new — types mirror the contract 1:1; contains no logic |
| Domain model | `mobile/src/data/types.ts` | ✅ `QueueStatus`, `QueuePhase`, `QueueUnavailableError` |
| Repository interface | `mobile/src/data/repositories.ts` | ✅ `QueueRepository` + `queue` on `Repositories` |
| Mock source | `mobile/src/data/mock/index.ts` | ✅ time-driven simulation (line advances → called → done) so every state is reviewable with no backend |
| Real source | `mobile/src/data/real/index.ts` | ✅ transport adapter + contract error-code mapping |
| Hybrid wiring | `mobile/src/data/index.ts` | ✅ `queue: real` |
| Hooks | `mobile/src/hooks/queries/useQueue.ts` | ✅ adaptive polling, realtime invalidation, non-optimistic acknowledge |
| **Live Queue screen** | `mobile/app/(app)/appointments/[id]/queue.tsx` | ✅ waiting / called / done / 5 unavailable states |
| Components | `QueuePositionRing`, `QueueTimeline` | ✅ new |
| Entry points | appointment detail, appointments list, dashboard hero | ✅ check-in now lands on the queue; checked-in appointments show "View live queue" |
| Push routing | `mobile/src/utils/notifications.ts` | ✅ new `queue` kind → `/appointments/{id}/queue` |
| i18n | `en.ts` + `ar.ts` | ✅ ~60 keys each; adopted the 5 previously-orphaned check-in/queue keys |

**Screen behaviour**

- Displays all 12 required fields: position, people ahead, estimated wait, doctor status,
  appointment time, queue status, check-in status, server time (as the freshness stamp), doctor
  name, clinic name, status timeline, now-serving.
- **Position ring shows `people_ahead`, not `position`** — `position` is a facility-wide sequence
  shared across parallel doctors, so it is not a place in line. It is still shown, as "Your number".
- Realtime is invalidation-only; every event re-calls the endpoint. Subscribes only while
  foregrounded and not terminal; refetches on foreground to cover suspended-socket gaps.
- Polling floor: 10 s (≤2 ahead or called) / 30 s / 60 s, stopping at `done`, never in background.
- Acknowledgement is **not** optimistic — the UI reflects it only after the backend confirms.
- Error states are distinct per contract code: `not_checked_in` offers check-in, `not_in_queue`
  explains, `forbidden`/`unauthorized` stays generic (never reveals existence), `offline` and
  `server_error` offer retry. Non-retryable reasons don't retry.
- Honesty affordances: last-updated stamp, connection dot, no ticking ETA while stale.
- Pull-to-refresh, skeleton loading, dark mode, Arabic RTL, VoiceOver labels + a call announcement,
  and a `Vibration` cue (deliberately not `expo-haptics` — that would add a native dep + rebuild).

---

## 6. Remaining MediLink work

| # | Item | Blocker? | Notes |
|---|---|---|---|
| 1 | ~~Regenerate `shared/src/types/supabase.ts`~~ | — | **✅ DONE.** Regenerated against the applied schema. This also fixed a pre-existing defect: the working copy was a stale **UTF-16LE** file from a prior PowerShell `>` redirect, generated *before* the queue migrations, so it contained no queue types. Now clean UTF-8, 351 tables+functions, queue objects present, and all 4 workspaces typecheck. Backup: `scratchpad/supabase.ts.prev-utf16.bak`. |
| 2 | On-device verification of the queue screen with a real checked-in appointment | **Yes** | Still not possible here — needs a seeded patient session and, for the called/done states, a staff action that no surface can perform yet (§7.4). No iOS hardware (pre-existing, tracker §Overall). |
| 3 | Drop the `(supabase as any).rpc(...)` casts in the two routes | No | Now *technically* unblocked (the RPCs are in the generated types). **Deliberately NOT done** — contract §3.2 assigns this to HAMS, and editing MediLink's copies first would diverge two byte-identical files. Should land in HAMS, then be re-copied. |
| 4 | Live Activity / lock-screen queue position | No | Future enhancement; needs a native module. |
| 5 | Leave-and-return + travel-time nudge | No | Product-side; would need HAMS columns that don't exist. |

---

## 7. Remaining HAMS work

Straight from contract §3, with the MediLink impact spelled out.

| # | HAMS item | Impact on MediLink |
|---|---|---|
| 1 | ~~Apply the 5 migrations~~ | **✅ RESOLVED** — applied and verified live (§3). No longer a blocker. |
| 2 | ~~Regenerate types~~ | ✅ Done on both sides. |
| 3 | **Notification on `→ called`** (trigger + Edge Function) | **BLOCKING for the core value.** Without it a backgrounded patient is never told they've been called — the one moment that matters happens with the phone in a pocket. MediLink's push pipeline and deep-link routing are already in place and waiting for the payload. |
| 4 | Staff ops: `call_next`, `skip`, `recall`, `pause`/`resume`, `mark_no_show`, priority | **BLOCKING for progression — now the single biggest blocker.** Nothing writes `status='called'` or `'done'`, so a queue item enters `waiting` and stays there. The Live Queue screen's called/done states are unreachable in production until a staff surface exists. |
| 5 | `called_by_staff_id` never written | Audit trail only. |
| 6 | End-of-day cleanup cron | `position` grows unbounded across days with no date scope. Cosmetic for patients (we show `people_ahead`), untidy for staff. |
| 7 | `serving_started_at` | `called` and "in consultation" are indistinguishable; the screen therefore merges them. |
| 8 | Queue analytics | Not consumed. |
| 9 | `needs_queue_sync` retry job | Flag is set on failure and never read. |
| 10 | `isStaff()` omits `'staff'` | Pre-existing, out of queue scope. |
| 11 | 119 pre-existing type errors in HAMS | HAMS-side only; MediLink typechecks clean. |

---

## 8. Verification performed

| Check | Result |
|---|---|
| Migration filename diff | ✅ 5 in HAMS only, 0 in MediLink only |
| 146 shared migrations byte-identical | ✅ verified with `cmp` |
| 5 copied migrations byte-identical | ✅ |
| 2 copied routes byte-identical | ✅ |
| `npm run typecheck` (all 4 workspaces) | ✅ shared, backend, frontend, mobile — 0 errors |
| `npm run build:backend` | ✅ both queue routes emitted (`/api/patients/me/queue-status`, `…/acknowledge`) |
| `npm run build:frontend` | ✅ |
| `cd mobile && npm run lint` | ✅ 0 problems |
| `lint` (backend/frontend) | ⚠️ fails **pre-existing and environmental** — `next lint` is deprecated and those workspaces have no ESLint config, so it drops into an interactive prompt and exits 1 headless. Verified identical with the queue routes removed. |
| `npm run build:shared` | ⚠️ pre-existing broken root script — `shared` has only a `typecheck` script; it's consumed as TS source. Unrelated to queue. |
| Duplicate RPC definitions | ✅ exactly 1 each, in the copied migrations |
| Duplicate endpoints | ✅ exactly 2 queue routes in `src/` |
| Client-side queue arithmetic | ✅ none in `shared/` or the real data source. The only multiplication lives in the **mock** simulation, which is a fake data source, not a second implementation. |
| Direct RPC calls from client tiers | ✅ none — the RPC names appear only in doc comments |
| **Migration SQL executed** | ✅ **applied and present on the remote** (§3) |
| **Live security probe (as `anon`)** | ✅ see table below |
| **Copied routes live (as unauthenticated)** | ✅ see table below |
| Runtime verification with a patient session | ❌ still blocked — no seeded patient credentials; called/done states additionally blocked on §7.4 |

### Live probes run 2026-07-28

Read-only, against the linked project / a local `dev:backend`. These verify the migrations' security
clauses actually executed — existence alone would not.

| Probe | Result | Meaning |
|---|---|---|
| `rpc/get_my_queue_position` as `anon` | `401` `42501 permission denied` | `REVOKE ... FROM PUBLIC, anon` in `…0004` is live |
| `rpc/acknowledge_queue_call` as `anon` | `401` `42501 permission denied` | same for `…0005` |
| `rpc/realtime_published_tables` as `anon` | `401` `42501 permission denied` | granted to `authenticated`/`service_role` only, as written |
| `GET queue_items?select=id` as `anon` | `200 []` | **no rows leak** to an unauthenticated caller — `queue_items_patient_read` requires `auth.uid()` via `_owns_appointment` |
| `GET /api/patients/me/queue-status` (no auth) | `401 {"success":false,"error":{"code":"unauthorized",…}}` | route live, exact contract envelope |
| same, `?appointment_id=not-a-uuid` | `401` (not `400`) | auth is checked **before** validation — correct, non-probeable ordering |
| `POST …/acknowledge` (no auth) | `401` same envelope | route live |
| `POST …/acknowledge` (`kind:"teleport"`) | `401` (not `400`) | same ordering |

**Not yet verified** (needs two real patient sessions): the cross-tenant gate from contract §4 —
Patient A requesting Patient B's appointment must return `{"found": false, "reason": "forbidden"}`.
The `anon` results above are consistent with it but do not substitute for it.

---

## 9. Production readiness

**MediLink client code: ~97%** — code-complete against the contract, types in sync, routes verified
live. The residual is on-device verification with a real patient session.

**Queue feature end-to-end: ~70%** (was ~55% before the migrations landed) — patient half built and
wired to a live backend; the staff half that drives every transition still does not exist.

## 10. Is Queue Management fully complete for MediLink?

# NO

Two blockers remain, both HAMS-owned. The database blocker is gone.

1. **No staff surface writes queue transitions.** (contract §3.6.) `call_next`, `skip`, `recall`,
   `pause`/`resume` and `mark_no_show` are all unbuilt, so nothing sets `status='called'` or
   `'done'`. In production a patient would check in and sit at "waiting" indefinitely; the Called
   and Completed states are unreachable. **This is now the single blocker that decides whether the
   feature delivers value at all** — no amount of client work substitutes for it.
2. **No push on `→ called`.** (contract §3.3.) The decisive moment reaches a backgrounded patient
   only by push, and that trigger/Edge Function is unbuilt. MediLink's dispatcher, `device_tokens`,
   opt-in check and deep-link routing are all ready and idle.

Plus one joint verification gap, no longer a code blocker:

3. **No end-to-end run with a real patient session.** The `anon` and unauthenticated probes in §8
   pass, but the authenticated happy path and the cross-tenant gate from contract §4 have not been
   executed by either repo. Needs seeded patient credentials; the called/done half additionally
   needs blocker 1.

**Resolved since the first report:** the 5 migrations are applied and verified live; types are
regenerated on both sides; the RPCs' `REVOKE`/RLS clauses are confirmed enforcing.

---

## Appendix — no backend change was made or needed

Every backend artefact in MediLink is a byte-identical copy of a HAMS original. Nothing was
redesigned, rewritten, renamed or extended. Specifically **not** done, despite being proposed in the
now-superseded §8 of `QUEUE_MANAGEMENT_AUDIT_AND_PLAN.md`: no `queue_state` table, no
`get_my_queue_status` RPC, no priority/queue_date/sequence columns, no staff RPCs, no sweeper cron,
no MediLink-authored SQL of any kind.

One divergence risk to watch: the two route files now exist in both repos. If HAMS edits its copies,
MediLink's must be re-copied. They are thin (no SQL by design), so drift is unlikely to be
behavioural — but the `cmp` check in §8 should be re-run whenever HAMS touches the queue routes.
