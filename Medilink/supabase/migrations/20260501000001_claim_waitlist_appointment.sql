CREATE OR REPLACE FUNCTION public.claim_waitlist_appointment(
  p_entry_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry    public.waitlist_entries%ROWTYPE;
  v_slot     JSONB;
  v_appt_id  UUID;
BEGIN
  -- Lock the entry to prevent concurrent claims from the same patient
  SELECT * INTO v_entry
  FROM public.waitlist_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ENTRY_NOT_FOUND');
  END IF;

  -- Must be in offered state (concurrency guard: second claim finds 'booked', not 'offered')
  IF v_entry.status <> 'offered' THEN
    RETURN json_build_object('success', false, 'error', 'NOT_OFFERED');
  END IF;

  -- DB-level expiry check (guards against stale UI showing time remaining)
  IF v_entry.expires_at IS NOT NULL AND NOW() > v_entry.expires_at THEN
    UPDATE public.waitlist_entries
    SET status = 'expired'
    WHERE id = p_entry_id;
    RETURN json_build_object('success', false, 'error', 'OFFER_EXPIRED');
  END IF;

  v_slot := v_entry.offered_slot;

  IF v_slot IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_SLOT_DATA');
  END IF;

  -- Atomically insert the appointment.
  -- No doctor_availability check — slot was already validated when first booked.
  BEGIN
    INSERT INTO public.appointments (
      patient_id, doctor_id, facility_id,
      slot_date, slot_start, slot_end,
      type, status, is_emergency
    )
    VALUES (
      v_entry.patient_id,
      (v_slot->>'doctor_id')::UUID,
      (v_slot->>'facility_id')::UUID,
      (v_slot->>'slot_date')::DATE,
      (v_slot->>'slot_start')::TIME,
      (v_slot->>'slot_end')::TIME,
      'in_person',
      'pending',
      false
    )
    RETURNING id INTO v_appt_id;

  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'error', 'SLOT_ALREADY_TAKEN');
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  -- Mark waitlist entry as booked in the same transaction
  UPDATE public.waitlist_entries
  SET status = 'booked'
  WHERE id = p_entry_id
    AND status = 'offered';

  RETURN json_build_object('success', true, 'appointment_id', v_appt_id);
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.claim_waitlist_appointment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_appointment(UUID) TO service_role;
