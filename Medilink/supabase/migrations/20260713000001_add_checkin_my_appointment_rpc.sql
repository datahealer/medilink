-- Migration-drift recovery: public.checkin_my_appointment(uuid, text, text)
--
-- This RPC is live on the remote database (used by web + mobile check-in) but had no
-- committed migration, so a fresh environment could not rebuild it. This file recovers
-- the exact live definition (captured via pg_get_functiondef). CREATE OR REPLACE is
-- idempotent: re-applying it against the live DB reproduces the identical function and
-- changes nothing. Depends on the already-present public._owns_appointment and
-- public.checkin_and_enqueue helpers.

CREATE OR REPLACE FUNCTION public.checkin_my_appointment(p_id uuid, p_patient_name text, p_patient_phone text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;
  IF NOT public._owns_appointment(p_id) THEN
    RETURN json_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  -- checkin_and_enqueue is already SECURITY DEFINER; the wrapper only adds the
  -- ownership gate the web route performs before calling it.
  RETURN public.checkin_and_enqueue(p_id, p_patient_name, p_patient_phone);
END;
$function$;
