-- =====================================================
-- FIX 1: Ensure ALL users exist in profiles
-- =====================================================

INSERT INTO public.profiles (id, role, full_name)
SELECT 
  u.id,
  'patient',
  COALESCE(u.email, 'User')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- =====================================================
-- FIX 2: Make CURRENT USER super_admin
-- =====================================================

UPDATE public.profiles
SET role = 'super_admin'
WHERE id = auth.uid();


-- =====================================================
-- FIX 3: Ensure patient_profiles exist
-- =====================================================

INSERT INTO public.patient_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE pp.user_id IS NULL;


-- =====================================================
-- FIX 4: (IMPORTANT) Add explicit INSERT policy
-- =====================================================

DROP POLICY IF EXISTS "facilities_insert_super_admin" ON public.facilities;

CREATE POLICY "facilities_insert_super_admin"
ON public.facilities
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
  )
);


-- =====================================================
-- VERIFY
-- =====================================================

SELECT id, role FROM public.profiles WHERE id = auth.uid();