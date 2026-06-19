-- =========================================================
-- FIX: AUTO CREATE PROFILE + PATIENT PROFILE ON SIGNUP
-- =========================================================

-- 1️⃣ Ensure function exists (safe, idempotent)
CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- ✅ Safe role extraction
  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'patient';
  END;

  IF v_role IS NULL THEN
    v_role := 'patient';
  END IF;

  -- ✅ Insert into profiles
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ✅ Insert into patient_profiles
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- 2️⃣ Recreate trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created_hams ON auth.users;

CREATE TRIGGER on_auth_user_created_hams
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hams_handle_new_user();


-- 3️⃣ Permissions (VERY IMPORTANT)
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO authenticated;


-- =========================================================
-- FIX: OTP FK SHOULD POINT TO auth.users (NOT profiles)
-- =========================================================

ALTER TABLE public.otp_records
  DROP CONSTRAINT IF EXISTS otp_records_user_id_fkey;

ALTER TABLE public.otp_records
  ADD CONSTRAINT otp_records_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;


-- =========================================================
-- BACKFILL: EXISTING USERS (VERY IMPORTANT)
-- =========================================================

-- 🔁 Profiles backfill
INSERT INTO public.profiles (id, role, full_name)
SELECT
  u.id,
  COALESCE(
    (u.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  ),
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1),
    'User'
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- 🔁 Patient profiles backfill
INSERT INTO public.patient_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE pp.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;


-- =========================================================
-- DONE ✅
-- =========================================================