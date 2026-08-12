-- P1 — the 30-day GDPR purge has never run once (MED-016 follow-up)
-- =============================================================================
-- `purge_deleted_accounts()` (20260422110000) anonymises an expired account with:
--
--     UPDATE public.profiles SET ... email = NULL ... WHERE id = v_uid;
--
-- but `profiles.email` is NOT NULL. Every execution therefore raises 23502
-- (not_null_violation) on the FIRST eligible account. There is no exception handler around
-- that UPDATE, so the error propagates out of the FOR loop and aborts the whole function —
-- the enclosing transaction rolls back and NOTHING is purged, for ANY user. The nightly job
-- has been failing silently since 2026-04-22.
--
-- A SECOND, COUPLED DEFECT makes this worse than a stalled job. The companion Edge Function
-- `purge-user-auth` selects its work with:
--
--     .eq("status", "deleted").is("email", null).eq("auth_masked", false)
--
-- i.e. it waits for the NULL email that the SQL above can never produce. So even after the
-- 23502 is fixed, if the SQL wrote anything other than NULL the Edge Function would still
-- match zero rows, and the auth user would never be banned or its email masked. Fixing
-- either half alone leaves the lifecycle broken; both are corrected together here and in
-- supabase/functions/purge-user-auth/index.ts.
--
-- ═══ WHY A SENTINEL, NOT A RELAXED CONSTRAINT ═══════════════════════════════
--
-- The alternative fix is `ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL`. That is
-- REJECTED. HAMS migration 20260802000001 documents profiles.email as "Mirror of
-- auth.users.email, maintained by the service-role invite routes", and warns that
-- profiles.email diverging from auth.users.email "breaks the identity assumption". Dropping
-- the constraint would weaken a HAMS invariant to work around a MediLink bug.
--
-- Instead the purge writes the SAME masked address the Edge Function already writes to
-- auth.users:  deleted_<uuid>@deleted.invalid
--
-- so the mirror invariant is preserved rather than broken. This also matches the three
-- accounts already masked by hand in production, and `.invalid` is the RFC 2606 reserved
-- TLD, guaranteed never to resolve. Uniqueness is satisfied for free: the UUID makes each
-- sentinel distinct, so profiles_email_ci_unique cannot collide.
--
-- ═══ PER-ACCOUNT ISOLATION ══════════════════════════════════════════════════
--
-- The original loop had no error isolation, which is precisely why ONE bad row killed the
-- entire sweep for four months. Each account is now purged inside its own BEGIN/EXCEPTION
-- block: a failure is reported with RAISE WARNING and the loop moves on, so one unpurgeable
-- account can never again hide every other account's deletion.
--
-- ═══ NOT TOUCHED ════════════════════════════════════════════════════════════
--   • The audit-log design. The same account_deletion_processed row is still written, and
--     audit_logs' immutability triggers/policies are not referenced.
--   • HAMS objects. purge_deleted_accounts() is MediLink-owned (added in the initial
--     monorepo commit); no HAMS migration defines or calls it.
--   • The function SIGNATURE — still purge_deleted_accounts() RETURNS void — so any
--     existing pg_cron schedule keeps working untouched.
--   • The 30-day grace period, the retained medical/legal records, and the set of columns
--     anonymised. Only the email VALUE and the error isolation change.

CREATE OR REPLACE FUNCTION public.purge_deleted_accounts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID;
  v_purged    INT := 0;
  v_failed    INT := 0;
BEGIN
  FOR v_uid IN
    SELECT id FROM public.profiles
    WHERE status = 'deletion_pending'
      AND deletion_requested_at < NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      UPDATE public.profiles SET
        full_name    = 'Deleted User',
        phone        = NULL,
        -- WAS `email = NULL`, which violated NOT NULL and aborted the entire sweep.
        -- This value is byte-identical to what purge-user-auth writes to auth.users.email,
        -- keeping profiles.email a faithful mirror.
        email        = 'deleted_' || v_uid::text || '@deleted.invalid',
        push_tokens  = '{}',
        status       = 'deleted',
        consent_ip   = NULL,
        updated_at   = NOW()
      WHERE id = v_uid;

      UPDATE public.patient_profiles SET
        date_of_birth     = NULL,
        address           = NULL,
        emergency_contact = NULL,
        profile_photo_url = NULL
      WHERE user_id = v_uid;

      -- Unchanged from 20260422110000: null sender_id where the column allows it,
      -- otherwise anonymise content only.
      BEGIN
        UPDATE public.messages
          SET content = '[deleted]', sender_id = NULL
        WHERE sender_id = v_uid;
      EXCEPTION WHEN not_null_violation THEN
        UPDATE public.messages
          SET content = '[deleted]'
        WHERE sender_id = v_uid;
      END;

      DELETE FROM public.otp_records               WHERE user_id = v_uid;
      DELETE FROM public.two_factor_secrets        WHERE user_id = v_uid;
      DELETE FROM public.two_factor_recovery_codes WHERE user_id = v_uid;
      DELETE FROM public.web_push_subscriptions    WHERE user_id = v_uid;
      DELETE FROM public.user_integrations         WHERE user_id = v_uid;

      INSERT INTO public.audit_logs (actor_user_id, action, resource_type, resource_id)
      VALUES (v_uid, 'account_deletion_processed'::public.audit_action, 'profile', v_uid);

      v_purged := v_purged + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Isolate the failure to this account. Without this, a single bad row rolls back and
      -- silently cancels the purge for every other expired account — the exact failure mode
      -- this migration exists to fix.
      v_failed := v_failed + 1;
      RAISE WARNING 'purge_deleted_accounts: skipped % — %', v_uid, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'purge_deleted_accounts: purged %, failed %', v_purged, v_failed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_deleted_accounts() TO service_role;

COMMENT ON FUNCTION public.purge_deleted_accounts() IS
  'Nightly GDPR sweep: anonymises profiles whose deletion has been pending 30+ days, then leaves auth masking to the purge-user-auth Edge Function (which selects on auth_masked = false). Each account is isolated so one failure cannot stall the sweep.';
