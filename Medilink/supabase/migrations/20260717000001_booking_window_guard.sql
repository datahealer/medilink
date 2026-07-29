-- Feature F3 · BP-2 — Booking window (7 days) + authoritative server guard
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Booking & Payment §3
-- and Implementation Phases → Phase BP-2.
--
-- Patients may book only within [today, today + window). Window = today + 6
-- (7 calendar days inclusive). The value lives in ONE authoritative place — the
-- `facility_settings.booking_window_days` column (default 7); the shared TS
-- constant BOOKING_WINDOW_DAYS mirrors it for the UI. `book_appointment_atomic`
-- reads it and rejects out-of-window NON-emergency slots with OUTSIDE_BOOKING_WINDOW.
-- Emergency (is_emergency = TRUE) bookings bypass the window entirely.
--
-- The window is ALSO enforced by the availability layer (plan §3: "get_available_slots
-- / doctors_available_today should also not return normal-booking dates beyond the
-- window") — both RPCs are re-created below to clamp to [today, today + window). This
-- makes the availability layer authoritative for the window for every caller (mobile,
-- web, direct RPC), not only the write path.
--
-- Additive & reversible: one nullable-safe column (default 7) + CREATE OR REPLACE of
-- existing functions with the SAME signatures (existing GRANTs still apply — REPLACE
-- preserves privileges).
-- Timezone: these guards use CURRENT_DATE for v1; timezone-aware "today"
-- (Asia/Muscat) is R5, layered in a later phase.
-- Expired-hold exclusion in the availability RPCs is BP-3 (layered later).

-- 1) Authoritative window value (per facility; default 7).
ALTER TABLE public.facility_settings
  ADD COLUMN IF NOT EXISTS booking_window_days INTEGER NOT NULL DEFAULT 7;

-- 2) Re-create book_appointment_atomic with the window guard added. Body is the
--    current function (20260430000002) plus the BP-2 guard; everything else is
--    unchanged (slot validation, buffer/consult fee math, atomic insert under
--    uq_appointment_slot, unique_violation -> SLOT_ALREADY_BOOKED).
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_patient_id           UUID,
  p_doctor_id            UUID,
  p_facility_id          UUID,
  p_slot_date            DATE,
  p_slot_start           TIME,
  p_type                 TEXT    DEFAULT 'in_person',
  p_is_emergency         BOOLEAN DEFAULT FALSE,
  p_for_family_member_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_end       TIME;
  v_buffer         INT := 0;
  v_consult        INT := 15;
  v_window         INT := 7;
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

  IF p_for_family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE id = p_for_family_member_id AND patient_id = p_patient_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_FAMILY_MEMBER');
  END IF;

  -- BP-2: booking-window guard (NON-emergency only). Emergency bypasses the window.
  IF p_is_emergency = FALSE THEN
    SELECT COALESCE(fs.booking_window_days, 7)
    INTO v_window
    FROM public.doctors d
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    WHERE d.id = p_doctor_id;

    IF v_window IS NULL THEN
      v_window := 7;
    END IF;

    IF p_slot_date < CURRENT_DATE
       OR p_slot_date > (CURRENT_DATE + (v_window - 1)) THEN
      RETURN json_build_object('success', FALSE, 'error', 'OUTSIDE_BOOKING_WINDOW');
    END IF;
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
    v_buffer  := 0;
    v_consult := 15;
  END IF;

  v_slot_end := (
    p_slot_start
    + (v_consult || ' minutes')::interval
    + (v_buffer  || ' minutes')::interval
  )::TIME;

  BEGIN
    INSERT INTO public.appointments (
      patient_id, doctor_id, facility_id,
      slot_date, slot_start, slot_end,
      type, status, is_emergency,
      for_family_member_id
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency,
      p_for_family_member_id
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

-- 3) get_available_slots — add the booking-window clamp (availability layer is
--    authoritative for the window, plan §3). Body is the current function
--    (20260330091834) plus reading booking_window_days + an early RETURN when the
--    requested date is outside [today, today + window). Everything else unchanged.
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
  v_day     INT;
  v_buffer  INT := 0;
  v_consult INT := 15;
  v_window  INT := 7;
BEGIN
  v_day := EXTRACT(DOW FROM p_date);

  SELECT
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15),
    COALESCE(fs.booking_window_days, 7)
  INTO v_buffer, v_consult, v_window
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_window IS NULL THEN
    v_window := 7;
  END IF;

  -- BP-2: booking-window clamp — return no slots for normal-booking dates outside
  -- [today, today + window). (Emergency booking uses its own flow, not this picker.)
  IF p_date < CURRENT_DATE OR p_date > (CURRENT_DATE + (v_window - 1)) THEN
    RETURN;
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

-- 4) doctors_available_today — re-create (from BP-1, 20260717000000) with the same
--    booking-window clamp, per-facility. For a "today" call the clamp is naturally
--    satisfied; it additionally prevents reporting availability for a past/out-of-
--    window date if the function is ever called with one. Slot-difference logic
--    is unchanged; GRANTs preserved by REPLACE.
CREATE OR REPLACE FUNCTION public.doctors_available_today(p_date DATE)
RETURNS TABLE (doctor_id UUID)
LANGUAGE sql
STABLE
AS $$
  WITH template_slots AS (
    SELECT
      da.doctor_id,
      (slot->>'start')::TIME               AS start_time,
      COALESCE(slot->>'type', 'normal')    AS slot_type,
      COALESCE(fs.booking_window_days, 7)  AS window_days
    FROM public.doctor_availability da
    JOIN public.doctors d ON d.id = da.doctor_id
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    CROSS JOIN LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.day_of_week = EXTRACT(DOW FROM p_date)::INT
  )
  SELECT DISTINCT ts.doctor_id
  FROM template_slots ts
  WHERE ts.slot_type <> 'walkin_reserved'
    AND p_date >= CURRENT_DATE
    AND p_date <= (CURRENT_DATE + (ts.window_days - 1))
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.doctor_id   = ts.doctor_id
        AND a.slot_date   = p_date
        AND a.slot_start  = ts.start_time
        AND a.status IN ('pending','confirmed','checked_in')
        AND a.is_emergency = FALSE
    );
$$;
