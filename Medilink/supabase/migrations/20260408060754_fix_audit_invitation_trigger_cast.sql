-- ================================================================
-- FIX: Audit invitation trigger — cast invite_type to user_role
-- ================================================================
-- actor_role column is user_role enum; NEW.invite_type is invite_type
-- enum. Cast via TEXT so 'facility_admin', 'doctor', 'technician'
-- are accepted (all exist in both enums).
-- ================================================================
 
CREATE OR REPLACE FUNCTION public.hams_audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'accepted' THEN 'invitation_accepted'
    WHEN 'revoked'  THEN 'invitation_revoked'
    WHEN 'expired'  THEN 'invitation_expired'
    ELSE 'invitation_status_changed'
  END;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    NEW.invited_by,
    NEW.invite_type::TEXT::public.user_role,   -- ✅ cast invite_type → TEXT → user_role
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;