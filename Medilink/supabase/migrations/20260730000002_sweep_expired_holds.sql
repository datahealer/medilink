-- Phase 5.1 — release abandoned booking holds
--
-- THE DEFECT
-- ----------
-- book_appointment_atomic stamps a 10-minute hold on an unpaid booking
-- (appointments.hold_expires_at, 20260717000002). The availability RPCs treat an
-- expired hold as free in real time, so the slot reappears to patients — but
-- uq_appointment_slot covers status IN ('pending','confirmed','checked_in'), so
-- the stale `pending` row still occupies the index and the next booking fails
-- with SLOT_ALREADY_BOOKED.
--
-- Net effect: every abandoned checkout permanently destroys a bookable slot,
-- while continuing to advertise it as available. Availability and the write
-- path disagree forever.
--
-- 20260717000002 delegated cleanup to a Scheduled Edge Function called
-- `release-expired-holds`. That function does not exist — not in
-- supabase/functions (13 functions, none by that name) and nothing anywhere
-- calls release_unpaid_hold. The RPC has been live and unused since 17 July.
--
-- THE FIX
-- -------
-- No new release logic. sweep_expired_holds() simply drives the existing
-- release_unpaid_hold() RPC, which already encodes every rule: pending-only,
-- never a paid row, detach unpaid payments first, and — because auth.uid() is
-- NULL under pg_cron — only holds that have actually expired.
--
-- pg_cron is used rather than an Edge Function because this project already
-- schedules work that way (gdpr-purge-deleted-accounts in 20260422100000,
-- auto-unavailable-doctors in 20260326110433), so it needs no new deployment
-- surface, no secrets and no network hop.
--
-- SAFETY
--   * Only rows that are `pending`, past hold_expires_at, and have no paid
--     payment are touched — a confirmed, checked-in, completed or paid
--     appointment can never be reached.
--   * LIMIT 500 per run bounds the work; at a 1-minute cadence that is far
--     above any realistic abandonment rate, and a backlog drains steadily.
--   * Each release is independent, so one failure cannot abort the batch.
--
-- MEDILINK COMPATIBILITY
--   Strictly positive: it makes abandoned slots bookable again. MediLink reads
--   availability through get_available_slots / doctors_available_today, which
--   already excluded expired holds — this simply makes the write path agree
--   with what MediLink has been showing all along. No API, table or column
--   changes; nothing MediLink reads changes shape.
--
-- ROLLBACK
--   SELECT cron.unschedule('release-expired-holds');
--   DROP FUNCTION IF EXISTS public.sweep_expired_holds();
--   Reverting restores the slot-leak; the RPC it calls is left untouched.

CREATE OR REPLACE FUNCTION public.sweep_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      RECORD;
  v_released INTEGER := 0;
  v_result   JSON;
BEGIN
  FOR v_row IN
    SELECT a.id
    FROM public.appointments a
    WHERE a.status = 'pending'
      AND a.hold_expires_at IS NOT NULL
      AND a.hold_expires_at < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.appointment_id = a.id AND p.status = 'paid'
      )
    ORDER BY a.hold_expires_at
    LIMIT 500
  LOOP
    BEGIN
      -- auth.uid() is NULL here, so release_unpaid_hold takes its service-role
      -- branch and refuses anything not actually expired.
      v_result := public.release_unpaid_hold(v_row.id);
      IF COALESCE((v_result ->> 'success')::BOOLEAN, FALSE) THEN
        v_released := v_released + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not abort the sweep.
      RAISE WARNING '[sweep_expired_holds] % failed: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_holds() TO service_role;

COMMENT ON FUNCTION public.sweep_expired_holds() IS
  'Releases expired unpaid booking holds by driving release_unpaid_hold(). '
  'Scheduled by pg_cron as release-expired-holds. Without it an abandoned '
  'checkout permanently occupies uq_appointment_slot while the availability '
  'RPCs report the slot as free.';

-- Schedule at a 1-minute cadence (the design in 20260717000002). Unschedule
-- first so re-applying this migration cannot create a duplicate job.
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'release-expired-holds' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'release-expired-holds',
  '* * * * *',
  $$ SELECT public.sweep_expired_holds(); $$
);
