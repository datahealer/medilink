-- ================================================================
-- HAMS — ONBOARDING RLS + RPCs (PRODUCTION FINAL)
-- ================================================================


-- ================================================================
-- 1. ENABLE RLS
-- ================================================================

ALTER TABLE public.facility_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_admin_limit ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- 2. FACILITY ADMINS RLS
-- ================================================================

DROP POLICY IF EXISTS fa_super_admin ON public.facility_admins;
DROP POLICY IF EXISTS fa_self_read ON public.facility_admins;
DROP POLICY IF EXISTS fa_doctor_read ON public.facility_admins;

CREATE POLICY fa_super_admin
ON public.facility_admins
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY fa_self_read
ON public.facility_admins
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY fa_doctor_read
ON public.facility_admins
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = facility_admins.facility_id
      AND d.is_active = TRUE
  )
);

GRANT SELECT ON public.facility_admins TO authenticated;
GRANT ALL ON public.facility_admins TO service_role;


-- ================================================================
-- 3. FACILITY ADMIN LIMIT RLS
-- ================================================================

DROP POLICY IF EXISTS fal_super_admin ON public.facility_admin_limit;
DROP POLICY IF EXISTS fal_admin_read ON public.facility_admin_limit;

CREATE POLICY fal_super_admin
ON public.facility_admin_limit
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY fal_admin_read
ON public.facility_admin_limit
FOR SELECT TO authenticated
USING (
  facility_id IN (
    SELECT facility_id FROM public.facility_admins
    WHERE user_id = auth.uid() AND revoked_at IS NULL
  )
);

GRANT SELECT ON public.facility_admin_limit TO authenticated;
GRANT ALL ON public.facility_admin_limit TO service_role;


-- ================================================================
-- 4. INVITATIONS RLS
-- ================================================================

DROP POLICY IF EXISTS inv_super_admin ON public.invitations;
DROP POLICY IF EXISTS inv_facility_admin ON public.invitations;

CREATE POLICY inv_super_admin
ON public.invitations
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY inv_facility_admin
ON public.invitations
FOR ALL TO authenticated
USING (
  facility_id IN (
    SELECT facility_id FROM public.facility_admins
    WHERE user_id = auth.uid() AND revoked_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;


-- ================================================================
-- 5. DOCTOR ONBOARDING RLS
-- ================================================================

DROP POLICY IF EXISTS do_super_admin ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_facility_admin ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_doctor_self ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_doctor_self_update ON public.doctor_onboarding;

CREATE POLICY do_super_admin
ON public.doctor_onboarding
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY do_facility_admin
ON public.doctor_onboarding
FOR ALL TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors
    WHERE facility_id IN (
      SELECT facility_id FROM public.facility_admins
      WHERE user_id = auth.uid() AND revoked_at IS NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

CREATE POLICY do_doctor_self
ON public.doctor_onboarding
FOR SELECT TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
);

CREATE POLICY do_doctor_self_update
ON public.doctor_onboarding
FOR UPDATE TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
);

GRANT SELECT, UPDATE ON public.doctor_onboarding TO authenticated;
GRANT ALL ON public.doctor_onboarding TO service_role;


-- ================================================================
-- 6. DOCTOR DOCUMENTS RLS
-- ================================================================

DROP POLICY IF EXISTS dd_super_admin ON public.doctor_documents;
DROP POLICY IF EXISTS dd_facility_admin ON public.doctor_documents;
DROP POLICY IF EXISTS dd_doctor_read ON public.doctor_documents;

CREATE POLICY dd_super_admin
ON public.doctor_documents
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY dd_facility_admin
ON public.doctor_documents
FOR ALL TO authenticated
USING (
  doctor_id IN (
    SELECT d.id FROM public.doctors d
    WHERE d.facility_id IN (
      SELECT facility_id FROM public.facility_admins
      WHERE user_id = auth.uid() AND revoked_at IS NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

CREATE POLICY dd_doctor_read
ON public.doctor_documents
FOR SELECT TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
  AND deleted_at IS NULL
);

GRANT SELECT ON public.doctor_documents TO authenticated;
GRANT ALL ON public.doctor_documents TO service_role;


-- ================================================================
-- 7. RPC: INVITE FACILITY ADMIN (PRODUCTION SAFE)
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_facility_admin(
  p_facility_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_current INTEGER;
  v_max INTEGER;
  v_invite_id UUID;
BEGIN
  -- Role check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'super_admin' THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_facility_id::TEXT));

  -- Admin count
  SELECT COUNT(*) INTO v_current
  FROM public.facility_admins
  WHERE facility_id = p_facility_id AND revoked_at IS NULL;

  SELECT COALESCE(max_admins,1) INTO v_max
  FROM public.facility_admin_limit
  WHERE facility_id = p_facility_id;

  IF v_current >= v_max THEN
    RETURN QUERY SELECT NULL, 'admin_limit_reached';
    RETURN;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE facility_id = p_facility_id
      AND email = lower(trim(p_email))
      AND invite_type = 'facility_admin'
      AND status = 'pending'
      AND expires_at > NOW()
  ) THEN
    RETURN QUERY SELECT NULL, 'invite_already_pending';
    RETURN;
  END IF;

  -- Insert
  INSERT INTO public.invitations (
    invite_type, email, invited_name, facility_id, invited_by, token_hash
  )
  VALUES (
    'facility_admin', lower(trim(p_email)), p_name, p_facility_id, auth.uid(), p_token_hash
  )
  RETURNING id INTO v_invite_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), 'super_admin', 'facility_admin_invited', 'invitation', v_invite_id);

  RETURN QUERY SELECT v_invite_id, NULL;
END;
$$;


-- ================================================================
-- 8. RPC: ACCEPT INVITE (SECURE)
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

  -- Email validation
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- Role update
  UPDATE public.profiles SET role = 'facility_admin' WHERE id = v_uid;

  -- Mapping
  INSERT INTO public.facility_admins (
    facility_id, user_id, assigned_by
  )
  VALUES (
    v_inv.facility_id, v_uid, v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  -- Mark accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (v_uid, 'facility_admin', 'invite_accepted', 'invitation', v_inv.id);

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;