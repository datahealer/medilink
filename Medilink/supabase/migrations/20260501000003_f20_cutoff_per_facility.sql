-- F-20: Per-facility cancellation + reschedule cutoff hours
-- Adds reschedule_cutoff_hours column, updates cancellation_cutoff_hours default to 3h,
-- and rewrites both RPCs to use TIMESTAMPTZ (UTC) + per-facility settings.

ALTER TABLE public.facility_settings
  ADD COLUMN IF NOT EXISTS reschedule_cutoff_hours INTEGER NOT NULL DEFAULT 4;

ALTER TABLE public.facility_settings
  ALTER COLUMN cancellation_cutoff_hours SET DEFAULT 3;

-- Migrate rows still at old default of 2 → new default of 3
UPDATE public.facility_settings
  SET cancellation_cutoff_hours = 3
  WHERE cancellation_cutoff_hours = 2;

-- ─────────────────────────────────────────────
-- cancel_appointment_safe
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_appointment_safe(
  p_id          UUID,
  p_user_id     UUID,
  p_reason      TEXT DEFAULT NULL,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt      public.appointments%ROWTYPE;
  v_cutoff    INTEGER := 3;
  v_slot_time TIMESTAMPTZ;
BEGIN
  -- Lock row to serialise concurrent cancellations of the same appointment
  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF v_appt.status IN ('cancelled', 'completed', 'no_show') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel appointment in current status');
  END IF;

  -- Treat stored date+time as UTC → TIMESTAMPTZ for timezone-safe comparison with NOW()
  v_slot_time := ((v_appt.slot_date + v_appt.slot_start)::TIMESTAMP) AT TIME ZONE 'UTC';

  IF v_slot_time < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a past appointment');
  END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 3) INTO v_cutoff
  FROM public.facility_settings
  WHERE facility_id = v_appt.facility_id;

  IF v_cutoff IS NULL THEN v_cutoff := 3; END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - (v_cutoff * INTERVAL '1 hour')) THEN
    RETURN json_build_object('success', false, 'error', 'Too late to cancel');
  END IF;

  UPDATE public.appointments
  SET status              = 'cancelled',
      cancelled_by        = p_user_id,
      cancelled_at        = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ─────────────────────────────────────────────
-- reschedule_appointment_atomic
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  p_id          UUID,
  p_user_id     UUID,
  p_new_date    DATE,
  p_new_start   TIME,
  p_new_end     TIME,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt      public.appointments%ROWTYPE;
  v_cutoff    INTEGER := 4;
  v_slot_time TIMESTAMPTZ;
  v_conflict  UUID;
BEGIN
  -- Lock row: serialises concurrent reschedule attempts on the same appointment
  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF v_appt.status NOT IN ('pending', 'confirmed') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reschedule appointment in current status');
  END IF;

  IF p_new_date < CURRENT_DATE THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reschedule to a past date');
  END IF;

  -- Treat stored date+time as UTC → TIMESTAMPTZ for timezone-safe comparison with NOW()
  v_slot_time := ((v_appt.slot_date + v_appt.slot_start)::TIMESTAMP) AT TIME ZONE 'UTC';

  SELECT COALESCE(reschedule_cutoff_hours, 4) INTO v_cutoff
  FROM public.facility_settings
  WHERE facility_id = v_appt.facility_id;

  IF v_cutoff IS NULL THEN v_cutoff := 4; END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - (v_cutoff * INTERVAL '1 hour')) THEN
    RETURN json_build_object('success', false, 'error', 'Too late to reschedule');
  END IF;

  -- Explicit slot availability check before write (unique_violation is the backup)
  SELECT id INTO v_conflict
  FROM public.appointments
  WHERE doctor_id    = v_appt.doctor_id
    AND slot_date    = p_new_date
    AND slot_start   = p_new_start
    AND status IN ('pending', 'confirmed', 'checked_in')
    AND is_emergency = FALSE
    AND id <> p_id;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'SLOT_ALREADY_TAKEN');
  END IF;

  BEGIN
    UPDATE public.appointments
    SET previous_slot_date  = slot_date,
        previous_slot_start = slot_start,
        slot_date           = p_new_date,
        slot_start          = p_new_start,
        slot_end            = p_new_end
    WHERE id = p_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'error', 'SLOT_ALREADY_TAKEN');
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN json_build_object('success', true);
END;
$$;
