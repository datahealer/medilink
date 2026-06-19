CREATE OR REPLACE FUNCTION public.create_emergency_appointment(
  p_patient_id           UUID,
  p_doctor_id            UUID,
  p_facility_id          UUID,
  p_reason               TEXT,
  p_for_family_member_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  IF p_for_family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE id = p_for_family_member_id AND patient_id = p_patient_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_FAMILY_MEMBER');
  END IF;

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
    emergency_reason,
    for_family_member_id
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
    p_reason,
    p_for_family_member_id
  )
  RETURNING id INTO v_appointment_id;

  RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;
