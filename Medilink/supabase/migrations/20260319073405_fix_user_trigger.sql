-- ================================================================
-- FIX: hams_handle_new_user trigger (profiles not being created)
-- ================================================================

-- 1. Replace function (REMOVE search_path issue)

CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Get role safely
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  -- Prevent role escalation
  IF v_role NOT IN ('patient','doctor','technician','facility_admin') THEN
    v_role := 'patient';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Always ensure patient profile exists (safe)
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- 2. Recreate trigger (safe)

DROP TRIGGER IF EXISTS on_auth_user_created_hams ON auth.users;

CREATE TRIGGER on_auth_user_created_hams
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hams_handle_new_user();