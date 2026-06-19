-- Repair migration for invite acceptance drift.
-- Ensures invitations.permissions exists and accept_facility_admin_invite
-- does not fail with: record "v_inv" has no field "permissions".
 
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS permissions JSONB;
 
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
    UPDATE public.invitations
    SET status = 'expired'
    WHERE id = v_inv.id;
 
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;
 
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = v_uid
      AND lower(email) = lower(v_inv.email)
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;
 
  INSERT INTO public.facility_admins (
    facility_id,
    user_id,
    permissions,
    assigned_by
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
 
  UPDATE public.profiles
  SET role = 'facility_admin'
  WHERE id = v_uid;
 
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;
 
  RETURN QUERY SELECT TRUE, NULL;
END;
$$;
 
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO service_role;
 