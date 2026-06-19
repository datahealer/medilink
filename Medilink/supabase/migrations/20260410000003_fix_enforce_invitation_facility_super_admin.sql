-- Fix enforce_invitation_facility trigger:
-- 1. SET search_path = public so bare table names resolve
-- 2. super_admin bypasses facility lookup — trusts facility_id already set in the INSERT
-- 3. Explicit public. schema prefix on all table references as double-safety

CREATE OR REPLACE FUNCTION public.enforce_invitation_facility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_facility_id uuid;
  inviter_role        text;
BEGIN
  -- Resolve inviter role
  SELECT role INTO inviter_role
  FROM public.profiles
  WHERE id = NEW.invited_by;

  -- super_admin: facility_id is set explicitly by caller — trust it
  IF inviter_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- facility_admin
  SELECT fa.facility_id INTO inviter_facility_id
  FROM public.facility_admins fa
  WHERE fa.user_id = NEW.invited_by
    AND fa.revoked_at IS NULL
  LIMIT 1;

  -- fallback: doctor
  IF inviter_facility_id IS NULL THEN
    SELECT d.facility_id INTO inviter_facility_id
    FROM public.doctors d
    WHERE d.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- fallback: technician
  IF inviter_facility_id IS NULL THEN
    SELECT t.facility_id INTO inviter_facility_id
    FROM public.technicians t
    WHERE t.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  IF inviter_facility_id IS NULL THEN
    RAISE EXCEPTION 'Inviter (%) does not belong to any facility', NEW.invited_by;
  END IF;

  NEW.facility_id := inviter_facility_id;
  RETURN NEW;
END;
$$;
