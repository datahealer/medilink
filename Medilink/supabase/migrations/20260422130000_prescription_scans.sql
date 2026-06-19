CREATE TABLE public.prescription_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  image_data TEXT,
  medications JSONB NOT NULL DEFAULT '[]',
  doctor_name TEXT,
  prescription_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prescription_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view own scans"
  ON public.prescription_scans FOR SELECT
  TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Patients can insert own scans"
  ON public.prescription_scans FOR INSERT
  TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
    )
  );

CREATE INDEX prescription_scans_patient_id_idx ON public.prescription_scans (patient_id, created_at DESC);



