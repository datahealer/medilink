---- this is important -- Realtime setup
-- ALTER PUBLICATION supabase_realtime ADD TABLE doctors;

-- =========================================================
-- F17: DOCTOR LIVE AVAILABILITY STATUS (FINAL SCHEMA)
-- =========================================================

-- =========================================================
-- 1. ADD STATUS COLUMNS
-- =========================================================
ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS status TEXT CHECK (
  status IN ('available','with_patient','on_break','unavailable')
) DEFAULT 'unavailable',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();


-- =========================================================
-- 2. BACKFILL EXISTING DATA
-- =========================================================
UPDATE public.doctors
SET status = 'unavailable'
WHERE status IS NULL;


-- =========================================================
-- 3. INDEX FOR PERFORMANCE
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_doctors_status
ON public.doctors(status);


-- =========================================================
-- 4. ENABLE REALTIME
-- =========================================================
-- DO $$
-- BEGIN
--   BEGIN
--     ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
--   EXCEPTION
--     WHEN duplicate_object THEN
--       -- already added, ignore
--       NULL;
--   END;
-- END $$;


-- =========================================================
-- 5. ENABLE CRON (pg_cron)
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- =========================================================
-- 6. REMOVE EXISTING JOB (SAFE)
-- =========================================================
DO $$
DECLARE
  job_id INT;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'auto-unavailable-doctors'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;


-- =========================================================
-- 7. CREATE CRON JOB (STEP 7)
-- =========================================================
SELECT cron.schedule(
  'auto-unavailable-doctors',
  '*/5 * * * *',
  $$
  UPDATE public.doctors
  SET status = 'unavailable'
  WHERE status_updated_at < NOW() - INTERVAL '15 minutes';
  $$
);


-- =========================================================
-- 8. OPTIONAL: TEST QUERY (MANUAL)
-- =========================================================
-- UPDATE public.doctors
-- SET status = 'available',
--     status_updated_at = NOW() - INTERVAL '20 minutes';