-- Fix: enforce_invitation_facility trigger function was missing SET search_path = public.
-- Without it, bare table names (facility_admins, doctors, technicians) fail to resolve
-- inside the PL/pgSQL trigger context with "relation does not exist".

CREATE OR REPLACE FUNCTION enforce_invitation_facility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_facility_id uuid;
BEGIN
  -- Get facility_id from facility_admins (inviter)
  SELECT fa.facility_id
  INTO inviter_facility_id
  FROM public.facility_admins fa
  WHERE fa.user_id = NEW.invited_by
    AND fa.revoked_at IS NULL
  LIMIT 1;

  -- Fallback: doctor
  IF inviter_facility_id IS NULL THEN
    SELECT d.facility_id
    INTO inviter_facility_id
    FROM public.doctors d
    WHERE d.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- Fallback: technician
  IF inviter_facility_id IS NULL THEN
    SELECT t.facility_id
    INTO inviter_facility_id
    FROM public.technicians t
    WHERE t.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  IF inviter_facility_id IS NULL THEN
    RAISE EXCEPTION 'Inviter does not belong to any facility';
  END IF;

  NEW.facility_id := inviter_facility_id;

  RETURN NEW;
END;
$$;
