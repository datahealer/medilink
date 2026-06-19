CREATE INDEX IF NOT EXISTS idx_family_members_patient_id
  ON public.family_members(patient_id);
