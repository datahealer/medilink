-- =========================================
-- FIX patient_profiles RLS (FINAL SAFE)
-- =========================================

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_profiles_select_own" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_update_own" ON public.patient_profiles;

-- ✅ Allow authenticated users to read their profile
CREATE POLICY "patient_profiles_select_own"
ON public.patient_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ✅ Allow insert for own profile
CREATE POLICY "patient_profiles_insert_own"
ON public.patient_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ✅ Allow update
CREATE POLICY "patient_profiles_update_own"
ON public.patient_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================
-- FIX family_members RLS (STRICT)
-- =========================================

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_own" ON public.family_members;

CREATE POLICY "family_members_own"
ON public.family_members
FOR ALL
TO authenticated
USING (
  patient_id IN (
    SELECT id FROM public.patient_profiles
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  patient_id IN (
    SELECT id FROM public.patient_profiles
    WHERE user_id = auth.uid()
  )
);