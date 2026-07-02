# Reschedule Permission Error — Root Cause Investigation

**Error:** `POST /rest/v1/rpc/reschedule_appointment_atomic` → `403` · `{"code":"42501","message":"permission denied for function reschedule_appointment_atomic"}`
**Date:** 2026-07-02 · **Branch:** `satyam/web-dynamic`

---

## Root Cause

**Category D — the function exists but EXECUTE was never granted to the `authenticated` role.**

`reschedule_appointment_atomic` was introduced in the F-20 work and is defined in three migrations (stable signature), but **no migration in the entire history contains a `GRANT EXECUTE` for it** — nor for its sibling `cancel_appointment_safe`. Meanwhile `book_appointment_atomic` *did* get a dedicated grant migration ([`20260430000005_book_appointment_atomic_grant.sql`](../supabase/migrations/20260430000005_book_appointment_atomic_grant.sql)), which is exactly why **booking works but rescheduling 403s**.

This project uses an **explicit-grant model**: there is no `ALTER DEFAULT PRIVILEGES` and no blanket `GRANT EXECUTE ON ALL FUNCTIONS`. Every working patient RPC (`book_appointment_atomic`, `get_available_slots`, `claim_waitlist_appointment`, `rebook_appointment`, …) has its own `GRANT EXECUTE … TO authenticated`. The two F-20 "safe/atomic" functions were the only patient-facing appointment RPCs that shipped **without** their companion grant.

**Ruled out (with evidence):**
- **C — missing staging migration?** No. The error is `42501` (permission denied), not `42883`/`PGRST202` (undefined function). A live REST call confirms the function **exists** and fails on permission, not resolution. The grant was never in *any* repo migration, so it is not "staging missing a migration that the repo has."
- **A / B — wrong RPC?** No. Web → shared `api.appointments.rescheduleAppointment` → `db.rpc("reschedule_appointment_atomic", …)` is the correct, intended atomic RPC.
- **E — signature changed?** No. All three definitions use the identical signature `(UUID, UUID, DATE, TIME, TIME, BOOLEAN)`; the shared API sends exactly those six named params. A single overload exists.
- **F — role not allowed?** This is the *observable manifestation* of D: `authenticated` isn't allowed because the GRANT was omitted.

---

## Call Chain

```
Reschedule button (RescheduleModal “Confirm Reschedule”)
  frontend/src/app/dashboard/appointments/page.tsx  → confirm() → api.appointments.rescheduleAppointment(supabase, appt.id, {date,start,end})
        ↓
Shared API   shared/src/api/appointments.ts:75  rescheduleAppointment()
        ↓   getCurrentUserId(db)  then  db.rpc("reschedule_appointment_atomic", {p_id,p_user_id,p_new_date,p_new_start,p_new_end,p_skip_cutoff})
        ↓
Supabase PostgREST   POST /rest/v1/rpc/reschedule_appointment_atomic   (role: authenticated)
        ↓
Postgres function    public.reschedule_appointment_atomic(UUID,UUID,DATE,TIME,TIME,BOOLEAN)  ← 42501 here: EXECUTE denied BEFORE body runs
        ↓ (would have run, SECURITY INVOKER)
SQL body             UPDATE public.appointments …  (guarded by RLS appointments_patient_update)
```

The failing RPC is **introduced in the shared API** (`shared/src/api/appointments.ts`), which is correct — the defect is the **absent database grant**, not the call.

---

## Comparison: Mobile vs Web vs Shared API

| | Reschedule implementation | RPC called | Result |
|---|---|---|---|
| **Shared API** (`@medilink/shared`) | `rescheduleAppointment()` → `db.rpc("reschedule_appointment_atomic", …)` | `reschedule_appointment_atomic` | correct code; RPC ungranted |
| **Web** | `RescheduleModal` → shared API (params: date/start/end) | same shared RPC | **403 / 42501** |
| **Mobile** | **No reschedule implementation exists** — `grep -r reschedule mobile/src` = 0 hits; mobile imports `@medilink/shared` only for i18n + `Database` types, and calls **no** appointment RPCs. | — | n/a |

**Key differences:**
- Web and shared are consistent — same RPC, same params, no discrepancy. Both use the atomic function directly (there is no separate "secure wrapper" for reschedule; the atomic function *is* the SECURITY INVOKER wrapper, guarded by RLS).
- There is **no mobile reference implementation** for reschedule to compare against — the premise that "mobile already supports rescheduling" is not reflected in `mobile/src`. Web is the sole caller of this RPC. So this is **not a web-specific bug**; any client calling the shared API would hit the same missing grant.
- `cancel_appointment_safe` (called by `api.appointments.cancelAppointment`) has the **identical** missing-grant defect — it is the same latent bug and would 403 for `authenticated` for the same reason.

---

## Fix Applied

**No frontend or shared-code changes** — the application code is correct. The fix is a single additive, idempotent, security-preserving SQL migration.

**File added:** [`supabase/migrations/20260702000000_grant_reschedule_cancel_appointment_rpcs.sql`](../supabase/migrations/20260702000000_grant_reschedule_cancel_appointment_rpcs.sql)

```sql
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(UUID, UUID, DATE, TIME, TIME, BOOLEAN)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_safe(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated, service_role;
```

**Why this is correct and safe:**
- Mirrors the existing `book_appointment_atomic` grant (`20260430000005`) exactly — same roles (`authenticated, service_role`), same pattern.
- Signatures match the currently-deployed definitions (`20260501000003`).
- Both functions are **SECURITY INVOKER**. Granting EXECUTE only permits *invoking* the wrapper; the inner `UPDATE public.appointments` still runs as the caller and is constrained by RLS:
  ```sql
  -- appointments_patient_update (20260424053136)
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid())
         AND public.aal2_or_no_2fa())
  ```
  → a patient can only reschedule/cancel **their own** appointment. **RLS is not bypassed; ownership remains enforced.**
- `cancel_appointment_safe` is included because it is the identical omission, is called by the shared API's `cancelAppointment`, and Step 7 requires cancel to keep working. This is targeted (exactly the two ungranted patient wrappers), not a blanket grant — no excessive permissions.
- Grants are idempotent: if any environment already has them, re-running is a no-op.

---

## Verification

### Verified by execution (in this environment)
- ✅ **Error reproduced at the API layer:** live `POST /rest/v1/rpc/reschedule_appointment_atomic` returns `{"code":"42501","message":"permission denied for function reschedule_appointment_atomic"}` — confirming the function **exists** and the failure is EXECUTE permission (not a missing function/migration).
- ✅ **Migration record is conclusive:** `grep` across all migrations → `book_appointment_atomic` has an explicit `GRANT EXECUTE … TO authenticated`; `reschedule_appointment_atomic` and `cancel_appointment_safe` have **zero** grant statements.
- ✅ **Signature match:** shared API params (`p_id,p_user_id,p_new_date,p_new_start,p_new_end,p_skip_cutoff`) ↔ deployed `(UUID,UUID,DATE,TIME,TIME,BOOLEAN)`; grant targets the exact overload.
- ✅ **Ownership policy present:** `appointments_patient_update` RLS restricts updates to the caller's own `patient_id`.

### Not verifiable in this environment (requires action + a real session)
- ⚠️ The migration was **not applied to the live database** here: applying it modifies shared staging/prod infrastructure and requires DB credentials, which are out of scope for an unattended change. It must be applied via the normal pipeline:
  ```
  supabase db push          # or apply 20260702000000_… through your migration process
  ```
- ⚠️ After apply, run the authenticated end-to-end checks in a browser with a real patient session:
  - **Reschedule succeeds** (no 42501; appointment moves to the new slot; `previous_slot_*` recorded).
  - **Cancel still works** (same grant added).
  - **Booking still works** (unchanged — `book_appointment_atomic` already granted).
  - **Check-in still works** (uses a different, already-granted path — unaffected).
  - **Ownership enforced:** attempt to reschedule another patient's appointment id → blocked by RLS (0 rows / not-found), not by the grant.

### Regression scope
No application code changed, so booking/list/find-doctors/profile/records behavior is unaffected. The only change is two additive EXECUTE grants.

---

## Summary

| Question | Answer |
|---|---|
| Root cause | **D** — `reschedule_appointment_atomic` (and `cancel_appointment_safe`) exist but `authenticated` was never granted EXECUTE; `book_appointment_atomic` was, so booking works. |
| Is it a web bug? | No — shared API + params are correct; any client would fail. |
| Is it a missing migration on staging? | No — the grant was never authored in any repo migration; the function itself exists. |
| Fix | One additive migration granting EXECUTE on both functions to `authenticated, service_role` (mirrors `book_appointment_atomic`). |
| Security | Preserved — SECURITY INVOKER + `appointments_patient_update` RLS still enforce per-patient ownership. |
| Applied to live DB here? | No (shared infra / needs credentials) — documented apply + verify steps above. |

---

# Part 2 — Still 42501 after `migration repair` + `db push` (live investigation)

**Symptom:** after `supabase migration repair` then `supabase db push`, the CLI prints **"Remote database is up to date"** but the RPC still returns `42501`.

## What I verified against the LIVE database (evidence, not assumption)

| # | Check | Method (live) | Result |
|---|---|---|---|
| 1 | Is the CLI pointed at the same project as the web app? | `supabase/.temp/project-ref` vs `NEXT_PUBLIC_SUPABASE_URL` host | **Same** — both `zojrwuvxrkmgnlwyuypg`. → **Not** a wrong-project issue. |
| 2 | Is `20260702000000` recorded as applied on the remote DB? | `supabase migration list --linked` (live query to remote `schema_migrations`) | **Yes** — it appears in the **Remote** column. |
| 3 | Does the function exist? | live `POST /rest/v1/rpc/reschedule_appointment_atomic` | **Yes** — `42501` (permission denied), not `42883` (undefined). |
| 4 | Do the grants exist for `authenticated`? | needs `information_schema` / `pg_proc` | **Could not read here** — no DB password (CLI keeps it in the OS keyring), no `psql`/`pg`, and `db dump` needs Docker (unavailable). → SQL provided below for the SQL Editor. |

## Determination

**"Migration never executed" (its SQL did not run) → the EXECUTE grant is still missing.** Not a signature, project, function-name, or exotic-permission problem.

Why this is the only explanation consistent with the evidence:
- `20260702000000` **is** in the remote history (check 2), yet the grant is **not** in effect (`42501` persists). A migration cannot be "applied in history" **and** "its GRANT absent" **unless the row was inserted without running the file**.
- `supabase migration repair --status applied <version>` does exactly that: it **writes a row into `supabase_migrations.schema_migrations` to mark the version applied — it does NOT execute the migration file.** After that, `supabase db push` sees the version as applied and **skips it** → "Remote database is up to date" → the `GRANT` never runs.
- The alternatives are ruled out: if `db push` had actually executed the file, the grant would be present (no 42501). If the file had a **wrong signature**, execution would have **errored and aborted** the push (not "up to date", and the version would not be marked applied). Since it *is* marked applied and the grant is *absent*, the SQL was never executed.
- The GRANT signature `(uuid, uuid, date, time, time, boolean)` matches the last reschedule definition that *is* in remote history (`20260501000003`, also confirmed via `migration list`), so a signature mismatch is not the cause of the current failure.

> Root cause, precisely: **`supabase migration repair` marked `20260702000000` as applied without executing its SQL; `db push` then skipped it, so the grant was never created.**

## Fix — run this directly in the Supabase **SQL Editor**

This bypasses the migration-history problem entirely and is idempotent. Use the project **`zojrwuvxrkmgnlwyuypg`**.

### Step A — Diagnose (confirm signature + current grants)

```sql
-- A1. Exact deployed signature(s) of both functions (all overloads)
SELECT p.oid::regprocedure                         AS function_signature,
       pg_get_function_identity_arguments(p.oid)   AS identity_args,
       p.prosecdef                                 AS is_security_definer
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('reschedule_appointment_atomic','cancel_appointment_safe');

-- A2. Current EXECUTE grants (your query) — expect `authenticated` to be ABSENT before the fix
SELECT routine_name, grantee, privilege_type
FROM   information_schema.role_routine_grants
WHERE  routine_name IN ('reschedule_appointment_atomic','cancel_appointment_safe');

-- A3. How the history row got there — if `statements` is NULL/empty it was repaired, not executed
SELECT version, name, statements
FROM   supabase_migrations.schema_migrations
WHERE  version = '20260702000000';
```

### Step B — Fix (idempotent). Signature-agnostic form — grants whatever overloads actually exist, so it works even if A1 shows a different arg list:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname IN ('reschedule_appointment_atomic','cancel_appointment_safe')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
  END LOOP;
END $$;
```

Explicit form (equivalent, if A1 confirms the expected signature):

```sql
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(uuid, uuid, date, time, time, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_safe(uuid, uuid, text, boolean)                    TO authenticated, service_role;
```

### Step C — Re-run A2 to confirm `authenticated` now has `EXECUTE` on both, then retry reschedule in the app.

## Keeping the repo migration honest (optional, recommended)

The committed migration `20260702000000_grant_reschedule_cancel_appointment_rpcs.sql` contains the correct SQL — it simply never ran on remote. Two ways to reconcile:

- **Simplest:** run Step B in the SQL Editor now (done above). History already lists `20260702000000` as applied and the file matches the DB state, so nothing else is required.
- **Or make `db push` actually execute it** (instead of the SQL Editor):
  ```bash
  supabase migration repair --status reverted 20260702000000   # remove the false "applied" mark
  supabase db push                                             # now it runs the GRANT for real
  ```

## Security note (unchanged)
The grant does not weaken security: both functions are `SECURITY INVOKER` and the `appointments_patient_update` RLS policy still restricts updates to the caller's own `patient_id`. Ownership remains enforced.

