-- ================================================================
-- BUG-7: Wire Audit Log Triggers
-- ================================================================
-- Ensures key system events are automatically recorded in audit_logs.
-- Covers: invitation lifecycle, facility admin changes, doctor
-- onboarding status changes, and review moderation actions.
-- ================================================================
 
-- Allow service_role to INSERT into audit_logs (used by triggers)
GRANT INSERT ON public.audit_logs TO service_role;
GRANT INSERT ON public.audit_logs TO postgres;
 
-- ================================================================
-- HELPER: Generic audit insert function
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_log(
  p_actor_user_id UUID,
  p_actor_role    TEXT,
  p_action        TEXT,
  p_resource_type TEXT,
  p_resource_id   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (p_actor_user_id, p_actor_role, p_action, p_resource_type, p_resource_id);
END;
$$;
 
GRANT EXECUTE ON FUNCTION public.hams_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION public.hams_audit_log TO postgres;
 
 
-- ================================================================
-- TRIGGER 1: Invitation status changes
-- Fires when an invitation is accepted, revoked, or expires.
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
    NEW.invite_type,
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_invitation_change ON public.invitations;
CREATE TRIGGER audit_invitation_change
AFTER UPDATE ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_invitation_change();
 
 
-- ================================================================
-- TRIGGER 2: Doctor onboarding status changes
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_onboarding_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  SELECT
    d.user_id,
    'doctor',
    'doctor_onboarding_' || NEW.status,
    'doctor_onboarding',
    NEW.id
  FROM public.doctors d
  WHERE d.id = NEW.doctor_id;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_doctor_onboarding ON public.doctor_onboarding;
CREATE TRIGGER audit_doctor_onboarding
AFTER UPDATE ON public.doctor_onboarding
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_doctor_onboarding_change();
 
 
-- ================================================================
-- TRIGGER 3: Facility admin revocation
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_facility_admin_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when revoked_at transitions from NULL to a timestamp
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      NEW.revoked_by,
      'super_admin',
      'facility_admin_revoked',
      'facility_admin',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_facility_admin_revoke ON public.facility_admins;
CREATE TRIGGER audit_facility_admin_revoke
AFTER UPDATE ON public.facility_admins
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_facility_admin_revoke();
 
 
-- ================================================================
-- TRIGGER 4: Review moderation (flag / restore)
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_review_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect visibility toggle (flag = hidden, restore = visible)
  IF OLD.is_visible IS DISTINCT FROM NEW.is_visible THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      auth.uid(),
      'facility_admin',
      CASE WHEN NEW.is_visible THEN 'review_restored' ELSE 'review_flagged' END,
      'review',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_review_moderation ON public.reviews;
CREATE TRIGGER audit_review_moderation
AFTER UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_review_moderation();