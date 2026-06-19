-- ================================================================
-- F-57: GDPR / Data Privacy & Consent Management
-- ================================================================

-- ── 1. New audit_action enum values ──────────────────────────────
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'consent_given';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'consent_updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'data_export_downloaded';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'account_deletion_cancelled';

-- ── 2. Extend profiles ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_version      TEXT        DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS consent_ip           INET,
  ADD COLUMN IF NOT EXISTS export_request_count INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_export_at       TIMESTAMPTZ;

-- ── 3. consent_history (immutable audit trail) ───────────────────
CREATE TABLE IF NOT EXISTS public.consent_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_flags   JSONB       NOT NULL,
  consent_version TEXT        NOT NULL DEFAULT '1.0',
  ip_address      INET,
  user_agent      TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_consent_history_user_id
  ON public.consent_history(user_id);

ALTER TABLE public.consent_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_history_own"
  ON public.consent_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE RULE consent_no_update AS ON UPDATE TO public.consent_history DO INSTEAD NOTHING;
CREATE RULE consent_no_delete AS ON DELETE TO public.consent_history DO INSTEAD NOTHING;

GRANT SELECT ON public.consent_history TO authenticated;
GRANT ALL   ON public.consent_history TO service_role;

-- ── 4. Extend data_export_requests ───────────────────────────────
ALTER TABLE public.data_export_requests
  ADD COLUMN IF NOT EXISTS storage_path    TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_data_export_user_created
  ON public.data_export_requests(user_id, created_at DESC);

-- ── 5. Storage bucket for user exports ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-exports', 'user-exports', false, 104857600)
ON CONFLICT DO NOTHING;

CREATE POLICY "user_exports_own_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-exports'
    AND name LIKE 'exports/' || auth.uid()::text || '/%'
  );

-- ── 6. RLS for data_export_requests ──────────────────────────────
ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_export_own" ON public.data_export_requests;

CREATE POLICY "data_export_own"
  ON public.data_export_requests FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 7. purge_deleted_accounts() ──────────────────────────────────
-- Anonymizes PII for accounts past the 30-day grace period.
-- auth.users email masking is done separately by purge-user-auth Edge Function.
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

    UPDATE public.messages SET content = '[deleted]'
    WHERE sender_id = v_uid;

    DELETE FROM public.otp_records              WHERE user_id = v_uid;
    DELETE FROM public.two_factor_secrets       WHERE user_id = v_uid;
    DELETE FROM public.two_factor_recovery_codes WHERE user_id = v_uid;
    DELETE FROM public.web_push_subscriptions   WHERE user_id = v_uid;
    DELETE FROM public.user_integrations        WHERE user_id = v_uid;

    INSERT INTO public.audit_logs (actor_user_id, action, resource_type, resource_id)
    VALUES (v_uid, 'account_deletion_requested'::public.audit_action, 'profile', v_uid);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_deleted_accounts() TO service_role;

-- ── 8. pg_cron — nightly purge ───────────────────────────────────
SELECT cron.schedule(
  'gdpr-purge-deleted-accounts',
  '0 2 * * *',
  $$ SELECT public.purge_deleted_accounts(); $$
);
