-- RPC: atomic walk-in registration (appointment + queue item in one transaction)
CREATE OR REPLACE FUNCTION add_walkin_to_queue(
  p_facility_id         UUID,
  p_doctor_id           UUID,
  p_patient_name        TEXT,
  p_patient_phone       TEXT,
  p_slot_duration_mins  INTEGER DEFAULT 15,
  p_created_by_staff_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now        TIMESTAMPTZ := NOW();
  v_slot_date  DATE        := (v_now AT TIME ZONE 'UTC')::DATE;
  v_slot_start TIME        := (v_now AT TIME ZONE 'UTC')::TIME;
  v_slot_end   TIME        := ((v_now + (p_slot_duration_mins || ' minutes')::INTERVAL) AT TIME ZONE 'UTC')::TIME;
  v_appt_id    UUID;
  v_position   INTEGER;
  v_queue_id   UUID;
BEGIN
  -- 1. Create walk-in appointment (patient_id intentionally NULL for anonymous patients)
  INSERT INTO appointments (
    facility_id, doctor_id, patient_id, patient_name, patient_phone,
    type, status, slot_date, slot_start, slot_end, checked_in_at
  ) VALUES (
    p_facility_id, p_doctor_id, NULL, p_patient_name, p_patient_phone,
    'walk_in', 'checked_in', v_slot_date, v_slot_start, v_slot_end, v_now
  )
  RETURNING id INTO v_appt_id;

  -- 2. Atomic position: lock active queue rows for this facility to prevent race conditions
  -- FOR UPDATE cannot be used directly with aggregates; use subquery to lock rows first
  SELECT COALESCE(MAX(pos), 0) + 1
  INTO v_position
  FROM (
    SELECT position AS pos
    FROM queue_items
    WHERE facility_id = p_facility_id
      AND status IN ('waiting', 'called')
    FOR UPDATE
  ) locked_rows;

  -- 3. Insert queue item linked to the appointment (never NULL)
  INSERT INTO queue_items (
    facility_id, appointment_id, doctor_id,
    patient_name, patient_phone,
    is_walkin, is_online, position, status,
    created_by_staff_id
  ) VALUES (
    p_facility_id, v_appt_id, p_doctor_id,
    p_patient_name, p_patient_phone,
    TRUE, FALSE, v_position, 'waiting',
    p_created_by_staff_id
  )
  RETURNING id INTO v_queue_id;

  RETURN json_build_object(
    'appointment_id', v_appt_id,
    'queue_item_id',  v_queue_id,
    'position',       v_position
  );
END;
$$;

-- Trigger: prevent future queue_items inserts with NULL appointment_id at DB level
CREATE OR REPLACE FUNCTION validate_queue_appointment_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RAISE EXCEPTION 'queue_items.appointment_id must not be NULL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_queue_appointment_id ON public.queue_items;
CREATE TRIGGER enforce_queue_appointment_id
BEFORE INSERT ON public.queue_items
FOR EACH ROW EXECUTE FUNCTION validate_queue_appointment_id();
