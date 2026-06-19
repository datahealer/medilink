-- ============================================================
-- FACILITY ID CONSISTENCY — FULL FIX
-- ============================================================
-- Problem: doctors/technicians end up with wrong facility_id
-- after invite acceptance because the old accept_doctor_invite
-- RPC never updated facility_id on the doctor record.
-- Also: the trigger added in 000001–000003 blocks super_admin
-- invite creation since super_admin is not in facility_admins.
-- ============================================================

-- ── 1. Drop the trigger (approach discarded) ────────────────
DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON public.invitations;
DROP FUNCTION IF EXISTS public.enforce_invitation_facility();

-- ── 2. Add facility_id to profiles (single source of truth) ─
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_id UUID
    REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_profiles_facility_id
  ON public.profiles (facility_id)
  WHERE facility_id IS NOT NULL;

-- ── 3. Fix accept_doctor_invite ─────────────────────────────
-- Old version only SET user_id + is_active, never touched
-- facility_id → doctor kept whatever was on the pre-created
-- record, which could differ from the invitation.
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

  -- ALWAYS enforce facility_id from invitation — single source of truth
  UPDATE public.doctors
  SET
    user_id     = v_uid,
    facility_id = v_inv.facility_id,
    is_active   = TRUE
  WHERE id = v_inv.doctor_id;

  -- Sync profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'doctor',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;

-- ── 4. Fix accept_facility_admin_invite ─────────────────────
-- Add facility_id sync to profiles (was missing)
CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
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
    AND invite_type = 'facility_admin'
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

  -- Sync profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'facility_admin',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;

-- ── 5. DATA REPAIR ───────────────────────────────────────────
-- Fix doctors whose facility_id differs from the invitation
-- they accepted. Uses the most recent accepted doctor invite
-- for each doctor_id as the source of truth.
UPDATE public.doctors d
SET facility_id = i.facility_id
FROM public.invitations i
WHERE i.doctor_id     = d.id
  AND i.invite_type   = 'doctor'
  AND i.status        = 'accepted'
  AND d.facility_id  != i.facility_id
  AND i.accepted_at = (
    SELECT MAX(i2.accepted_at)
    FROM public.invitations i2
    WHERE i2.doctor_id = d.id
      AND i2.status    = 'accepted'
  );

-- Sync profiles.facility_id for doctors from their doctor record
UPDATE public.profiles p
SET facility_id = d.facility_id
FROM public.doctors d
WHERE d.user_id     = p.id
  AND p.role        = 'doctor'
  AND (p.facility_id IS NULL OR p.facility_id != d.facility_id);

-- Sync profiles.facility_id for technicians from their technician record
UPDATE public.profiles p
SET facility_id = t.facility_id
FROM public.technicians t
WHERE t.user_id     = p.id
  AND p.role        = 'technician'
  AND (p.facility_id IS NULL OR p.facility_id != t.facility_id);

-- Sync profiles.facility_id for facility_admins from facility_admins table
UPDATE public.profiles p
SET facility_id = fa.facility_id
FROM public.facility_admins fa
WHERE fa.user_id       = p.id
  AND fa.revoked_at    IS NULL
  AND p.role           = 'facility_admin'
  AND (p.facility_id IS NULL OR p.facility_id != fa.facility_id);
