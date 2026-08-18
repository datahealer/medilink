-- Post-apply verification for 20260818000000_close_unrestricted_table_exposure.sql
-- =============================================================================
-- Run AFTER the migration. WRITES NOTHING — every statement inspects catalog metadata.
-- Each check RAISEs on failure, so a non-zero exit means the remediation did not take effect.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/unrestricted_tables_verification.sql
--   supabase db query --linked --file supabase/tests/unrestricted_tables_verification.sql
--
-- ── WHY has_table_privilege() AND NOT information_schema ──
--
-- The first draft of this file queried `information_schema.role_table_grants`, which by
-- definition only shows privileges "where the grantor or grantee is a CURRENTLY ENABLED role".
-- Run as `postgres`, `anon` may not be an enabled role, so the query can return zero rows
-- whether or not the grant exists — a verification script that passes because it looked in the
-- wrong place. `has_table_privilege(role, table, priv)` asks the privilege system directly and
-- has no enabled-role dependency, so it cannot fail that way.
--
-- ── WHY EVERY LOOKUP IS GUARDED BY to_regclass ──
--
-- `has_table_privilege()` RAISES on a table that does not exist. Nine of the twelve targets
-- (`_bk_omani_*` ×8, `facility_admin_invites`) are created by no migration, so they are absent
-- on a fresh database and will be absent again once HAMS drops the snapshots. Absent is a
-- VALID end state — more secure than present-and-locked — so those are skipped with a notice
-- rather than failing.
--
-- ── WHY EVERY "SHOULD EXIST" LOOKUP HAS AN EXPLICIT NULL CHECK ──
--
-- In plpgsql, `IF <null> THEN` is not an error, it is simply false. A `SELECT ... INTO` that
-- matches no row leaves its variables NULL, so a chain of `IF v_x <> 'expected'` checks all
-- evaluate to NULL and the block falls through to its success notice. The first draft of PART D
-- had exactly that hole: a policy under a different name would have been reported as passing.
-- Every value that must exist is now NULL-checked before it is compared.
--
-- PART G is a MANUAL step. Everything before it verifies intent; PART G verifies reality over
-- the same HTTP path the exposure actually used. Do not skip it.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — anon holds NO privilege on any remediated table
-- =============================================================================
-- The primary control. If this passes, the anonymous exposure is closed regardless of RLS.
-- All four DML privileges are checked, not just SELECT: the bootstrap granted ALL, so a
-- partial revoke would leave anon able to modify data it cannot read.
DO $$
DECLARE
  v_tbl   TEXT;
  v_priv  TEXT;
  v_bad   TEXT := '';
  v_held  TEXT;
  v_checked INT := 0;
  v_absent  INT := 0;
  v_targets TEXT[] := ARRAY[
    '_bk_omani_counts','_bk_omani_doctors','_bk_omani_facilities','_bk_omani_facility_staff',
    '_bk_omani_fp','_bk_omani_invitations','_bk_omani_profiles','_bk_omani_technicians',
    'invitations','technicians','facility_admin_invites','user_notifications'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_targets LOOP
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      v_absent := v_absent + 1;
      RAISE NOTICE 'A skip %: absent (valid end state — cannot be exposed)', v_tbl;
      CONTINUE;
    END IF;

    v_checked := v_checked + 1;
    v_held := '';
    FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege('anon', format('public.%I', v_tbl), v_priv) THEN
        v_held := v_held || v_priv || '/';
      END IF;
    END LOOP;

    IF v_held <> '' THEN
      v_bad := v_bad || format(' %s(%s)', v_tbl, rtrim(v_held, '/'));
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'A FAIL: anon still holds privileges on:%', v_bad;
  END IF;
  RAISE NOTICE 'PART A passed: anon holds no SELECT/INSERT/UPDATE/DELETE on % present table(s); % absent.',
    v_checked, v_absent;
END $$;

-- =============================================================================
-- PART B — RLS is ENABLED where the migration enables it
-- =============================================================================
-- Deliberately EXCLUDES invitations and technicians: this migration does not enable RLS on
-- them, and asserting that it did would fail on a correct deployment. PART F asserts the
-- opposite for those two.
DO $$
DECLARE
  v_tbl TEXT;
  v_bad TEXT := '';
  v_rls BOOLEAN;
  v_targets TEXT[] := ARRAY[
    '_bk_omani_counts','_bk_omani_doctors','_bk_omani_facilities','_bk_omani_facility_staff',
    '_bk_omani_fp','_bk_omani_invitations','_bk_omani_profiles','_bk_omani_technicians',
    'user_notifications'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_targets LOOP
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      RAISE NOTICE 'B skip %: absent', v_tbl;
      CONTINUE;
    END IF;

    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_tbl;

    -- Explicit NULL check: a NULL here would mean the catalog lookup failed, and
    -- `IF NOT NULL THEN` would silently fall through as a pass.
    IF v_rls IS NULL THEN
      v_bad := v_bad || ' ' || v_tbl || '(catalog lookup returned NULL)';
    ELSIF NOT v_rls THEN
      v_bad := v_bad || ' ' || v_tbl || '(RLS off)';
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'B FAIL: RLS not enabled on:%', v_bad;
  END IF;
  RAISE NOTICE 'PART B passed: RLS enabled on every present snapshot + user_notifications.';
END $$;

-- =============================================================================
-- PART C — the snapshots have NO policies (deny-all by design)
-- =============================================================================
-- With RLS on and no policy, only service_role (which bypasses RLS) can read them. A policy
-- appearing here later would be a regression. Works whether or not the tables exist.
DO $$
DECLARE v_cnt INT; v_names TEXT;
BEGIN
  SELECT count(*), coalesce(string_agg(tablename || '.' || policyname, ', '), '')
    INTO v_cnt, v_names
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE '\_bk\_omani\_%';

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'C FAIL: % policy/policies exist on _bk_omani_* (must be deny-all): %',
      v_cnt, v_names;
  END IF;
  RAISE NOTICE 'PART C passed: no policies on the snapshot tables.';
END $$;

-- =============================================================================
-- PART D — user_notifications has EXACTLY the expected own-row read policy
-- =============================================================================
-- Rewritten to close the false-pass hole described in the header: the named policy is now
-- proven to EXIST before any of its attributes are compared.
DO $$
DECLARE v_qual TEXT; v_cmd TEXT; v_roles TEXT; v_cnt INT; v_others TEXT;
BEGIN
  IF to_regclass('public.user_notifications') IS NULL THEN
    RAISE EXCEPTION 'D FAIL: user_notifications is absent, but 20260416055617 creates it';
  END IF;

  -- 1. The expected policy must exist. FOUND is checked explicitly so a missing row can
  --    never fall through as a pass.
  SELECT qual, cmd, roles::text
    INTO v_qual, v_cmd, v_roles
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'user_notifications'
     AND policyname = 'user_notifications_own_read';

  IF NOT FOUND OR v_cmd IS NULL THEN
    RAISE EXCEPTION 'D FAIL: policy user_notifications_own_read does not exist';
  END IF;

  -- 2. It must be shaped as intended.
  IF v_cmd <> 'SELECT' THEN
    RAISE EXCEPTION 'D FAIL: policy must be SELECT-only, is %', v_cmd;
  END IF;
  IF v_roles IS NULL OR v_roles NOT ILIKE '%authenticated%' THEN
    RAISE EXCEPTION 'D FAIL: policy must target authenticated, targets %', coalesce(v_roles, 'NULL');
  END IF;
  IF v_qual IS NULL OR v_qual NOT ILIKE '%auth.uid()%' OR v_qual NOT ILIKE '%user_id%' THEN
    RAISE EXCEPTION 'D FAIL: policy must scope to user_id = auth.uid(), is: %', coalesce(v_qual, 'NULL');
  END IF;

  -- 3. No OTHER policy may exist — in particular no write policy, since nothing writes here.
  SELECT count(*), coalesce(string_agg(policyname || '(' || cmd || ')', ', '), '')
    INTO v_cnt, v_others
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_notifications'
     AND policyname <> 'user_notifications_own_read';

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'D FAIL: unexpected additional policy/policies on user_notifications: %', v_others;
  END IF;

  RAISE NOTICE 'PART D passed: user_notifications restricted to the owning user, read-only.';
END $$;

-- =============================================================================
-- PART E — NOTHING WAS OVER-REVOKED (MediLink + HAMS still work)
-- =============================================================================
-- The failure mode this part exists to catch is the opposite of PART A: a revoke that went
-- too far and broke a live feature.
DO $$
DECLARE v_bad TEXT := '';
BEGIN
  -- invitations: HAMS onboarding RPCs are SECURITY INVOKER and read this as the caller.
  IF to_regclass('public.invitations') IS NULL THEN
    RAISE EXCEPTION 'E FAIL: invitations is absent, but 20260402145418 creates it';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.invitations', 'SELECT') THEN
    v_bad := v_bad || ' invitations(authenticated lost SELECT -> accept_*_invite / invite_* RPCs break)';
  END IF;

  -- technicians: medical-history/pdf reads it via the CALLER's client.
  IF to_regclass('public.technicians') IS NULL THEN
    RAISE EXCEPTION 'E FAIL: technicians is absent, but 20260319071603 creates it';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.technicians', 'SELECT') THEN
    v_bad := v_bad || ' technicians(authenticated lost SELECT -> medical-history PDF breaks)';
  END IF;

  -- user_notifications: the own-row policy is useless without the grant behind it.
  IF NOT has_table_privilege('authenticated', 'public.user_notifications', 'SELECT') THEN
    v_bad := v_bad || ' user_notifications(authenticated lost SELECT -> own-row policy unreachable)';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'E FAIL: over-revoked —%', v_bad;
  END IF;
  RAISE NOTICE 'PART E passed: authenticated retains the grants HAMS and MediLink need.';
END $$;

-- service_role must still reach everything: HAMS operations and the MediLink backend depend
-- on it, and it is the only role that can still read the locked-down snapshots.
DO $$
DECLARE v_bad TEXT := ''; v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['invitations','technicians','user_notifications',
                               '_bk_omani_profiles','_bk_omani_doctors','facility_admin_invites'] LOOP
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      RAISE NOTICE 'E skip %: absent', v_tbl;
      CONTINUE;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', v_tbl), 'SELECT') THEN
      v_bad := v_bad || ' ' || v_tbl;
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'E FAIL: service_role lost SELECT on:% (HAMS / backend break)', v_bad;
  END IF;
  RAISE NOTICE 'PART E passed: service_role access untouched.';
END $$;

-- Guest mode must be completely unaffected — anon SELECT on the deliberately-public tables.
DO $$
DECLARE v_bad TEXT := ''; v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['doctors','facilities','specialties','reviews',
                               'doctor_availability','facility_photos'] LOOP
    IF to_regclass(format('public.%I', v_tbl)) IS NULL THEN
      v_bad := v_bad || ' ' || v_tbl || '(table missing)';
    ELSIF NOT has_table_privilege('anon', format('public.%I', v_tbl), 'SELECT') THEN
      v_bad := v_bad || ' ' || v_tbl || '(anon lost SELECT)';
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'E FAIL: guest mode broken —%', v_bad;
  END IF;
  RAISE NOTICE 'PART E passed: guest-mode discovery tables still readable by anon.';
END $$;

-- Patient-facing RLS must be exactly as before. This migration never references these tables,
-- so a failure here means something else changed.
DO $$
DECLARE v_bad TEXT := ''; v_tbl TEXT; v_rls BOOLEAN;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['appointments','payments','profiles','patient_profiles',
                               'prescriptions','patient_documents','family_members',
                               'lab_results','in_app_notifications','refunds','device_tokens'] LOOP
    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_tbl;

    IF v_rls IS NULL THEN
      v_bad := v_bad || ' ' || v_tbl || '(missing)';
    ELSIF NOT v_rls THEN
      v_bad := v_bad || ' ' || v_tbl || '(RLS off)';
    END IF;
  END LOOP;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'E FAIL: patient-facing RLS regressed:%', v_bad;
  END IF;
  RAISE NOTICE 'PART E passed: all patient-facing tables still have RLS.';
END $$;

-- =============================================================================
-- PART F — THE DEFERRED ITEMS ARE STILL DEFERRED
-- =============================================================================
-- Asserts the migration did NOT overreach. RLS on invitations/technicians needs a HAMS code
-- change first (the SECURITY INVOKER accept RPCs), so RLS being ON here would mean somebody
-- enabled it without that change — and HAMS onboarding would be broken.
--
-- When HAMS does land the SECURITY DEFINER change and RLS is enabled deliberately, THIS BLOCK
-- MUST BE UPDATED, not deleted: flip the expectation and keep asserting it.
DO $$
DECLARE v_rls BOOLEAN; v_bad TEXT := '';
BEGIN
  SELECT c.relrowsecurity INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='invitations';
  IF v_rls IS NULL THEN
    v_bad := v_bad || ' invitations(catalog lookup NULL)';
  ELSIF v_rls THEN
    v_bad := v_bad || ' invitations(RLS ON — accept_*_invite are SECURITY INVOKER and will fail)';
  END IF;

  SELECT c.relrowsecurity INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='technicians';
  IF v_rls IS NULL THEN
    v_bad := v_bad || ' technicians(catalog lookup NULL)';
  ELSIF v_rls THEN
    v_bad := v_bad || ' technicians(RLS ON — not yet approved by HAMS)';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'F FAIL:% — see the HAMS APPROVAL section of 20260818000000', v_bad;
  END IF;
  RAISE NOTICE 'PART F passed: RLS correctly still OFF on invitations and technicians (deferred).';
END $$;

-- spatial_ref_sys must be untouched: PostGIS-owned reference data, and enabling RLS on it can
-- break every distance calculation in clinic discovery.
DO $$
DECLARE v_rls BOOLEAN;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'spatial_ref_sys';

  -- Explicit NULL check: absent would mean PostGIS is not installed as expected, which is a
  -- finding in itself, not a pass.
  IF v_rls IS NULL THEN
    RAISE EXCEPTION 'F FAIL: public.spatial_ref_sys not found — PostGIS layout changed unexpectedly';
  END IF;
  IF v_rls THEN
    RAISE EXCEPTION 'F FAIL: RLS was enabled on spatial_ref_sys — this can break PostGIS distance queries';
  END IF;
  RAISE NOTICE 'PART F passed: spatial_ref_sys left alone (PostGIS reference data).';
END $$;

-- =============================================================================
-- PART G — MANUAL: prove it over HTTP, the way the exposure actually happened
-- =============================================================================
-- Catalog checks prove intent; only an HTTP request proves the door is shut. Use the PUBLIC
-- anon key. HEAD + count returns no row data.
--
-- FIRST: reload the PostgREST schema cache, or these may still show the old behaviour.
--   NOTIFY pgrst, 'reload schema';
--
--   REF=<project-ref>; ANON=<public anon key>
--
--   # 1. Every remediated table must now answer 401/403/404 (was 200 with full row counts):
--   for t in _bk_omani_profiles _bk_omani_doctors _bk_omani_invitations _bk_omani_counts \
--            _bk_omani_facilities _bk_omani_facility_staff _bk_omani_fp _bk_omani_technicians \
--            invitations technicians facility_admin_invites user_notifications; do
--     printf '%-26s ' "$t"
--     curl -s -o /dev/null -w '%{http_code}\n' -I -X HEAD \
--       -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--       "https://$REF.supabase.co/rest/v1/$t?select=*"
--   done
--   # EXPECT 401/403 (or 404) for all twelve. A 200 means the revoke did not take effect,
--   # or the schema cache is stale.
--
--   # 2. Guest mode must still work (EXPECT 200/206 with UNCHANGED counts):
--   for t in doctors facilities specialties reviews doctor_availability facility_photos; do
--     printf '%-22s ' "$t"
--     curl -s -I -X HEAD -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--       -H 'Prefer: count=exact' -H 'Range: 0-0' \
--       "https://$REF.supabase.co/rest/v1/$t?select=id" | grep -i content-range
--   done
--   # Baseline captured 2026-08-18: doctors 112, facilities 52, specialties 9, reviews 10,
--   # doctor_availability 507, facility_photos 11.
--
--   # 3. Patient data must still be FILTERED, not merely reachable (EXPECT ".../0"):
--   curl -s -I -X HEAD -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H 'Prefer: count=exact' -H 'Range: 0-0' \
--     "https://$REF.supabase.co/rest/v1/appointments?select=id" | grep -i content-range
--
--   # 4. As a real signed-in PATIENT (bearer = that user's access token):
--   #    book -> pay -> payment-success -> invoice download -> records. All must work.
--
--   # 5. As a real signed-in FACILITY ADMIN: send an invite, then ACCEPT it from a fresh
--   #    account. This is the single most important manual test — it exercises the
--   #    SECURITY INVOKER accept RPCs and would catch both the "HAMS frontend reads
--   #    invitations as anon" risk and any over-revoke. If it fails, roll back ONLY:
--   #      GRANT SELECT ON public.invitations TO anon;
-- =============================================================================
