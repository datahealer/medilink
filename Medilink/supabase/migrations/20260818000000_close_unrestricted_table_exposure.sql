-- =============================================================================
-- Close anon exposure on tables that have no RLS
-- =============================================================================
-- ⚠️ NOT APPLIED. Prepared for review.
--
-- CLOSES A CONFIRMED, LIVE, UNAUTHENTICATED DATA EXPOSURE.
--
-- Verified against production on 2026-08-18 using the PUBLIC anon key (the one committed in
-- mobile/eas.json) and HEAD requests with `Prefer: count=exact`, so only row COUNTS were
-- retrieved and no row data was ever read:
--
--     table                       rows visible to anon
--     _bk_omani_profiles          270
--     _bk_omani_doctors           112
--     _bk_omani_invitations       111
--     invitations                 111
--     _bk_omani_facilities         52
--     _bk_omani_technicians        27
--     technicians                  27
--     _bk_omani_counts             13
--     _bk_omani_fp                  5
--     _bk_omani_facility_staff      3
--     facility_admin_invites        0
--     user_notifications            0
--
-- CONTROL EXPERIMENT (same key, same method) proving the numbers mean what they appear to:
-- `appointments`, `payments`, `profiles`, `patient_profiles`, `prescriptions`,
-- `patient_documents`, `family_members`, `lab_results`, `in_app_notifications`, `refunds`
-- and `device_tokens` all returned **0 rows** to anon. Their RLS works. The tables above
-- returned their FULL contents, so RLS is not filtering them at all.
--
-- ── THE SYSTEMIC ROOT CAUSE ──
--
-- No migration ever granted anon anything on these tables. The privilege comes from
-- Supabase's project bootstrap, `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
-- authenticated` — a fact already documented in 20260801000002 and 20260802000002.
--
-- The consequence is worth stating plainly, because it generalises beyond this migration:
-- **in this project RLS is the ONLY thing protecting any table.** A table created without
-- `ENABLE ROW LEVEL SECURITY` is world-readable through PostgREST the moment it exists. Every
-- finding here is one instance of that single defect.
--
-- ── WHY THIS MIGRATION DOES NOT SIMPLY ENABLE RLS EVERYWHERE ──
--
-- Because that would break HAMS onboarding. `accept_doctor_invite` and
-- `accept_facility_admin_invite` (latest definitions in 20260410000008) are SECURITY
-- INVOKER, so they execute as the INVITEE — a user who is not yet a `super_admin` or a
-- `facility_admin`, and therefore matches NEITHER policy that 20260402152453 defined on
-- `invitations`. Enabling RLS on that table without first making those functions SECURITY
-- DEFINER (or adding an invitee-scoped policy) would make every invite unacceptable.
--
-- So this migration is deliberately split. It does the part that is provably safe, and it
-- stops short of the part that needs HAMS to make a call. Concretely: RLS is NOT enabled on
-- `invitations` or `technicians` anywhere below, and `authenticated` keeps its grant on both.
--
-- ── IDEMPOTENCE AND ENVIRONMENT PORTABILITY ──
--
-- Nine of the twelve tables (`_bk_omani_*` ×8 and `facility_admin_invites`) are created by NO
-- migration in this repository — they exist only in the live project, added out of band. Three
-- environments must therefore all work:
--
--     production          the nine tables exist        -> remediate them
--     a fresh database    they were never created      -> skip, do not fail
--     a future database   HAMS has dropped the backups -> skip, do not fail
--
-- `REVOKE` and `COMMENT ON TABLE` have no `IF EXISTS` form in PostgreSQL, so an unguarded
-- statement would abort the whole migration — and would keep aborting it forever once the
-- snapshots are dropped, which is the very cleanup this file recommends. Every statement
-- touching those nine tables is therefore inside a `to_regclass` guard. Tables that ARE
-- created by earlier migrations (`invitations` 20260402145418, `technicians` 20260319071603,
-- `user_notifications` 20260416055617) are guaranteed present and need no guard.
-- =============================================================================


-- =============================================================================
-- PART 1 — THE OUT-OF-BAND OMANI/ARABIC-NAME SNAPSHOTS
-- =============================================================================
-- Not created by any migration, absent from docs/reference/full_schema.sql, and the string
-- `_bk_` appears NOWHERE in this repository. Their column shape (`id`, `full_name`,
-- `full_name_ar`) matches exactly what 20260716000001/20260716000002 backfilled, so they are
-- almost certainly pre-backfill rollback snapshots taken by hand. That is an inference, not a
-- documented fact — see the HAMS note at the bottom.
--
-- Row counts match the live tables one-for-one (doctors 112/112, facilities 52/52,
-- technicians 27/27), i.e. these are copies of CURRENT production data, not stale test rows.
--
-- `authenticated` is revoked here as well as `anon`, unlike the live HAMS tables in PART 2,
-- because nothing — client, server, RPC, trigger or view — reads these. service_role is
-- untouched, so HAMS keeps full access and any rollback they were kept for still works.
--
-- RLS is enabled with NO policies as defence in depth: with RLS on and no policy, every
-- non-superuser role is denied even if a future `GRANT ALL ON ALL TABLES IN SCHEMA public`
-- (exactly how this exposure arose) hands the grant back.
DO $$
DECLARE
  v_tbl  TEXT;
  v_done INT := 0;
  v_skip INT := 0;
  v_snapshots TEXT[] := ARRAY[
    '_bk_omani_counts',
    '_bk_omani_doctors',
    '_bk_omani_facilities',
    '_bk_omani_facility_staff',
    '_bk_omani_fp',
    '_bk_omani_invitations',
    '_bk_omani_profiles',
    '_bk_omani_technicians'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_snapshots LOOP
    -- to_regclass returns NULL rather than raising, which is what makes this portable
    -- across "exists", "never existed" and "already dropped".
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      v_skip := v_skip + 1;
      RAISE NOTICE 'skip %: not present (expected on a fresh DB, or already dropped)', v_tbl;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);
    v_done := v_done + 1;
  END LOOP;

  -- Documented on the table itself so the next person to find it has the context that was
  -- missing this time. Guarded for the same reason as everything else in this block.
  IF to_regclass('public._bk_omani_profiles') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON TABLE public._bk_omani_profiles IS
        'Out-of-band snapshot (id, full_name, full_name_ar), origin undocumented; shape matches '
        'the 20260716000002 Arabic-name backfill. Locked down by 20260818000000 after it was '
        'found readable by anon: 270 rows of real names. NOT deleted — pending HAMS confirmation '
        'that it is no longer needed for rollback. service_role retains access.'
    $c$;
  END IF;

  RAISE NOTICE 'snapshots: % remediated, % skipped (absent)', v_done, v_skip;
END $$;


-- =============================================================================
-- PART 2 — LIVE HAMS TABLES: REVOKE anon ONLY
-- =============================================================================
-- These three are real, in-use tables. Only `anon` is revoked, and RLS is deliberately NOT
-- enabled, because the exposure being closed is the ANONYMOUS one: the reader needs nothing
-- but the public anon key, which ships in the mobile bundle and is in git.
--
-- Revoking anon is safe because no anonymous flow touches them. Verified by searching the
-- whole repository: guest mode reads only `doctors`, `facilities`, `specialties`, `reviews`,
-- `doctor_availability`, `facility_photos`, `branches`, `announcements` and `system_config` —
-- each DELIBERATELY granted to anon by an earlier migration with an explicit `USING (true)`
-- public-read policy. None of the tables below appears in any client, backend route or Edge
-- Function.
--
-- Keeping `authenticated` is not an oversight, it is the requirement that makes this safe to
-- deploy without a HAMS code change. See the residual-risk note at the bottom.

-- `invitations` (111 rows; 30 pending, 0 unexpired) exposed invitee email, role and
-- facility_id to the internet. It also has a `token` column, which is why this looked like an
-- account-takeover path at first glance — but a count-only check showed `token` is NULL in all
-- 111 rows while `token_hash` is populated in all 111, and `set-password` verifies by hashing
-- the token the caller supplies. So the real exposure is PII and organisational structure, not
-- a redeemable credential. Serious, but not critical.
--
-- authenticated NOT revoked: `invite_doctor`, `invite_facility_admin`, `accept_doctor_invite`
-- and `accept_facility_admin_invite` are all SECURITY INVOKER and read this table as the
-- calling user. Revoking it, or enabling RLS, breaks HAMS onboarding.
REVOKE ALL ON public.invitations FROM anon;

-- `technicians` (27 rows) exposed staff full_name, email, phone and license_number.
--
-- authenticated NOT revoked: backend/src/app/api/patients/[id]/medical-history/pdf/route.ts
-- reads it through the CALLER's client
-- (`authSupabase.from("technicians").select("facility_id").eq("user_id", user.id)`), so the
-- medical-history PDF depends on this grant.
--
-- Note that four correct policies already exist from 20260319071603
-- (`technicians_select_own`, `_update_own`, `_facility_admin`, `_same_facility_read`) — but
-- production proves RLS is not active, since anon read all 27 rows, which those policies
-- forbid. Turning RLS on is the right end state and is left for HAMS; see the bottom.
REVOKE ALL ON public.technicians FROM anon;

-- `facility_admin_invites` (0 rows) is created by no migration and referenced only by the
-- generated types — it exists in the database but not in this repository's schema. Empty
-- today, so revoking anon costs nothing and stops it becoming an exposure the moment HAMS
-- starts using it. Guarded, because a fresh database will not have it.
DO $$
BEGIN
  IF to_regclass('public.facility_admin_invites') IS NULL THEN
    RAISE NOTICE 'skip facility_admin_invites: not present (expected on a fresh DB)';
  ELSE
    -- EXECUTE format(), not a bare REVOKE, for the same reason the snapshot block above uses
    -- it: plpgsql does accept utility statements directly, but routing every guarded DCL
    -- through EXECUTE keeps one pattern in this file and removes any question about how
    -- plpgsql parses a role name in a REVOKE.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', 'facility_admin_invites');
  END IF;
END $$;


-- =============================================================================
-- PART 3 — user_notifications: RLS + OWN-ROW READ
-- =============================================================================
-- Created by 20260416055617 (`-- ✅ NEW NOTIFICATIONS TABLE (DO NOT TOUCH OLD ONE)`) and never
-- given RLS — the only table in the entire migration history created without it.
--
-- It is orphaned: 0 rows, referenced by no client, route, RPC, trigger or view, and MediLink
-- delivers notifications through `in_app_notifications` instead (20260801000001). Empty and
-- unused, so there is nothing to break — but its columns (`user_id`, `title`, `message`) mean
-- that the moment anything writes to it, that content becomes public. This closes the trap
-- rather than waiting for it to spring.
--
-- No guard needed: 20260416055617 creates this table, so it is present in every environment.
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_own_read ON public.user_notifications;
CREATE POLICY user_notifications_own_read
ON public.user_notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy: nothing writes here today, and a notification is something
-- the system sends TO a user, never something a user creates. `authenticated` retains its
-- bootstrap write privileges, but with RLS on and no write policy every write is denied — and
-- if HAMS later writes here it will use service_role, which bypasses RLS.
REVOKE ALL ON public.user_notifications FROM anon;
GRANT SELECT ON public.user_notifications TO authenticated;

COMMENT ON TABLE public.user_notifications IS
  'Per-user notifications. Created by 20260416055617 with no RLS; secured by 20260818000000. '
  'Currently EMPTY and referenced by no application code — MediLink uses in_app_notifications. '
  'Retained rather than dropped pending HAMS confirmation.';


-- =============================================================================
-- DELIBERATELY NOT TOUCHED
-- =============================================================================
--
-- spatial_ref_sys (8,500 rows, anon-readable)
--   PostGIS extension table holding the public EPSG coordinate-system registry. It contains no
--   project data of any kind — the same 8,500 rows ship with every PostGIS install on earth.
--   It is owned by the extension, not by us: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on it
--   typically fails with "must be owner of table", and forcing it risks breaking
--   `get_nearby_branches` / `nearby_facilities` and every distance calculation in clinic
--   discovery. Supabase's own advisor documents this table as an expected exception.
--   NOT a finding. Leave it exactly as it is.
--
-- Guest-mode tables (doctors, facilities, specialties, reviews, doctor_availability,
-- facility_photos, branches, announcements, system_config)
--   Each has a deliberate anon GRANT and an explicit `USING (true)` public-read policy from an
--   earlier migration. Not referenced anywhere in this file.
--
-- Patient-facing tables (appointments, payments, profiles, patient_profiles, prescriptions,
-- patient_documents, family_members, lab_results, in_app_notifications, refunds, device_tokens)
--   RLS already correct and verified working. Not referenced anywhere in this file.
--
-- RLS on invitations and technicians
--   Not enabled here. Only anon is revoked. See below.
--
-- Nothing is deleted, truncated, renamed, or altered in content by this migration. No data
-- changes. Only privileges, RLS flags, one policy, and two comments.


-- =============================================================================
-- REQUIRES HAMS APPROVAL (NOT in this migration)
-- =============================================================================
--
-- 1. RLS on `invitations`. Blocked by the SECURITY INVOKER problem described at the top:
--    `accept_doctor_invite` / `accept_facility_admin_invite` run as the invitee, who matches
--    neither `inv_super_admin` nor `inv_facility_admin`. The correct fix is to make those two
--    functions SECURITY DEFINER (they already validate the token hash themselves, so they do
--    not rely on RLS for safety) and THEN enable RLS. Both are HAMS-owned.
--
-- 2. RLS on `technicians`. Four correct policies exist from 20260319071603, but production
--    behaviour proves RLS is not active. Someone must determine whether it was disabled by
--    hand after that migration, and whether any HAMS flow now depends on unrestricted reads,
--    before turning it on.
--
-- 3. RESIDUAL EXPOSURE THIS MIGRATION DOES NOT CLOSE. Because RLS stays off on `invitations`
--    and `technicians` and `authenticated` keeps the bootstrap grant, ANY signed-in user can
--    still read all 111 invitation rows and all 27 technician rows. A MediLink patient is
--    `authenticated`, so that includes patients reading staff email, phone and licence
--    numbers. Closing it requires items 1 and 2. This migration closes the ANONYMOUS hole
--    only, which is the larger and more urgent one.
--
-- 4. Disposal of `_bk_omani_*`. If HAMS confirms the Arabic-name backfill will not be rolled
--    back, these eight tables should be dropped — a snapshot of production names with no owner
--    and no documentation is a liability. NOT dropped here, per instruction. The guards above
--    mean this migration keeps replaying cleanly after they are gone.
--
-- 5. The systemic fix. Consider `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON
--    TABLES FROM anon` so a new table is closed by default instead of open by default. This
--    affects the whole shared project and every HAMS deployment, so it is a joint decision —
--    but without it, the next table created without RLS reproduces this exact exposure.


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   -- user_notifications
--   DROP POLICY IF EXISTS user_notifications_own_read ON public.user_notifications;
--   ALTER TABLE public.user_notifications DISABLE ROW LEVEL SECURITY;
--
--   -- snapshots (guarded the same way, so it is safe to run anywhere)
--   DO $$
--   DECLARE t TEXT;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY['_bk_omani_counts','_bk_omani_doctors','_bk_omani_facilities',
--                              '_bk_omani_facility_staff','_bk_omani_fp','_bk_omani_invitations',
--                              '_bk_omani_profiles','_bk_omani_technicians'] LOOP
--       IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
--         EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--       END IF;
--     END LOOP;
--   END $$;
--
--   -- Restoring the anon grants REOPENS the exposure. Do this only to end an outage, and
--   -- record why:
--   GRANT SELECT ON public.invitations TO anon;
--   GRANT SELECT ON public.technicians TO anon;
-- =============================================================================
