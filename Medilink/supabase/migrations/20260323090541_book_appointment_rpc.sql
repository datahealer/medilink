-- =========================================================
-- SAFETY: SLOT VALIDATION CONSTRAINT
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_valid_slot'
  ) THEN
    ALTER TABLE public.appointments
    ADD CONSTRAINT check_valid_slot
    CHECK (slot_end > slot_start);
  END IF;
END $$;


-- =========================================================
-- RPC: BOOK APPOINTMENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_facility_id UUID,
  p_slot_date DATE,
  p_slot_start TIME,
  p_slot_end TIME,
  p_type public.appointment_type,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    facility_id,
    slot_date,
    slot_start,
    slot_end,
    type,
    notes,
    status
  )
  VALUES (
    p_patient_id,
    p_doctor_id,
    p_facility_id,
    p_slot_date,
    p_slot_start,
    p_slot_end,
    p_type,
    p_notes,
    'pending'
  )
  RETURNING id INTO v_appointment_id;

  RETURN json_build_object(
    'success', true,
    'appointment_id', v_appointment_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Slot already booked'
    );
END;
$$;

-- ✅ Grants (FIXED)
GRANT EXECUTE ON FUNCTION public.book_appointment(
  UUID, UUID, UUID, DATE, TIME, TIME, public.appointment_type, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.book_appointment(
  UUID, UUID, UUID, DATE, TIME, TIME, public.appointment_type, TEXT
) TO service_role;


-- =========================================================
-- RPC: RESCHEDULE APPOINTMENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_id UUID,
  p_new_date DATE,
  p_new_start TIME,
  p_new_end TIME
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ✅ Check if appointment exists & not cancelled
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments 
    WHERE id = p_id AND status <> 'cancelled'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Appointment not found or already cancelled'
    );
  END IF;

  UPDATE public.appointments
  SET 
    slot_date = p_new_date,
    slot_start = p_new_start,
    slot_end = p_new_end,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'New slot already booked'
    );
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(
  UUID, DATE, TIME, TIME
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(
  UUID, DATE, TIME, TIME
) TO service_role;


-- =========================================================
-- RPC: CANCEL APPOINTMENT WITH CUT-OFF
-- =========================================================

CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_hours INTEGER;
  v_slot_time TIMESTAMP;
BEGIN
  SELECT 
    a.slot_date + a.slot_start,
    fs.cancellation_cutoff_hours
  INTO v_slot_time, v_cutoff_hours
  FROM public.appointments a
  LEFT JOIN public.facility_settings fs 
    ON fs.facility_id = a.facility_id
  WHERE a.id = p_id;

  IF v_slot_time IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Appointment not found'
    );
  END IF;

  IF v_cutoff_hours IS NULL THEN
    v_cutoff_hours := 2;
  END IF;

  IF NOW() > (v_slot_time - (v_cutoff_hours || ' hours')::interval) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Too late to cancel'
    );
  END IF;

  UPDATE public.appointments
  SET 
    status = 'cancelled',
    cancelled_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.cancel_appointment(
  UUID, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_appointment(
  UUID, UUID
) TO service_role;


-- =========================================================
-- RPC: FOLLOW-UP REBOOK
-- =========================================================

CREATE OR REPLACE FUNCTION public.rebook_appointment(
  p_original_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    facility_id,
    type,
    follow_up_of,
    status
  )
  SELECT
    patient_id,
    doctor_id,
    facility_id,
    type,
    id,
    'pending'
  FROM public.appointments
  WHERE id = p_original_id
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Original appointment not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'appointment_id', v_new_id
  );
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.rebook_appointment(
  UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rebook_appointment(
  UUID
) TO service_role;