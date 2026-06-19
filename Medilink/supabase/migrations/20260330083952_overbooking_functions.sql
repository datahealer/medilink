-- RPC: GET AVAILABLE SLOTS
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_doctor_id UUID,
  p_date DATE,
  p_include_walkin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end TIME,
  slot_type TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day INT;
  v_buffer INT := 0;
  v_consult INT := 15;
BEGIN
  v_day := EXTRACT(DOW FROM p_date);

  SELECT 
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_buffer IS NULL THEN
    v_buffer := 0;
    v_consult := 15;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT 
      (slot->>'start')::TIME AS start_time,
      COALESCE(slot->>'type', 'normal') AS type
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = v_day
  ),
  adjusted_slots AS (
    SELECT
      start_time,
      (
        start_time 
        + (v_consult || ' minutes')::interval 
        + (v_buffer || ' minutes')::interval
      )::TIME AS end_time,
      type
    FROM raw_slots
  ),
  booked_slots AS (
    SELECT slot_start
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND slot_date = p_date
      AND status IN ('pending','confirmed','checked_in')
      AND is_emergency = FALSE
  )
  SELECT 
    a.start_time,
    a.end_time,
    a.type
  FROM adjusted_slots a
  WHERE 
    NOT EXISTS (
      SELECT 1 
      FROM booked_slots b
      WHERE b.slot_start = a.start_time
    )
    AND (
      p_include_walkin = TRUE 
      OR a.type != 'walkin_reserved'
    )
  ORDER BY a.start_time;
END;
$$;


-- RPC: BOOK APPOINTMENT
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_facility_id UUID,
  p_slot_date DATE,
  p_slot_start TIME,
  p_type TEXT DEFAULT 'in_person',
  p_is_emergency BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_end TIME;
  v_buffer INT := 0;
  v_consult INT := 15;
  v_appointment_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patient_profiles
    WHERE id = p_patient_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_PATIENT');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = EXTRACT(DOW FROM p_slot_date)
    AND (slot->>'start')::TIME = p_slot_start
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_SLOT');
  END IF;

  SELECT 
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_buffer IS NULL THEN
    v_buffer := 0;
    v_consult := 15;
  END IF;

  v_slot_end := (
    p_slot_start 
    + (v_consult || ' minutes')::interval
    + (v_buffer || ' minutes')::interval
  )::TIME;

  BEGIN
    INSERT INTO public.appointments (
      patient_id, doctor_id, facility_id,
      slot_date, slot_start, slot_end,
      type, status, is_emergency
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', FALSE, 'error', 'SLOT_ALREADY_BOOKED');
    WHEN OTHERS THEN
      RETURN json_build_object('success', FALSE, 'error', SQLERRM);
  END;
END;
$$;