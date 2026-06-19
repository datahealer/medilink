-- Add emergency_reason column to appointments (nullable text)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS emergency_reason TEXT;

-- RPC: create_emergency_appointment
-- Called from /api/appointments/emergency by a patient.
-- Creates a pending emergency appointment without a real slot.
-- Slot (date/time) is assigned later by facility_admin via approve-emergency endpoint.
-- Emergency appointments are exempt from uq_appointment_slot (WHERE is_emergency = FALSE).

-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS public.create_emergency_appointment(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_emergency_appointment(
  p_patient_id  UUID,
  p_doctor_id   UUID,
  p_facility_id UUID,
  p_reason      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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
    status,
    is_emergency,
    emergency_reason
  ) VALUES (
    p_patient_id,
    p_doctor_id,
    p_facility_id,
    CURRENT_DATE,
    '00:00',
    '00:30',
    'in_person',
    'pending',
    TRUE,
    p_reason
  )
  RETURNING id INTO v_appointment_id;

  RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_emergency_appointment(UUID, UUID, UUID, TEXT)
  TO authenticated;
