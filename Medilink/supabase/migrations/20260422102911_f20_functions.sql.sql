-- =========================================================
-- F-20 FUNCTIONS ONLY (SAFE FILE)
-- =========================================================

-- ADD COLUMNS
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS previous_slot_date DATE,
ADD COLUMN IF NOT EXISTS previous_slot_start TIME;

-- =========================================================
-- CANCEL FUNCTION
-- =========================================================
CREATE OR REPLACE FUNCTION public.cancel_appointment_safe(
  p_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled',
      cancelled_by = p_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- =========================================================
-- RESCHEDULE FUNCTION
-- =========================================================
CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  p_id UUID,
  p_user_id UUID,
  p_new_date DATE,
  p_new_start TIME,
  p_new_end TIME,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.appointments
  SET previous_slot_date = slot_date,
      previous_slot_start = slot_start,
      slot_date = p_new_date,
      slot_start = p_new_start,
      slot_end = p_new_end
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;