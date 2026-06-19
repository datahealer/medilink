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
    SELECT a.slot_start AS booked_start
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.slot_date = p_date
      AND a.status IN ('pending','confirmed','checked_in')
      AND a.is_emergency = FALSE
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
      WHERE b.booked_start = a.start_time
    )
    AND (
      p_include_walkin = TRUE 
      OR a.type != 'walkin_reserved'
    )
  ORDER BY a.start_time;

END;
$$;