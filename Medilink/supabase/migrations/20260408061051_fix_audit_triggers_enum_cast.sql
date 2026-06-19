-- ================================================================
-- FIX: Add missing audit_action enum values + rewrite triggers
-- ================================================================
-- The audit_action enum didn't include invitation/onboarding/admin
-- revocation values used by the triggers. This migration:
--   1. Adds the missing enum values
--   2. Rewrites all 4 trigger functions with correct enum casts
-- ================================================================
 
-- ── 1. Extend audit_action enum ──────────────────────────────────
 
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_accepted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_revoked';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_expired';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_pending';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_in_progress';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_completed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_admin_revoked';
 
 
-- ── 2. TRIGGER 1: Invitation status changes ───────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'accepted' THEN 'invitation_accepted'::public.audit_action
    WHEN 'revoked'  THEN 'invitation_revoked'::public.audit_action
    WHEN 'expired'  THEN 'invitation_expired'::public.audit_action
    ELSE NULL
  END;
 
  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    NEW.invited_by,
    NEW.invite_type::TEXT::public.user_role,
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
 
-- ── 3. TRIGGER 2: Doctor onboarding status changes ────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_onboarding_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
  v_user_id UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'pending'     THEN 'doctor_onboarding_pending'::public.audit_action
    WHEN 'in_progress' THEN 'doctor_onboarding_in_progress'::public.audit_action
    WHEN 'completed'   THEN 'doctor_onboarding_completed'::public.audit_action
    ELSE NULL
  END;
 
  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;
 
  SELECT user_id INTO v_user_id FROM public.doctors WHERE id = NEW.doctor_id;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    v_user_id,
    'doctor'::public.user_role,
    v_action,
    'doctor_onboarding',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
 
-- ── 4. TRIGGER 3: Facility admin revocation ───────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_facility_admin_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      NEW.revoked_by,
      'super_admin'::public.user_role,
      'facility_admin_revoked'::public.audit_action,
      'facility_admin',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
 
-- ── 5. TRIGGER 4: Review moderation ──────────────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_review_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_visible IS DISTINCT FROM NEW.is_visible THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      auth.uid(),
      'facility_admin'::public.user_role,
      CASE WHEN NEW.is_visible
        THEN 'review_restored'::public.audit_action
        ELSE 'review_flagged'::public.audit_action
      END,
      'review',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 