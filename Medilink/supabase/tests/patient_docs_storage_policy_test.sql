-- Regression tests for 20260814010000_patient_docs_owner_scoped_storage.sql
-- =============================================================================
-- Guards the fix for the cross-patient PHI exposure in the `patient-docs` bucket.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/patient_docs_storage_policy_test.sql
--   supabase db query --linked --file supabase/tests/patient_docs_storage_policy_test.sql
--
-- WRITES NOTHING. Every assertion inspects pg_policies and existing object metadata only.
-- There are deliberately NO fixture uploads: creating storage objects would write into the
-- shared production bucket, and this project has no staging environment. The cross-account
-- read attempt that would prove the boundary end-to-end therefore remains a MANUAL test —
-- see PART C.
--
-- Every assertion RAISEs on failure, so a non-zero exit means a regression.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — the unrestricted policies must be GONE
-- =============================================================================
DO $$
DECLARE v_bad INT;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN ('Allow authenticated upload','Allow authenticated read','Allow delete own files');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'A FAIL: % unrestricted patient-docs policy/policies still present', v_bad;
  END IF;

  -- Nothing may reference patient-docs with bucket_id as its ONLY condition.
  SELECT count(*) INTO v_bad
    FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND coalesce(qual, with_check) ILIKE '%patient-docs%'
     AND coalesce(qual, with_check) NOT ILIKE '%auth.uid()%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'A FAIL: % patient-docs policy/policies lack an auth.uid() predicate', v_bad;
  END IF;

  RAISE NOTICE 'PART A passed: no unrestricted patient-docs policy remains.';
END $$;

-- =============================================================================
-- PART B — the replacement policies exist, are correctly scoped, and are minimal
-- =============================================================================
DO $$
DECLARE
  v_ins TEXT; v_sel TEXT; v_del TEXT; v_upd INT; v_roles TEXT;
BEGIN
  SELECT with_check INTO v_ins FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='patient_docs_owner_insert';
  SELECT qual INTO v_sel FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='patient_docs_owner_select';
  SELECT qual INTO v_del FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='patient_docs_owner_delete';

  IF v_ins IS NULL THEN RAISE EXCEPTION 'B FAIL: insert policy missing'; END IF;
  IF v_sel IS NULL THEN RAISE EXCEPTION 'B FAIL: select policy missing'; END IF;
  IF v_del IS NULL THEN RAISE EXCEPTION 'B FAIL: delete policy missing'; END IF;

  -- INSERT must pin the first path segment to the caller (cannot write into another's folder)
  IF v_ins NOT ILIKE '%foldername%' OR v_ins NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'B FAIL: insert policy does not pin the folder to auth.uid(): %', v_ins;
  END IF;

  -- SELECT and DELETE must each require ownership
  IF v_sel NOT ILIKE '%auth.uid()%' THEN RAISE EXCEPTION 'B FAIL: select not owner-scoped: %', v_sel; END IF;
  IF v_del NOT ILIKE '%auth.uid()%' THEN RAISE EXCEPTION 'B FAIL: delete not owner-scoped: %', v_del; END IF;

  -- DELETE must be at least as strict as SELECT (never broader)
  IF v_del IS DISTINCT FROM v_sel THEN
    RAISE EXCEPTION 'B FAIL: delete predicate differs from select — delete must not be broader';
  END IF;

  -- No UPDATE policy: object overwrite stays denied (both uploaders use upsert:false)
  SELECT count(*) INTO v_upd FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND cmd='UPDATE' AND coalesce(qual,with_check) ILIKE '%patient-docs%';
  IF v_upd > 0 THEN
    RAISE EXCEPTION 'B FAIL: an UPDATE policy on patient-docs exists (%); overwrite must stay denied', v_upd;
  END IF;

  -- Granted to `authenticated` only — never to anon or public
  SELECT array_to_string(roles,',') INTO v_roles FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='patient_docs_owner_select';
  IF v_roles ILIKE '%anon%' OR v_roles ILIKE '%public%' THEN
    RAISE EXCEPTION 'B FAIL: select policy granted to % — must be authenticated only', v_roles;
  END IF;

  RAISE NOTICE 'PART B passed: replacement policies scoped, minimal and authenticated-only.';
END $$;

-- =============================================================================
-- PART C — no live object becomes unreachable by its rightful owner
-- =============================================================================
-- The predicate accepts `owner = auth.uid()` OR the `{uid}/…` path prefix. This asserts
-- that EVERY existing object satisfies at least one branch for some real user — i.e. the
-- migration orphans nothing. It is the check that caught the 3 legacy `docs/…` objects
-- during design (path-prefix-only would have made them unopenable for their owners).
DO $$
DECLARE v_unreachable INT; v_total INT;
BEGIN
  SELECT count(*) INTO v_total FROM storage.objects WHERE bucket_id='patient-docs';

  SELECT count(*) INTO v_unreachable
    FROM storage.objects o
   WHERE o.bucket_id='patient-docs'
     AND o.owner IS NULL
     AND (storage.foldername(o.name))[1] !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  IF v_unreachable > 0 THEN
    RAISE EXCEPTION 'C FAIL: % of % objects match neither ownership branch and are now orphaned',
      v_unreachable, v_total;
  END IF;

  RAISE NOTICE 'PART C passed: all % objects remain reachable by their owner.', v_total;
END $$;

-- =============================================================================
-- PART D — MANUAL, two accounts. Cannot be automated without writing to production.
-- =============================================================================
-- The assertions above prove the POLICY SHAPE. They cannot prove the runtime boundary,
-- because that needs two real JWTs and at least one object per account. Run once on
-- staging, or against two disposable accounts, before trusting the fix:
--
--   As patient A:
--     1. upload a document                                  -> succeeds
--     2. supabase.storage.from('patient-docs').list('')      -> only A's objects
--     3. note A's object path
--
--   As patient B:
--     4. list('')                                            -> B's objects only, NOT A's
--     5. list('<A-uid>')                                     -> EMPTY
--     6. createSignedUrl('<A path>')                         -> ERROR (no permission)
--     7. remove(['<A path>'])                                -> must NOT delete; verify as A
--     8. upload to '<A-uid>/evil.txt'                        -> REJECTED by the insert policy
--
--   As patient A again:
--     9. the object from step 1 still opens                  -> proves no self-lockout
--    10. remove() own object                                 -> succeeds
--
-- Also verify one INVOICE pdf (type='invoice', filed by 20260721000001) opens for its
-- owner and not for anyone else — invoices share this bucket and this policy.
-- =============================================================================
