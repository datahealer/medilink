-- P0 — a deletion_pending account keeps full access to patient data (MED-016 / NEW-001)
-- =============================================================================
-- `DELETE /api/users/me/account` sets profiles.status = 'deletion_pending', cancels
-- appointments and writes an audit row. That is all it does. Nothing consumes the status:
-- no RLS policy references it, no sign-in path checks it, and the Supabase auth user is
-- left completely untouched — not banned, password unchanged.
--
-- So for the entire 30-day grace period the account signs in normally, and any device
-- already signed in keeps a valid JWT. PostgREST validates only a token's signature and
-- expiry, never the user's status, so that token reads PHI straight from /rest/v1/*,
-- bypassing the backend entirely. A client-side logout, an AuthProvider check, Next
-- middleware or a sign-in gate cannot stop it — only RLS can.
--
-- ═══ WHY RESTRICTIVE POLICIES, AND NOT REWRITING THE EXISTING ONES ═══════════
--
-- The obvious implementation is to DROP and re-CREATE each patient policy with an extra
-- `AND public.account_is_active()`. That was the original design and it is REJECTED here.
--
-- Reproducing ~16 tables' policy bodies verbatim means trusting that the migration files
-- match what is actually live. They very probably do — history is 166/166 in sync — but
-- `pg_policies` is not readable through PostgREST, so that could not be VERIFIED, only
-- assumed. On a P0 security change across tables shared with HAMS, the failure mode of a
-- rewrite is silently dropping a clause and WIDENING access: the opposite of the intent,
-- and invisible until exploited.
--
-- PostgreSQL RESTRICTIVE policies remove that risk entirely. They are ANDed with the
-- permissive policies already on the table, so:
--
--   • no existing policy is read, dropped, rewritten or even referenced;
--   • whatever those policies grant today, they still grant tomorrow, minus this predicate;
--   • the change cannot widen access, only narrow it — a restrictive policy can never
--     grant a row that the permissive set did not already allow;
--   • rollback is one DROP POLICY per table, with nothing to restore.
--
-- ═══ SCOPE ══════════════════════════════════════════════════════════════════
--
-- `TO authenticated` only:
--   • ANON is untouched — guest discovery (doctors/facilities/specialties) and the
--     availability RPCs keep working exactly as they do today.
--   • SERVICE ROLE bypasses RLS entirely, so the backend, the GDPR purge job, the
--     hold sweeper and every Edge Function are unaffected.
--   • STAFF are `authenticated` and therefore in scope, but account_is_active() returns
--     TRUE for them — it only ever blocks 'deletion_pending' and 'deleted'. HAMS staff
--     access is unchanged.
--
-- `public.profiles` is DELIBERATELY NOT PROTECTED. The restore-only flow depends on it:
-- a deletion_pending user must be able to authenticate, read their OWN profile row to
-- discover they are pending deletion, and call cancel-deletion. The existing
-- `profiles_select_own`-style policies still confine that to their own row, so this
-- exposes nothing about anyone else — it is the minimum surface restoration needs.
--
-- ═══ WHAT IS NOT TOUCHED ════════════════════════════════════════════════════
--   • aal2_or_no_2fa() — HAMS-owned, redefined by 20260803000001 to close an MFA bypass
--     by deriving enrolment from auth.mfa_factors. Folding an account-status check into it
--     would risk reverting that fix and would conflate MFA assurance with account
--     lifecycle. It is not read, not replaced, not referenced.
--   • Every HAMS function, trigger, policy and migration.
--   • Bug 1/2/3 objects: get_available_slots, doctors_available_today,
--     book_appointment_atomic, reschedule_appointment_atomic, release_unpaid_hold,
--     appointment_holds_slot, uq_appointment_slot. None is modified. NOTE that
--     `appointments` IS in the blast radius via the restrictive policy, so the Bug 1/2/3
--     live probes must be re-run after applying.
--   • No schema change: no table, column, index, grant or existing policy altered.

-- ---------------------------------------------------------------------------
-- 1) account_is_active() — the predicate
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is REQUIRED, not a convenience: this function reads public.profiles,
-- and it is invoked from policies. Without DEFINER the read would itself be subject to
-- RLS on profiles and recurse.
--
-- Blocks ONLY 'deletion_pending' and 'deleted'. 'suspended' is deliberately NOT blocked —
-- that is a HAMS staff-moderation state with its own semantics, and changing what it does
-- is outside this fix.
--
-- A MISSING profile row returns TRUE. A signup provisions auth.users before the trigger
-- writes public.profiles, and denying that window would lock a brand-new patient out of
-- their own first-run setup. The permissive policies still require ownership, so "no
-- profile row" grants nothing on its own.
--
-- STABLE: one evaluation per statement rather than per row.

CREATE OR REPLACE FUNCTION public.account_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.status NOT IN ('deletion_pending', 'deleted')
     FROM public.profiles p
     WHERE p.id = auth.uid()),
    TRUE
  );
$$;

COMMENT ON FUNCTION public.account_is_active() IS
  'FALSE while the caller''s account is deletion_pending or deleted. Used by RESTRICTIVE RLS policies to cut PHI access from an already-issued JWT. Never blocks staff, anon or a not-yet-provisioned profile.';

GRANT EXECUTE ON FUNCTION public.account_is_active() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2) One RESTRICTIVE policy per patient PHI table
-- ---------------------------------------------------------------------------
-- FOR ALL + USING + WITH CHECK so reads AND writes are both blocked: a deletion_pending
-- user must not be able to insert or update either.
--
-- `DROP POLICY IF EXISTS` first makes the migration re-runnable; it only ever drops the
-- policy this migration created, never an existing one.

DO $$
DECLARE
  v_table TEXT;
  -- Every table holding patient-identifiable or patient-owned data. `profiles` is
  -- deliberately absent — see the header.
  v_tables TEXT[] := ARRAY[
    'patient_profiles',
    'appointments',
    'medical_histories',
    'patient_documents',
    'prescriptions',
    'lab_results',
    'lab_result_analytes',
    'family_members',
    'payments',
    'refunds',
    'patient_insurance',
    'in_app_notifications',
    'pre_consultation_forms',
    'reviews',
    'announcement_reads',
    'waitlist_entries',
    'device_tokens'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    -- Skip anything absent from this environment rather than failing the whole migration.
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table
    ) THEN
      RAISE NOTICE 'account_active_required: skipping %, table not present', v_table;
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS account_active_required ON public.%I', v_table
    );
    EXECUTE format(
      'CREATE POLICY account_active_required ON public.%I '
      'AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.account_is_active()) '
      'WITH CHECK (public.account_is_active())',
      v_table
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Verification — fails the migration rather than reporting success falsely
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected INT;
  v_actual   INT;
BEGIN
  SELECT count(*) INTO v_expected
  FROM unnest(ARRAY[
    'patient_profiles','appointments','medical_histories','patient_documents',
    'prescriptions','lab_results','lab_result_analytes','family_members','payments',
    'refunds','patient_insurance','in_app_notifications','pre_consultation_forms',
    'reviews','announcement_reads','waitlist_entries','device_tokens'
  ]) AS t(name)
  WHERE EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t.name);

  SELECT count(*) INTO v_actual
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname = 'account_active_required';

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'account_active_required: expected % policies, created %', v_expected, v_actual;
  END IF;

  -- profiles must NOT be covered, or restoration breaks.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='account_active_required'
  ) THEN
    RAISE EXCEPTION 'account_active_required must not cover public.profiles — the restore flow needs the self-read';
  END IF;

  RAISE NOTICE 'account_active_required applied to % tables; profiles correctly excluded', v_actual;
END $$;
