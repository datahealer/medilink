-- Fix accept_doctor_invite RPC.
-- Previously only SET user_id + is_active on the doctor record.
-- Now also enforces facility_id = invitations.facility_id so the doctor
-- is always assigned to the invited facility, never a stale/wrong one.
-- Also syncs profiles.facility_id + profiles.role = 'doctor'.

CREATE OR REPLACE FUNCTION public.accept_doctor_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
    AND invite_type = 'doctor'
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

  -- Link auth user to the pre-created doctor record.
  -- ALWAYS enforce facility_id from the invitation — never trust the old value.
  UPDATE public.doctors
  SET
    user_id     = v_uid,
    facility_id = v_inv.facility_id,
    is_active   = TRUE
  WHERE id = v_inv.doctor_id;

  -- Update profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'doctor',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  -- Mark invitation accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;
