-- F-52: Lab Results Delivery
-- Creates the 'lab-results' storage bucket, storage RLS policies,
-- and a DB trigger that invokes the notify-lab-result Edge Function.

-- ============================================================
-- 1. Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-results', 'lab-results', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Storage RLS — technician / facility_admin / super_admin can upload
-- ============================================================
CREATE POLICY "lab_results_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lab-results'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('technician', 'facility_admin', 'super_admin')
  )
);

-- ============================================================
-- 3. Storage RLS — read access
--    • facility staff  → all files in bucket
--    • doctors         → all files (row-level enforced in API)
--    • patients        → only their own path: results/{patient_profile_id}/...
-- ============================================================
CREATE POLICY "lab_results_read_storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lab-results'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('technician', 'facility_admin', 'super_admin', 'doctor')
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles pp
      WHERE pp.user_id = auth.uid()
        AND storage.objects.name LIKE 'results/' || pp.id || '/%'
    )
  )
);

-- ============================================================
-- 4. Trigger function — calls Edge Function notify-lab-result
--    Uses pg_net (available on all Supabase projects).
--    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
--    as database settings by Supabase automatically.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_notify_lab_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  text;
  _key  text;
BEGIN
  _url := current_setting('app.settings.supabase_url',  true);
  _key := current_setting('app.settings.service_role_key', true);

  -- Fallback to env vars set by Supabase runtime
  IF _url IS NULL OR _url = '' THEN
    _url := current_setting('supabase.supabase_url', true);
  END IF;
  IF _key IS NULL OR _key = '' THEN
    _key := current_setting('supabase.service_role_key', true);
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/notify-lab-result',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := jsonb_build_object('lab_result_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Attach trigger to lab_results
-- ============================================================
DROP TRIGGER IF EXISTS on_lab_result_inserted ON public.lab_results;

CREATE TRIGGER on_lab_result_inserted
AFTER INSERT ON public.lab_results
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notify_lab_result();
