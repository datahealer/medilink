-- ================================================================
-- 🔥 FIX MIGRATION (AFTER PRODUCTION FINAL)
-- ================================================================


-- ================================================================
-- 1. 🔐 FIX TOKEN SECURITY (CRITICAL)
-- ================================================================

REVOKE SELECT ON public.invitations FROM authenticated;

-- Keep access only via RPC (service_role bypasses anyway)


-- ================================================================
-- 2. ✅ ADD PERMISSIONS SUPPORT (FOR FUTURE)
-- ================================================================

ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS permissions JSONB;


-- ================================================================
-- 3. 🛡 FIX ACCEPT RPC PERMISSIONS LOGIC
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- ✅ FIXED: permissions from invite or default
  INSERT INTO public.facility_admins (
    facility_id, user_id, permissions, assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  UPDATE public.profiles SET role = 'facility_admin' WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 4. ➕ ADD DOCTOR INVITE RPC
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_doctor(
  p_doctor_id UUID,
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.invitations(
    invite_type, email, doctor_id, facility_id, invited_by, token_hash
  )
  SELECT
    'doctor',
    lower(trim(p_email)),
    d.id,
    d.facility_id,
    auth.uid(),
    p_token_hash
  FROM public.doctors d
  WHERE d.id = p_doctor_id
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, NULL;
END;
$$;


-- ================================================================
-- 5. ➕ ADD ACCEPT DOCTOR INVITE
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_doctor_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'doctor'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  UPDATE public.doctors
  SET user_id = auth.uid(),
      is_active = TRUE
  WHERE id = v_inv.doctor_id;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 6. 🔒 MAKE AUDIT LOGS IMMUTABLE
-- ================================================================

CREATE RULE audit_logs_no_update AS
ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;

CREATE RULE audit_logs_no_delete AS
ON DELETE TO public.audit_logs DO INSTEAD NOTHING;


-- ================================================================
-- 7. ⚡ ADD MISSING INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS ix_inv_token
ON public.invitations (token_hash);

CREATE INDEX IF NOT EXISTS ix_doctor_onboarding_status
ON public.doctor_onboarding (status);