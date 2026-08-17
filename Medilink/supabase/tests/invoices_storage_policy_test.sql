-- Regression tests for 20260817000000_invoices_private_owner_scoped_storage.sql
-- =============================================================================
-- Guards the fix for the UNAUTHENTICATED PHI exposure in the `invoices` bucket: invoice
-- PDFs carrying patient name, patient email, doctor, facility and amount were served from a
-- PUBLIC bucket over permanently-valid URLs, and emailed to patients as plain links.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/invoices_storage_policy_test.sql
--   supabase db query --linked --file supabase/tests/invoices_storage_policy_test.sql
--
-- WRITES NOTHING. Every assertion inspects catalog metadata and existing rows only. As with
-- the patient-docs suite, there are deliberately no fixture uploads — this project has no
-- staging environment, so creating objects would write into the shared production bucket.
-- The true cross-account read attempt stays a MANUAL test; see PART D.
--
-- Every assertion RAISEs on failure, so a non-zero exit means a regression.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — the bucket must be PRIVATE
-- =============================================================================
-- This is the assertion that actually matters. Every policy below is defence in depth; if
-- `public` is true, none of them are consulted for an anonymous fetch and the PHI is out.
DO $$
DECLARE v_public BOOLEAN; v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'invoices') INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'A FAIL: bucket "invoices" does not exist — the invoice worker writes to it';
  END IF;

  SELECT public INTO v_public FROM storage.buckets WHERE id = 'invoices';
  IF v_public IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION
      'A FAIL: bucket "invoices" is PUBLIC (public=%). Invoice PDFs contain patient name, '
      'email, doctor, facility and amount, and are readable by anyone with the URL.', v_public;
  END IF;

  RAISE NOTICE 'PART A passed: invoices bucket is private.';
END $$;

-- =============================================================================
-- PART B — the owner-scoped read policy exists and is correctly shaped
-- =============================================================================
DO $$
DECLARE
  v_qual TEXT;
  v_cmd  TEXT;
  v_roles TEXT;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='invoices_owner_select';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B FAIL: expected exactly 1 invoices_owner_select policy, found %', v_count;
  END IF;

  SELECT qual, cmd, roles::text INTO v_qual, v_cmd, v_roles
    FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='invoices_owner_select';

  IF v_cmd <> 'SELECT' THEN
    RAISE EXCEPTION 'B FAIL: invoices_owner_select must be SELECT-only, is %', v_cmd;
  END IF;

  IF v_roles NOT ILIKE '%authenticated%' THEN
    RAISE EXCEPTION 'B FAIL: policy must target the authenticated role, targets %', v_roles;
  END IF;

  -- The ownership join is the entire boundary. Without auth.uid() the policy would expose
  -- every invoice to every signed-in patient — the exact defect being fixed, one step down.
  IF v_qual NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'B FAIL: invoices_owner_select has no auth.uid() predicate: %', v_qual;
  END IF;

  IF v_qual NOT ILIKE '%payments%' THEN
    RAISE EXCEPTION
      'B FAIL: policy must resolve ownership through public.payments — the object name is a '
      'PAYMENT id, not a user id, so a path-prefix rule cannot express ownership here: %', v_qual;
  END IF;

  RAISE NOTICE 'PART B passed: owner-scoped SELECT policy present and correctly shaped.';
END $$;

-- =============================================================================
-- PART C — patients must hold NO write verb on this bucket
-- =============================================================================
-- Invoices are financial records of care, written only by the generate-invoice edge
-- function under service_role. A patient who could UPDATE or DELETE one could destroy or
-- alter evidence of their own treatment and billing.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND cmd <> 'SELECT'
     AND coalesce(qual, with_check) ILIKE '%invoices%';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'C FAIL: write policy/policies exist on the invoices bucket: %', v_bad;
  END IF;

  RAISE NOTICE 'PART C passed: no INSERT/UPDATE/DELETE policy on invoices.';
END $$;

-- =============================================================================
-- PART D — data-shape preconditions the policy depends on
-- =============================================================================
-- The policy resolves ownership by casting `split_part(name, '.', 1)` to uuid and joining
-- payments. Two things must hold or real patients silently lose access to their own
-- invoices. 20260814010000 was nearly broken by exactly this (3 legacy `docs/…` objects),
-- so it is asserted rather than assumed.
DO $$
DECLARE v_total INT; v_canonical INT; v_orphaned INT;
BEGIN
  SELECT count(*),
         count(*) FILTER (
           WHERE name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
         )
    INTO v_total, v_canonical
    FROM storage.objects WHERE bucket_id = 'invoices';

  IF v_total > 0 AND v_canonical <> v_total THEN
    RAISE EXCEPTION
      'D FAIL: % of % invoice objects do not match {uuid}.pdf. The policy skips non-canonical '
      'names, so those patients cannot read their own invoice. List them and extend the policy '
      'before relying on this.', v_total - v_canonical, v_total;
  END IF;

  SELECT count(*) INTO v_orphaned
    FROM storage.objects o
   WHERE o.bucket_id = 'invoices'
     AND o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
     AND NOT EXISTS (
       SELECT 1 FROM public.payments p WHERE p.id = split_part(o.name, '.', 1)::uuid
     );

  -- A notice, not a failure: an orphan is unreachable, which is the SAFE direction.
  IF v_orphaned > 0 THEN
    RAISE NOTICE 'PART D notice: % invoice object(s) have no matching payment row and are '
                 'now unreadable by anyone but service_role. Verify this is expected.', v_orphaned;
  END IF;

  RAISE NOTICE 'PART D passed: % invoice object(s), all canonically named.', v_total;
END $$;

-- =============================================================================
-- PART E — patients.patient_id really is the auth uid (the join's core assumption)
-- =============================================================================
-- The policy compares `payments.patient_id = auth.uid()`. If patient_id were
-- `patient_profiles.id` instead, the join would match nothing and every patient would be
-- denied their own invoice. Verified structurally against profiles.
DO $$
DECLARE v_mismatched INT;
BEGIN
  SELECT count(*) INTO v_mismatched
    FROM public.payments p
   WHERE p.patient_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.patient_id);

  IF v_mismatched > 0 THEN
    RAISE EXCEPTION
      'E FAIL: % payment row(s) have a patient_id that is not a profiles.id (auth uid). The '
      'invoices_owner_select join would deny those patients their own invoice.', v_mismatched;
  END IF;

  RAISE NOTICE 'PART E passed: payments.patient_id resolves to profiles.id (the auth uid).';
END $$;

-- =============================================================================
-- MANUAL — the end-to-end proof this file cannot perform
-- =============================================================================
-- Requires two real patient sessions and an HTTP client, so it is not automatable here.
--
--   1. PUBLIC URL IS DEAD (the actual fix):
--        curl -sI "https://<ref>.supabase.co/storage/v1/object/public/invoices/<payment>.pdf"
--        -> expect 400/404. A 200 means the bucket is still public.
--
--   2. OWNER CAN READ, VIA THE APP:
--        GET /api/payments/<A's payment id>/invoice        as A  -> 302 to a signed URL -> 200 PDF
--        GET /api/payments/<A's payment id>/invoice?format=json as A -> { url, expiresIn }
--
--   3. NON-OWNER CANNOT:
--        GET /api/payments/<B's payment id>/invoice        as A  -> 404 (not 403 — no existence leak)
--
--   4. UNAUTHENTICATED CANNOT:
--        GET /api/payments/<A's payment id>/invoice        no session -> 401
--
--   5. THE SIGNED URL EXPIRES:
--        take the url from (2), wait past INVOICE_SIGNED_URL_TTL_SECONDS (300s), refetch
--        -> expect 400. A 200 means the TTL is not being applied.
--
--   6. EMAIL CARRIES NO STORAGE LINK:
--        trigger a real payment, open the receipt mail, inspect the CTA href
--        -> expect /api/payments/<id>/invoice, NOT /storage/v1/object/public/...
-- =============================================================================
