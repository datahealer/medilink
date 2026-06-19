-- ================================================================
-- ✅ FINAL 100% ARCHITECTURE FIX (NON-BREAKING)
-- ================================================================


-- ================================================================
-- 1. ADD MISSING CONSTRAINT (DOCTOR INVITE SAFETY)
-- ================================================================

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS inv_doctor_requires_facility;

ALTER TABLE public.invitations
ADD CONSTRAINT inv_doctor_requires_facility
CHECK (invite_type != 'doctor' OR doctor_id IS NOT NULL);


-- ================================================================
-- 2. FINAL INVITE FACILITY ADMIN RPC (WITH PERMISSIONS)
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_facility_admin(
  p_facility_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_token_hash TEXT,
  p_permissions JSONB DEFAULT NULL
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

  -- Insert with permissions
  INSERT INTO public.invitations (
    invite_type, email, invited_name, facility_id, invited_by, token_hash, permissions
  )
  VALUES (
    'facility_admin',
    lower(trim(p_email)),
    p_name,
    p_facility_id,
    auth.uid(),
    p_token_hash,
    p_permissions
  )
  RETURNING id INTO v_invite_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), 'super_admin', 'facility_approved', 'invitation', v_invite_id);

  RETURN QUERY SELECT v_invite_id, NULL;
END;
$$;


-- ================================================================
-- 3. FINAL ACCEPT FACILITY ADMIN RPC (FIXED PERMISSIONS)
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

  -- Insert with correct permissions
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

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (v_uid, 'facility_admin', 'profile_update', 'invitation', v_inv.id);

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 4. SECURE CREATE DOCTOR RPC (FULL VALIDATION)
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_doctor_record(
  p_facility_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_specialty TEXT,
  p_qualifications TEXT[],
  p_fees JSONB,
  p_license_number TEXT,
  p_license_expiry DATE
)
RETURNS TABLE(doctor_id UUID, onboarding_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_fa RECORD;
  v_doc UUID;
  v_on UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('facility_admin','super_admin') THEN
    RETURN QUERY SELECT NULL, NULL, 'unauthorized';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = p_facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.doctors (
    facility_id, full_name, specialty, qualifications, fees, is_active
  )
  VALUES (
    p_facility_id, p_full_name, p_specialty, p_qualifications, p_fees, FALSE
  )
  RETURNING id INTO v_doc;

  INSERT INTO public.doctor_onboarding (
    doctor_id, status, license_number, license_expiry, initiated_by, step_basic_info
  )
  VALUES (
    v_doc, 'invited', p_license_number, p_license_expiry, auth.uid(), TRUE
  )
  RETURNING id INTO v_on;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), v_role, 'doctor_created', 'doctor', v_doc);

  RETURN QUERY SELECT v_doc, v_on, NULL;
END;
$$;


-- ================================================================
-- 5. SECURE INVITE DOCTOR RPC
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
  v_role TEXT;
  v_doc RECORD;
  v_fa RECORD;
  v_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('facility_admin','super_admin') THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  SELECT * INTO v_doc FROM public.doctors WHERE id = p_doctor_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL, 'doctor_not_found';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = v_doc.facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.invitations(
    invite_type, email, doctor_id, facility_id, invited_by, token_hash
  )
  VALUES (
    'doctor',
    lower(trim(p_email)),
    p_doctor_id,
    v_doc.facility_id,
    auth.uid(),
    p_token_hash
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), v_role, 'doctor_invited', 'invitation', v_id);

  RETURN QUERY SELECT v_id, NULL;
END;
$$;