-- Phase 5.9 — stop the audit_log flood at its source
--
-- THE PROBLEM
-- -----------
-- public.audit_logs had grown to roughly 2.7 M rows / ~1 GB, dominated by
-- doctor `profile_update` entries appearing in bursts every 5 minutes.
--
-- ROOT CAUSE (two independent defects that compound)
--
-- 1. The pg_cron job `auto-unavailable-doctors` (20260326110433) runs
--    every 5 minutes:
--
--        UPDATE public.doctors
--        SET status = 'unavailable'
--        WHERE status_updated_at < NOW() - INTERVAL '15 minutes';
--
--    The predicate does NOT exclude doctors already 'unavailable', and the
--    statement does NOT advance status_updated_at. So every idle doctor stays
--    permanently older than 15 minutes and is re-updated on every single run,
--    forever — a self-perpetuating no-op UPDATE.
--
-- 2. Trigger `audit_doctor_profile` (20260416170000) is AFTER UPDATE FOR EACH
--    ROW with no WHEN clause and no change detection, so each of those no-op
--    updates writes an audit row whose `before` and `after` are identical —
--    it captures specialty/bio/fees, none of which the cron touches.
--
--    ~89 idle doctors x 288 runs/day = ~25,600 meaningless rows per day.
--
--    The same UPDATE also fires `doctors_updated_at`, so doctors.updated_at
--    churns every 5 minutes on every idle doctor — poisoning any
--    cache-invalidation or incremental sync keyed on it, and generating
--    continuous WAL and autovacuum load.
--
-- THE FIX — both halves, so neither alone has to be perfect
--
-- (a) Make the cron statement idempotent: skip rows already 'unavailable', and
--     stamp status_updated_at so a row cannot re-qualify. This alone removes
--     essentially all of the volume.
--
-- (b) Make the audit trigger change-aware with a WHEN clause, so a genuine
--     no-op UPDATE from any source can never produce an audit row again. The
--     trigger function is NOT modified — only the trigger's firing condition —
--     so every legitimate profile change is still recorded exactly as before.
--
-- WHAT IS DELIBERATELY NOT DONE HERE
--   No existing audit row is deleted. Healthcare audit history is not something
--   to bulk-delete inside a schema migration, and note that audit_logs carries
--   TWO rules — `audit_no_delete` (20260319071603) and `audit_logs_no_delete`
--   (20260402153747) — both `ON DELETE ... DO INSTEAD NOTHING`. Any cleanup
--   script will therefore report success while deleting zero rows unless those
--   rules are dropped first. Purging the ~2.7 M historical no-op rows and
--   adopting a retention policy is a separate, explicitly-approved operation.
--
--   The `actor_user_id` on these trigger-written rows is the SUBJECT's user_id,
--   not the acting user's, so they mis-attribute changes. Left alone: changing
--   it alters the meaning of existing history.
--
-- MEDILINK COMPATIBILITY
--   None. No table, column, enum, RPC or policy changes. Doctors are still set
--   'unavailable' after 15 minutes of inactivity — identical observable
--   behaviour, minus the redundant writes. MediLink reads doctors.status via
--   get_my_queue_position and the discovery queries; both are unaffected.
--
-- ROLLBACK
--   Re-create the trigger without the WHEN clause and restore the original
--   cron body from 20260326110433. Reverting reinstates the flood.

-- ---------------------------------------------------------------------------
-- (a) Idempotent auto-unavailable sweep
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'auto-unavailable-doctors' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'auto-unavailable-doctors',
  '*/5 * * * *',
  $$
  UPDATE public.doctors
     SET status = 'unavailable',
         status_updated_at = NOW()
   WHERE status_updated_at < NOW() - INTERVAL '15 minutes'
     AND status IS DISTINCT FROM 'unavailable';
  $$
);

-- ---------------------------------------------------------------------------
-- (b) Change-aware audit triggers
--     The functions are untouched; only the firing conditions change. The
--     column lists mirror exactly what each function records in before/after,
--     so nothing that used to be audited stops being audited.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_doctor_profile ON public.doctors;
CREATE TRIGGER audit_doctor_profile
AFTER UPDATE ON public.doctors
FOR EACH ROW
WHEN (
  OLD.specialty IS DISTINCT FROM NEW.specialty
  OR OLD.bio     IS DISTINCT FROM NEW.bio
  OR OLD.fees    IS DISTINCT FROM NEW.fees
)
EXECUTE FUNCTION public.hams_audit_doctor_profile();

DROP TRIGGER IF EXISTS audit_patient_profile ON public.patient_profiles;
CREATE TRIGGER audit_patient_profile
AFTER UPDATE ON public.patient_profiles
FOR EACH ROW
WHEN (
  OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth
  OR OLD.gender      IS DISTINCT FROM NEW.gender
  OR OLD.blood_group IS DISTINCT FROM NEW.blood_group
)
EXECUTE FUNCTION public.hams_audit_patient_profile();
