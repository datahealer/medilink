-- =============================================================
-- TC-012 + ROLE-BASED 2FA ENFORCEMENT (FINAL)
-- =============================================================

-- =============================================================
-- Helper Function (MUST be in PUBLIC schema)
-- =============================================================

CREATE OR REPLACE FUNCTION public.aal2_or_no_2fa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    -- ✅ Patients always allowed
    WHEN p.role = 'patient' THEN true

    -- ✅ Staff with AAL2 session allowed
    WHEN (auth.jwt() ->> 'aal') = 'aal2' THEN true

    -- ✅ Staff without 2FA enabled allowed
    WHEN NOT COALESCE(p.two_factor_enabled, false) THEN true

    -- ❌ Staff with 2FA enabled but not verified → BLOCK
    ELSE false
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

-- =============================================================
-- patient_profiles
-- =============================================================

DROP POLICY IF EXISTS "patient_profiles_select_own" ON public.patient_profiles;
CREATE POLICY "patient_profiles_select_own"
ON public.patient_profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND public.aal2_or_no_2fa()
);

DROP POLICY IF EXISTS "patient_profiles_insert_own" ON public.patient_profiles;
CREATE POLICY "patient_profiles_insert_own"
ON public.patient_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.aal2_or_no_2fa()
);

DROP POLICY IF EXISTS "patient_profiles_update_own" ON public.patient_profiles;
CREATE POLICY "patient_profiles_update_own"
ON public.patient_profiles
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.aal2_or_no_2fa()
)
WITH CHECK (
  user_id = auth.uid()
  AND public.aal2_or_no_2fa()
);

-- =============================================================
-- medical_histories (patient self access)
-- =============================================================

DROP POLICY IF EXISTS "medical_histories_own" ON public.medical_histories;
CREATE POLICY "medical_histories_own"
ON public.medical_histories
FOR ALL
TO authenticated
USING (
  patient_id IN (
    SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
  )
  AND public.aal2_or_no_2fa()
)
WITH CHECK (
  patient_id IN (
    SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
  )
  AND public.aal2_or_no_2fa()
);

-- =============================================================
-- medical_histories (staff read)
-- =============================================================

DROP POLICY IF EXISTS "medical_histories_staff_read" ON public.medical_histories;
CREATE POLICY "medical_histories_staff_read"
ON public.medical_histories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('doctor','facility_admin','technician','super_admin')
  )
  AND public.aal2_or_no_2fa()
);

-- =============================================================
-- appointments (patient access)
-- =============================================================

DROP POLICY IF EXISTS "appointments_patient_read" ON public.appointments;
CREATE POLICY "appointments_patient_read"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  patient_id IN (
    SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
  )
  AND public.aal2_or_no_2fa()
);

DROP POLICY IF EXISTS "appointments_patient_insert" ON public.appointments;
CREATE POLICY "appointments_patient_insert"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  patient_id IN (
    SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
  )
  AND public.aal2_or_no_2fa()
);

DROP POLICY IF EXISTS "appointments_patient_update" ON public.appointments;
CREATE POLICY "appointments_patient_update"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  patient_id IN (
    SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
  )
  AND public.aal2_or_no_2fa()
);

-- =============================================================
-- IMPORTANT NOTES
-- =============================================================

-- ❌ DO NOT APPLY TO:
-- - profiles (needed during login at AAL1)
-- - otp_records (OTP happens before AAL2)
-- - recovery codes tables (or user gets locked out)

-- =============================================================
-- TEST QUERIES (VERY IMPORTANT)
-- =============================================================

-- As PATIENT (should always pass)
SELECT public.aal2_or_no_2fa();

-- As STAFF with AAL1 (should FAIL if 2FA enabled)
SELECT public.aal2_or_no_2fa();

-- Should return 0 rows if AAL1 + 2FA enabled
SELECT * FROM public.patient_profiles;
SELECT * FROM public.medical_histories;
SELECT * FROM public.appointments;