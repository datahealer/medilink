-- Ensure authenticated users can execute invite acceptance RPCs.
-- These RPCs are SECURITY DEFINER and still enforce auth.uid() / email checks internally.
 
GRANT USAGE ON SCHEMA public TO authenticated;
 
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;