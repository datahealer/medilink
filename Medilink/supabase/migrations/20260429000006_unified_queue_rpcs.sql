-- Shared atomic queue insert used by all callers (walk-in, check-in, appointment-based)
CREATE OR REPLACE FUNCTION enqueue_appointment(
  p_appointment_id      UUID,
  p_facility_id         UUID,
  p_doctor_id           UUID,
  p_patient_name        TEXT,
  p_patient_phone       TEXT,
  p_is_walkin           BOOLEAN DEFAULT FALSE,
  p_is_online           BOOLEAN DEFAULT FALSE,
  p_created_by_staff_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position INTEGER;
  v_queue_id UUID;
BEGIN
  -- Idempotency: return existing active queue item if one already exists for this appointment
  SELECT id INTO v_queue_id
  FROM queue_items
  WHERE appointment_id = p_appointment_id
    AND status IN ('waiting', 'called')
  LIMIT 1;

  IF v_queue_id IS NOT NULL THEN
    RETURN json_build_object('queue_item_id', v_queue_id, 'already_queued', TRUE);
  END IF;

  -- Atomic position: lock active rows first, then aggregate in outer query
  SELECT COALESCE(MAX(pos), 0) + 1
  INTO v_position
  FROM (
    SELECT position AS pos
    FROM queue_items
    WHERE facility_id = p_facility_id
      AND status IN ('waiting', 'called')
    FOR UPDATE
  ) locked_rows;

  INSERT INTO queue_items (
    facility_id, appointment_id, doctor_id,
    patient_name, patient_phone,
    is_walkin, is_online, position, status,
    created_by_staff_id
  ) VALUES (
    p_facility_id, p_appointment_id, p_doctor_id,
    p_patient_name, p_patient_phone,
    p_is_walkin, p_is_online, v_position, 'waiting',
    p_created_by_staff_id
  )
  RETURNING id INTO v_queue_id;

  RETURN json_build_object(
    'queue_item_id',  v_queue_id,
    'position',       v_position,
    'already_queued', FALSE
  );
END;
$$;

-- Walk-in: create appointment + enqueue atomically
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
  v_now          TIMESTAMPTZ := NOW();
  v_slot_date    DATE        := (v_now AT TIME ZONE 'UTC')::DATE;
  v_slot_start   TIME        := (v_now AT TIME ZONE 'UTC')::TIME;
  v_slot_end     TIME;
  v_appt_id      UUID;
  v_queue_result JSON;
BEGIN
  IF p_slot_duration_mins <= 0 THEN
    RAISE EXCEPTION 'Invalid slot duration: must be > 0';
  END IF;

  v_slot_end := ((v_now + (p_slot_duration_mins || ' minutes')::INTERVAL) AT TIME ZONE 'UTC')::TIME;

  INSERT INTO appointments (
    facility_id, doctor_id, patient_id, patient_name, patient_phone,
    type, status, slot_date, slot_start, slot_end, checked_in_at
  ) VALUES (
    p_facility_id, p_doctor_id, NULL, p_patient_name, p_patient_phone,
    'walk_in', 'checked_in', v_slot_date, v_slot_start, v_slot_end, v_now
  )
  RETURNING id INTO v_appt_id;

  SELECT enqueue_appointment(
    v_appt_id, p_facility_id, p_doctor_id,
    p_patient_name, p_patient_phone,
    TRUE, FALSE, p_created_by_staff_id
  ) INTO v_queue_result;

  RETURN json_build_object(
    'appointment_id', v_appt_id,
    'queue_item_id',  v_queue_result->>'queue_item_id',
    'position',       (v_queue_result->>'position')::INTEGER
  );
END;
$$;

-- Check-in: lock appointment row, update status, then enqueue atomically
CREATE OR REPLACE FUNCTION checkin_and_enqueue(
  p_appointment_id UUID,
  p_patient_name   TEXT,
  p_patient_phone  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt         RECORD;
  v_now          TIMESTAMPTZ := NOW();
  v_queue_result JSON;
BEGIN
  -- Lock appointment to serialize concurrent check-ins for the same appointment
  SELECT id, facility_id, doctor_id, status
  INTO v_appt
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  -- Already checked in: just ensure a queue item exists
  IF v_appt.status = 'checked_in' THEN
    SELECT enqueue_appointment(
      p_appointment_id, v_appt.facility_id, v_appt.doctor_id,
      p_patient_name, p_patient_phone, FALSE, TRUE, NULL
    ) INTO v_queue_result;

    RETURN json_build_object(
      'already_checked_in', TRUE,
      'queue_item_id',      v_queue_result->>'queue_item_id',
      'position',           (v_queue_result->>'position')::INTEGER,
      'checked_in_at',      v_now
    );
  END IF;

  IF v_appt.status != 'confirmed' THEN
    RAISE EXCEPTION 'invalid_status:%', v_appt.status;
  END IF;

  UPDATE appointments
  SET status = 'checked_in', checked_in_at = v_now
  WHERE id = p_appointment_id;

  SELECT enqueue_appointment(
    p_appointment_id, v_appt.facility_id, v_appt.doctor_id,
    p_patient_name, p_patient_phone, FALSE, TRUE, NULL
  ) INTO v_queue_result;

  RETURN json_build_object(
    'already_checked_in', FALSE,
    'queue_item_id',      v_queue_result->>'queue_item_id',
    'position',           (v_queue_result->>'position')::INTEGER,
    'checked_in_at',      v_now
  );
END;
$$;

-- DB-level protections

-- Unique active position per facility (prevents duplicate queue positions)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_queue_position
ON queue_items(facility_id, position)
WHERE status IN ('waiting', 'called');

-- One active queue item per appointment (prevents double-queueing)
CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_active_queue
ON queue_items(appointment_id)
WHERE status IN ('waiting', 'called');

-- Enhanced validation trigger: enforce appointment_id, facility_id, status all non-null
CREATE OR REPLACE FUNCTION validate_queue_item()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RAISE EXCEPTION 'queue_items.appointment_id must not be NULL';
  END IF;
  IF NEW.facility_id IS NULL THEN
    RAISE EXCEPTION 'queue_items.facility_id must not be NULL';
  END IF;
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION 'queue_items.status must not be NULL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_queue_item_integrity ON public.queue_items;
CREATE TRIGGER enforce_queue_item_integrity
BEFORE INSERT ON public.queue_items
FOR EACH ROW EXECUTE FUNCTION validate_queue_item();

-- Drop the weaker trigger from the previous migration (replaced by enforce_queue_item_integrity)
DROP TRIGGER IF EXISTS enforce_queue_appointment_id ON public.queue_items;
