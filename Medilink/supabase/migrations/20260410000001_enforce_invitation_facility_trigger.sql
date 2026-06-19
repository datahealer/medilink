-- Enforce that invitations always inherit facility_id from the inviter.
-- Prevents facility_id spoofing on INSERT or UPDATE to invitations table.
-- Supports facility_admin, doctor, and technician as inviters.

-- 🔹 1. Create function to enforce facility_id from inviter

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
  FROM facility_admins fa
  WHERE fa.user_id = NEW.invited_by
    AND fa.revoked_at IS NULL
  LIMIT 1;

  -- If inviter is not facility_admin, fallback to doctors
  IF inviter_facility_id IS NULL THEN
    SELECT d.facility_id
    INTO inviter_facility_id
    FROM doctors d
    WHERE d.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- Optional: technician support
  IF inviter_facility_id IS NULL THEN
    SELECT t.facility_id
    INTO inviter_facility_id
    FROM technicians t
    WHERE t.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- 🚨 FINAL ENFORCEMENT
  IF inviter_facility_id IS NULL THEN
    RAISE EXCEPTION 'Inviter does not belong to any facility';
  END IF;

  NEW.facility_id := inviter_facility_id;

  RETURN NEW;
END;
$$;


-- 🔹 2. Attach trigger to invitations table

DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON invitations;

CREATE TRIGGER trg_enforce_invitation_facility
BEFORE INSERT OR UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION enforce_invitation_facility();
