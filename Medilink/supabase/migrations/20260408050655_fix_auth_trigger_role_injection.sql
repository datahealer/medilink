-- ================================================================
-- SECURITY FIX: Prevent role injection via signup metadata
-- ================================================================
-- The previous trigger read `role` from raw_user_meta_data, which
-- allowed any user to self-assign 'doctor', 'facility_admin', or
-- 'super_admin' by passing { role: "doctor" } in the signup payload.
--
-- New rule: self-signup ALWAYS assigns 'patient'. The only way to
-- become a non-patient is via the invitation accept flow, which uses
-- the service-role client to update profiles.role after verifying a
-- valid HMAC-signed invitation token.
-- ================================================================
 
CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always assign 'patient' on self-signup.
  -- Role elevation happens ONLY via /api/invitations/accept (service role).
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    'patient',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
 
  -- Every new user gets a patient_profiles row (harmless for non-patients).
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
 
  RETURN NEW;
END;
$$;
 
-- Recreate the trigger (function already replaced above, trigger stays)
DROP TRIGGER IF EXISTS on_auth_user_created_hams ON auth.users;
 
CREATE TRIGGER on_auth_user_created_hams
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hams_handle_new_user();
 
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO authenticated;