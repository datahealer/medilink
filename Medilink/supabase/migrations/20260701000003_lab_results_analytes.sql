-- Lab Results structured analytes (Design Doc p29–30).
--
-- The backend previously stored lab results as delivered *files* only (public.lab_results). The
-- approved mobile screens need structured analytes (value, unit, reference range, high/normal/low
-- flag), a per-report Normal/Flagged status, a result date, and an optional AI "Me insight". This
-- migration adds those without changing any existing column semantics — the file row stays the
-- parent; analytes are a child table. All patient RLS mirrors `lab_results_patient_read` (scoped by
-- patient_profiles.id, NOT auth.uid()). Fully backward compatible.

-- 1. Enums --------------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.lab_flag AS ENUM ('low', 'normal', 'high', 'abnormal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lab_result_status AS ENUM ('normal', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend public.lab_results ------------------------------------------------------------------
ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS status        public.lab_result_status NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS flagged_count INTEGER                  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_date   DATE,          -- shown in UI; orders trends (fallback uploaded_at::date)
  ADD COLUMN IF NOT EXISTS ai_insight    TEXT,          -- optional patient-friendly "Me insight"
  ADD COLUMN IF NOT EXISTS ai_insight_at TIMESTAMPTZ;

-- 3. New child table: analytes ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_result_analytes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_result_id  UUID NOT NULL REFERENCES public.lab_results(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE, -- denormalized for RLS + trends
  analyte_code   TEXT NOT NULL,      -- stable trend key: total_cholesterol, hdl, ldl, triglycerides, vitamin_d…
  analyte_name   TEXT NOT NULL,      -- display: "Total Cholesterol"
  value_numeric  NUMERIC,            -- for flag calc + trends (null when purely qualitative)
  value_text     TEXT,               -- raw/qualitative display
  unit           TEXT,               -- "mg/dL"
  reference_low  NUMERIC,            -- nullable (one-sided ranges allowed)
  reference_high NUMERIC,            -- nullable
  reference_text TEXT,               -- EXACT display, e.g. "<200 mg/dL", ">40 mg/dL", "13–17 g/dL"
  flag           public.lab_flag NOT NULL DEFAULT 'normal',
  measured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- trend ordering (defaults to result_date at ingest)
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Roll-up trigger: maintains lab_results.status + flagged_count from its analytes -----------
CREATE OR REPLACE FUNCTION public.recompute_lab_result_status() RETURNS TRIGGER AS $$
DECLARE rid UUID; n INT;
BEGIN
  rid := COALESCE(NEW.lab_result_id, OLD.lab_result_id);
  SELECT COUNT(*) INTO n FROM public.lab_result_analytes WHERE lab_result_id = rid AND flag <> 'normal';
  UPDATE public.lab_results
    SET flagged_count = n, status = CASE WHEN n > 0 THEN 'flagged' ELSE 'normal' END
    WHERE id = rid;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recompute_lab_status ON public.lab_result_analytes;
CREATE TRIGGER trg_recompute_lab_status
AFTER INSERT OR UPDATE OR DELETE ON public.lab_result_analytes
FOR EACH ROW EXECUTE FUNCTION public.recompute_lab_result_status();

-- 5. Indexes ------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_lra_result       ON public.lab_result_analytes (lab_result_id);
CREATE INDEX IF NOT EXISTS ix_lra_trend        ON public.lab_result_analytes (patient_id, analyte_code, measured_at DESC);
CREATE INDEX IF NOT EXISTS ix_lab_results_status ON public.lab_results (patient_id, status);

-- 6. RLS (mirror lab_results_patient_read / lab_results_facility_write) --------------------------
ALTER TABLE public.lab_result_analytes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lra_patient_read" ON public.lab_result_analytes FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

CREATE POLICY "lra_facility_write" ON public.lab_result_analytes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('facility_admin','technician','super_admin')));

CREATE POLICY "lra_service_role" ON public.lab_result_analytes FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.lab_result_analytes TO authenticated;
GRANT ALL    ON public.lab_result_analytes TO service_role;
