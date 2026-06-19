-- ================================================================
-- F-57 GDPR Fixes — applied on top of 20260422100000
-- ================================================================

-- ── Fix 8: New audit_action enum value for purge completions ─────
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'account_deletion_processed';

-- ── Fix 1: Split RLS on data_export_requests ─────────────────────
-- Drop the overly-permissive FOR ALL policy; replace with
-- SELECT-own + INSERT-own only. Service role handles all UPDATEs.

DROP POLICY IF EXISTS "data_export_own" ON public.data_export_requests;

CREATE POLICY "data_export_select_own"
  ON public.data_export_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "data_export_insert_own"
  ON public.data_export_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── Fix 2: download_logged flag to prevent audit spam ────────────
ALTER TABLE public.data_export_requests
  ADD COLUMN IF NOT EXISTS download_logged BOOLEAN NOT NULL DEFAULT false;

-- ── Fix 4: auth_masked flag on profiles to prevent re-processing ─
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_masked BOOLEAN NOT NULL DEFAULT false;

-- ── Fix 7: Performance index for nightly deletion job ────────────
CREATE INDEX IF NOT EXISTS ix_profiles_status_deletion
  ON public.profiles(status, deletion_requested_at);

-- ── Fix 8: Use account_deletion_processed in purge function ──────
CREATE OR REPLACE FUNCTION public.purge_deleted_accounts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID;
BEGIN
  FOR v_uid IN
    SELECT id FROM public.profiles
    WHERE status = 'deletion_pending'
      AND deletion_requested_at < NOW() - INTERVAL '30 days'
  LOOP
    UPDATE public.profiles SET
      full_name    = 'Deleted User',
      phone        = NULL,
      email        = NULL,
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

    -- Fix 9 (optional): null sender_id if the column is nullable,
    -- otherwise fall back to content-only anonymization.
    -- The DO block handles the case where sender_id is NOT NULL.
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

    -- Fix 8: use the correct action for a completed purge
    INSERT INTO public.audit_logs (actor_user_id, action, resource_type, resource_id)
    VALUES (v_uid, 'account_deletion_processed'::public.audit_action, 'profile', v_uid);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_deleted_accounts() TO service_role;
