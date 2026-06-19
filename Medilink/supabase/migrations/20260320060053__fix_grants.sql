-- =========================================
-- FIX GRANTS (CRITICAL)
-- =========================================

-- Allow schema usage
GRANT USAGE ON SCHEMA public TO authenticated;

-- patient_profiles
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.patient_profiles
TO authenticated;

-- family_members
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.family_members
TO authenticated;

-- profiles (used in joins / auth)
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;