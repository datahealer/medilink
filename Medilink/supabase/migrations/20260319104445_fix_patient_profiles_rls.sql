-- =========================================================
-- FIX: patient_profiles RLS (SSR compatible)
-- =========================================================

-- 1. Drop existing policies

DROP POLICY IF EXISTS "patient_profiles_select_own" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_select_staff" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_update_own" ON public.patient_profiles;


-- =========================================================
-- 2. SELECT policies
-- =========================================================

-- ✅ Patient can read their own profile
CREATE POLICY "patient_profiles_select_own"
ON public.patient_profiles
FOR SELECT
TO public
USING (user_id = auth.uid());


-- ✅ Staff can read patient profiles
CREATE POLICY "patient_profiles_select_staff"
ON public.patient_profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('doctor', 'technician', 'facility_admin')
  )
);


-- =========================================================
-- 3. UPDATE policy
-- =========================================================

CREATE POLICY "patient_profiles_update_own"
ON public.patient_profiles
FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- =========================================================
-- DONE
-- =========================================================