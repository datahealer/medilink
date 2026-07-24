-- Booking reason (tracker Phase 6 · 6.4).
--
-- The patient's "reason for visit" is captured on the Review screen but was dropped
-- before the DB. The `appointments.reason_for_visit TEXT` column already exists
-- (20260319071603_hams_complete_schema); only the write path was unwired.
--
-- Add `p_reason` to book_appointment_atomic. Because adding a parameter changes the
-- function signature, CREATE OR REPLACE would create a second (ambiguous) overload —
-- so DROP the exact 8-arg version first, recreate as a single 9-arg function, and
-- re-grant. Backward compatible: `p_reason` defaults to NULL, so any 8-arg caller
-- still resolves to this one function with reason = NULL. Everything else is unchanged
-- (verbatim from 20260717000002_pending_hold_ttl).

DROP FUNCTION IF EXISTS public.book_appointment_atomic(UUID, UUID, UUID, DATE, TIME, TEXT, BOOLEAN, UUID);

CREATE FUNCTION public.book_appointment_atomic(
  p_patient_id           UUID,
  p_doctor_id            UUID,
  p_facility_id          UUID,
  p_slot_date            DATE,
  p_slot_start           TIME,
  p_type                 TEXT    DEFAULT 'in_person',
  p_is_emergency         BOOLEAN DEFAULT FALSE,
  p_for_family_member_id UUID    DEFAULT NULL,
  p_reason               TEXT    DEFAULT NULL
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
      for_family_member_id, hold_expires_at,
      reason_for_visit
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency,
      p_for_family_member_id,
      -- BP-3: 10-minute unpaid-hold TTL for online-payment (non-emergency) bookings.
      CASE WHEN p_is_emergency THEN NULL ELSE (now() + INTERVAL '10 minutes') END,
      NULLIF(btrim(p_reason), '')
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

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(UUID, UUID, UUID, DATE, TIME, TEXT, BOOLEAN, UUID, TEXT)
  TO authenticated, service_role;
