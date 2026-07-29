# Supabase Migration Audit

**Date:** 2026-07-13
**Remote project:** `zojrwuvxrkmgnlwyuypg` — "Appointment for Healthcare" (region `ap-south-1`, Postgres 17.6)
**Local migrations dir:** `Medilink/supabase/migrations`
**CLI:** supabase 2.109.1

---

## 1. Executive summary

**The repository already contains every migration that exists in the remote database. No migration is missing locally, so no recovery was required.**

`supabase migration list --linked` reported **130 distinct versions** (union of local files and remote history):

| Category | Count |
| --- | --- |
| Synced (local file **and** applied on remote) | 124 |
| **Remote-only (applied remotely, missing locally)** | **0** |
| Local-only (file present, not yet applied on remote / pending) | 6 |

- Local `.sql` files on disk: **130**
- Remote history rows (`supabase_migrations.schema_migrations`): **124**
- Every one of the 124 remote history entries has a matching local file. ✅

No files were created, no migration files were edited, and the remote schema was not touched.

---

## 2. Audit details

### Remote-only migrations (the audit's primary concern)
**None.** Zero migrations exist in the remote database without a corresponding local file. The core objective — "ensure the repository contains every migration that exists in the remote database" — is already satisfied.

### Local-only (pending) migrations — 6
These files exist locally and are valid, but are **not** recorded in the remote history (i.e. never applied/pushed to production):

| Version | File | Lines |
| --- | --- | --- |
| 20260622000001 | `20260622000001_fix_profiles_privileged_column_guard.sql` | 125 |
| 20260630000001 | `20260630000001_fix_payments_patient_read_rls.sql` | 19 |
| 20260701000001 | `20260701000001_announcement_reads.sql` | 33 |
| 20260701000002 | `20260701000002_specialties.sql` | 49 |
| 20260701000003 | `20260701000003_lab_results_analytes.sql` | 81 |
| 20260701000004 | `20260701000004_fix_lab_status_trigger_cast.sql` | 16 |

These are normal **un-deployed local development work**, not corrupted or missing history. They are not something this audit should "fix," because applying them changes the production schema (out of scope) and falsely marking them applied would cause schema drift (unsafe).

### Ordering / timestamp integrity
- All timestamps are unique and monotonically ordered; the CLI parsed every filename's `<timestamp>_name.sql` prefix correctly.
- **Out-of-order note:** the last migration applied on remote is `20260702000000`, which is *newer* than the 6 pending migrations (`20260622…`–`20260701…`). So a later migration was pushed while six earlier-timestamped ones were skipped. This does not corrupt history, but it affects `db push` (see §4).

### Duplicates / diverged history
- No checksum or history divergence. No version appears twice in remote history.
- Several files share a base name across different timestamps (e.g. `…fix_create_doctor_record_rpc_permissions`, `…fix_actor_role_enum_in_onboarding_rpcs`, `…revenue_report` / `_2`). Each has a **distinct** timestamp/version and is individually recorded on remote — these are iterative re-fixes, which is normal and not a conflict.
- Cosmetic filename oddities exist and are harmless (already applied & synced; do **not** rename): double underscores (`__fix_grants`), `.sql.sql` (`f20_functions.sql.sql`), trailing double-dot (`fix_invite_type_enum_technician..sql`), a `%` (`…_100%.sql`), and mixed case (`_RLS`, `Reset_…`). The CLI matched all of them.

---

## 3. Actions taken

1. Confirmed CLI auth and that the correct project (`zojrwuvxrkmgnlwyuypg`) is linked (`supabase projects list` → `linked: true`).
2. Discovered the `supabase link` had been run from the **repo root**, creating a stray `./supabase/` (only a `.temp` cache) — but the actual project lives in `Medilink/supabase/`. Propagated the link cache into `Medilink/supabase/.temp/` so CLI commands resolve the link from the real project dir. *(This dir is gitignored — not committed.)*
3. Ran `supabase migration list --linked` from `Medilink/` and compared local vs remote programmatically.
4. Verified all 6 pending files exist, are non-empty, and that **no tracked migration file was modified** (`git status` clean for `Medilink/supabase/migrations`).

**No recovery workflow (`db pull` / `migration repair`) was needed or run**, because nothing is missing locally.

---

## 4. Remaining risks & decisions for the team

1. **Two `supabase/` directories.** `Medilink/supabase/` is the real project (config + migrations). The root `./supabase/` is a stray artifact from linking in the wrong directory; it holds only a `.temp` cache and is untracked. **Recommendation:** delete `./supabase/`, and always run Supabase CLI commands from `Medilink/`. (Left in place — not removed automatically since it was created outside this task.)

2. **6 pending migrations + out-of-order guard.** A future `supabase db push` will detect these 6 local migrations sit *before* the already-applied `20260702000000` and will refuse unless run with `--include-all`. That command **applies schema changes to production** and is therefore a deliberate deploy decision, explicitly out of scope here. Do **not** resolve it with `migration repair --status applied` — that would record them as applied without running them, causing real schema drift.

3. **Link state is per-machine.** `.temp/` is gitignored, so each developer/CI must run `supabase link --project-ref zojrwuvxrkmgnlwyuypg` from `Medilink/` themselves. This is expected Supabase behavior.

---

## 5. Validation

- ✅ Local history is a **strict superset** of remote history — every remote version has a local file.
- ✅ Migration order is correct; no version skipped in the sense of a remote entry lacking a local file.
- ✅ No checksum/history inconsistencies; no diverged or duplicated history.
- ✅ `supabase migration list` works and returns cleanly.
- ✅ Future `db pull` has nothing to reconcile (no orphan remote entries).
- ⚠️ Future `db push` works but needs `--include-all` for the 6 pending migrations (a deploy decision, not a history fix).

**Conclusion:** Local and remote *migration histories are synchronized* with respect to the audit's objective — the repo can fully recreate the remote database's migration history. The only outstanding item is un-deployed local work, which is a deployment choice, not a missing-migration problem.
