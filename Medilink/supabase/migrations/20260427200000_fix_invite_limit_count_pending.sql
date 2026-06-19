-- Fix invite_facility_admin RPC to count non-expired pending invitations
-- alongside active admins when enforcing the facility admin limit.
-- Previously only facility_admins (accepted) were counted, so multiple
-- pending invites could be created even with max_admins = 1.

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
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'super_admin' THEN
    RETURN QUERY SELECT NULL::UUID, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_facility_id::TEXT));

  -- FIX: count active admins + non-expired pending invitations together
  SELECT
    (SELECT COUNT(*) FROM public.facility_admins
     WHERE facility_id = p_facility_id AND revoked_at IS NULL)
    +
    (SELECT COUNT(*) FROM public.invitations
     WHERE facility_id = p_facility_id
       AND invite_type = 'facility_admin'
       AND status = 'pending'
       AND expires_at > NOW())
  INTO v_current;

  SELECT COALESCE(max_admins, 1) INTO v_max
  FROM public.facility_admin_limit
  WHERE facility_id = p_facility_id;

  IF v_current >= v_max THEN
    RETURN QUERY SELECT NULL::UUID, 'admin_limit_reached'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE facility_id = p_facility_id
      AND email = lower(trim(p_email))
      AND invite_type = 'facility_admin'
      AND status = 'pending'
      AND expires_at > NOW()
  ) THEN
    RETURN QUERY SELECT NULL::UUID, 'invite_already_pending'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.invitations (
    invite_type, email, invited_name, facility_id, invited_by, token_hash
  )
  VALUES (
    'facility_admin', lower(trim(p_email)), p_name, p_facility_id, auth.uid(), p_token_hash
  )
  RETURNING id INTO v_invite_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), 'super_admin', 'facility_admin_invited', 'invitation', v_invite_id);

  RETURN QUERY SELECT v_invite_id, NULL::TEXT;
END;
$$;
