-- Fix enum/type mismatch when writing audit logs from onboarding RPCs.
-- Error addressed:
-- column "actor_role" is of type public.user_role but expression is of type text

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
  v_role public.user_role;
  v_fa RECORD;
  v_doc UUID;
  v_on UUID;
  v_audit_action public.audit_action;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('facility_admin', 'super_admin') THEN
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

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'doctor_created'
    ) THEN 'doctor_created'::public.audit_action
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'profile_update'
    ) THEN 'profile_update'::public.audit_action
    ELSE NULL
  END INTO v_audit_action;

  IF v_audit_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (auth.uid(), v_role, v_audit_action, 'doctor', v_doc);
  END IF;

  RETURN QUERY SELECT v_doc, v_on, NULL;
END;
$$;

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
  v_role public.user_role;
  v_doc RECORD;
  v_fa RECORD;
  v_id UUID;
  v_audit_action public.audit_action;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('facility_admin', 'super_admin') THEN
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

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'doctor_invited'
    ) THEN 'doctor_invited'::public.audit_action
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'profile_update'
    ) THEN 'profile_update'::public.audit_action
    ELSE NULL
  END INTO v_audit_action;

  IF v_audit_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (auth.uid(), v_role, v_audit_action, 'invitation', v_id);
  END IF;

  RETURN QUERY SELECT v_id, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID, TEXT, TEXT, TEXT, TEXT[], JSONB, TEXT, DATE
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.invite_doctor(
  UUID, TEXT, TEXT
) TO authenticated;
