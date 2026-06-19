-- =========================================================
-- FIX: Backfill missing profiles for existing users
-- =========================================================

INSERT INTO public.profiles (id, role, full_name)
SELECT 
  u.id,
  'patient',
  COALESCE(u.email, 'User')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- =========================================================
-- FIX: Ensure every user has patient_profile
-- =========================================================

INSERT INTO public.patient_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE pp.user_id IS NULL;