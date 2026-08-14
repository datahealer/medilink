-- =============================================================================
-- Automatic no-show lifecycle for appointments nobody ever resolved
-- =============================================================================
-- Approved by HAMS. `appointments` is a table shared with the HAMS staff platform, and
-- docs/QUEUE_BACKEND_FOR_MEDILINK.md assigns no-show to HAMS staff authority — this
-- migration exists because that authority was explicitly extended to cover the one case
-- HAMS's own mechanism structurally cannot reach.
--
-- ── THE GAP THIS FILLS ──
--
-- HAMS already resolves appointments two ways, and both work in production today
-- (verified 2026-08-14: completed = 20 rows, no_show = 4 rows):
--
--   • completion — POST /api/appointments/[id]/complete, role-gated, conditional on
--     status IN ('confirmed','checked_in'); also src/lib/services/queueSync.ts.
--   • no-show    — queue_no_show() (20260731000002), which sets queue_items.status AND
--     appointments.status = 'no_show' where status IN ('confirmed','checked_in').
--
-- The no-show path runs off a QUEUE ITEM, and a queue item is created at CHECK-IN. So a
-- patient who simply never arrives is never enqueued, has no queue item, and can never be
-- marked no-show by any existing path. Their appointment stays `confirmed` forever — which
-- is why an appointment from 24 July was still rendering as "Upcoming" three weeks later.
--
-- This sweeper covers exactly that hole and nothing else: confirmed/approved, never checked
-- in, slot long finished.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──
--
--   • never touches `checked_in` — the patient demonstrably arrived. Whether the visit was
--     completed is a clinical fact this system does not know, and inventing one is the same
--     class of error as the fabricated vitals chart removed from AI Insights.
--   • never touches `pending` — an unpaid booking is the payment/hold-expiry lifecycle's
--     job (release_unpaid_hold + sweep_expired_holds, 20260730000002). Two owners for one
--     row is how state machines rot.
--   • never touches `cancelled` / `completed` / `no_show` — already resolved.
--   • never writes `completed`. Only a clinician may assert that.
--   • touches no HAMS route, no queue RPC, no enum, and no RLS policy.
--
-- ── THE COMPLETION RACE, AND WHY THE THRESHOLD IS SIX HOURS ──
--
-- HAMS's completion route updates with `.in("status", ["confirmed","checked_in"])` and,
-- when that matches nothing, returns `{ success: true, message: "Already completed or
-- invalid state" }` — a SILENT SUCCESS. So if this sweeper flipped a row to `no_show`
-- before a doctor completed it, the doctor would be told the consultation was recorded when
-- it was not. That is a clinical record-keeping failure, and it is the single reason this
-- runs nightly on a six-hour threshold rather than minutes after the slot.
--
-- With the defaults below, a clinic's last 20:00 appointment is not swept until 02:00 the
-- next morning, and a 09:00 appointment not until seventeen hours later. Every appointment
-- gets the remainder of its working day.
--
-- ── THE AUDIT-LOG FLOOD PRECEDENT ──
--
-- 20260730000003 documents audit_logs reaching ~2.7M rows / ~1GB because a pg_cron UPDATE
-- predicate did not exclude rows already in the target state, so the same rows were rewritten
-- every five minutes forever. `audit_appointment` (20260416170000) is still AFTER INSERT OR
-- UPDATE FOR EACH ROW with no WHEN clause, so the same trap is live here.
--
-- The predicate below matches ONLY status IN ('confirmed','approved'). A swept row becomes
-- `no_show` and can never satisfy it again, so each appointment transitions exactly once and
-- writes exactly one audit row. p_limit bounds a single run on top of that.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ACTIVATION FLOOR
-- -----------------------------------------------------------------------------
-- On 2026-08-14 production held ~26 `confirmed` and ~21 `checked_in` appointments that had
-- ALL already elapsed, the oldest dating to 2026-03-31. Sweeping them would rewrite four and
-- a half months of history in one run and take the clinic's no-show count from 4 to 30 —
-- a 650% jump in `analytics_summary.no_show_rate` and `staff_metrics.no_show_rate`, both of
-- which HAMS dashboards display. Retroactively restating a clinic's historical performance
-- is not this migration's decision to make.
--
-- So the sweeper only ever considers appointments whose slot date is ON OR AFTER the floor,
-- and the floor is the Oman date on which this migration is first applied.
--
-- Stored in `system_config` (the existing key/value config table, 20260319071603) rather
-- than hardcoded, for three reasons: re-applying the migration cannot move it (ON CONFLICT
-- DO NOTHING), operations can read it without reading SQL, and if the clinic later decides
-- to sweep some history a super_admin can lower it deliberately rather than by code change.
INSERT INTO public.system_config (key, value)
VALUES (
  'appointment_missed_sweep',
  jsonb_build_object(
    'activation_floor', public.oman_today()::TEXT,
    'note', 'Appointments with slot_date before this Oman date are never auto-marked no_show.'
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.missed_sweep_activation_floor()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- A missing or malformed row must FAIL CLOSED. Returning NULL would make the sweeper's
  -- `slot_date >= v_floor` comparison NULL for every row, which matches nothing — but that
  -- is luck, not design, so the caller raises explicitly instead.
  SELECT (value ->> 'activation_floor')::DATE
    FROM public.system_config
   WHERE key = 'appointment_missed_sweep';
$$;

COMMENT ON FUNCTION public.missed_sweep_activation_floor() IS
  'Oman date on or after which sweep_missed_appointments() may auto-mark an appointment '
  'no_show. Set once when 20260814000000 was first applied; protects the pre-existing '
  'historical backlog from retroactive restatement.';

REVOKE ALL ON FUNCTION public.missed_sweep_activation_floor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.missed_sweep_activation_floor() TO service_role;

-- -----------------------------------------------------------------------------
-- 2. THE SWEEPER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_missed_appointments(
  p_threshold_minutes INT DEFAULT 360,
  p_limit             INT DEFAULT 500
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_floor  DATE;
  v_cutoff TIMESTAMP;   -- Oman wall clock, same frame as slot_date + slot_end
  v_swept  INT;
BEGIN
  -- ── Guard: never sweep faster than the UI admits ──
  -- The mobile UI derives "Missed" at slot_end + 60 minutes
  -- (shared/src/utils/appointmentLifecycle.ts, MISSED_GRACE_MINUTES). If the database
  -- transitioned SOONER than that, there would be a window where the row says `no_show`
  -- while the app still shows "Upcoming" — the patient sees an upcoming appointment the
  -- clinic has already written off. Keeping the backend threshold >= the UI grace makes the
  -- two monotonic: the UI says Missed first, the database confirms it later, and they never
  -- contradict. This is enforced here rather than documented, because a caller passing 30
  -- would reintroduce the exact bug this lifecycle work was done to remove.
  IF p_threshold_minutes IS NULL OR p_threshold_minutes < 60 THEN
    RAISE EXCEPTION
      'sweep_missed_appointments: p_threshold_minutes must be >= 60 to stay consistent with the 60-minute UI grace; got %',
      p_threshold_minutes;
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'sweep_missed_appointments: p_limit must be a positive integer; got %', p_limit;
  END IF;

  v_floor := public.missed_sweep_activation_floor();
  IF v_floor IS NULL THEN
    -- Fail closed rather than sweeping the entire table.
    RAISE EXCEPTION
      'sweep_missed_appointments: activation floor missing — system_config key ''appointment_missed_sweep'' is absent or malformed. Refusing to sweep.';
  END IF;

  -- Both sides of the comparison are naive Oman wall clock: `slot_date + slot_end` is how
  -- the schema stores the appointment (DATE + TIME, no zone), and oman_now() is
  -- `now() AT TIME ZONE 'Asia/Muscat'` (20260811000000). Comparing against a UTC now()
  -- would sweep four hours early — the same defect class as the booking-window bug.
  v_cutoff := public.oman_now() - make_interval(mins => p_threshold_minutes);

  WITH candidates AS (
    SELECT a.id
      FROM public.appointments a
     WHERE a.status IN ('confirmed', 'approved')
       AND a.slot_date >= v_floor
       AND (a.slot_date + a.slot_end) <= v_cutoff
     ORDER BY a.slot_date, a.slot_start
     LIMIT p_limit
     -- SKIP LOCKED is the concurrency safeguard. A row being cancelled, checked in,
     -- rescheduled or completed in another transaction is row-locked; rather than block
     -- behind it (holding the sweep open) or fight it, we skip it and let the next nightly
     -- run reconsider it against whatever status it settled on. The competing write always
     -- wins, which is the correct precedence: every one of those is a human action and this
     -- is a janitor.
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.appointments a
     SET status = 'no_show'
    FROM candidates c
   WHERE a.id = c.id
     -- Re-asserted INSIDE the UPDATE, deliberately. Under READ COMMITTED a row that was
     -- concurrently committed between planning and locking is re-checked against the new
     -- version, so a row that became `checked_in`/`cancelled`/`completed` in the meantime
     -- drops out here even though it qualified when the CTE was planned. This is the same
     -- conditional-claim pattern the payment webhook uses to stay idempotent.
     AND a.status IN ('confirmed', 'approved');

  GET DIAGNOSTICS v_swept = ROW_COUNT;

  RETURN json_build_object(
    'success',           TRUE,
    'swept',             v_swept,
    'threshold_minutes', p_threshold_minutes,
    'limit',             p_limit,
    'activation_floor',  v_floor,
    'oman_cutoff',       v_cutoff
  );
END;
$$;

COMMENT ON FUNCTION public.sweep_missed_appointments(INT, INT) IS
  'Marks confirmed/approved appointments no_show when the patient never checked in and the '
  'slot ended more than p_threshold_minutes ago in Asia/Muscat. Never touches pending, '
  'checked_in, cancelled, completed or existing no_show rows, and never sweeps before the '
  'activation floor. Scheduled by pg_cron as sweep-missed-appointments. Complements '
  'queue_no_show(), which can only reach patients who were enqueued at check-in.';

REVOKE ALL ON FUNCTION public.sweep_missed_appointments(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_missed_appointments(INT, INT) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. SCHEDULE
-- -----------------------------------------------------------------------------
-- 22:00 UTC = 02:00 Asia/Muscat (UTC+4, no DST since 1977). pg_cron on Supabase interprets
-- schedules in UTC.
--
-- WHY THE CRON TIMEZONE IS NOT A CORRECTNESS DEPENDENCY: the hour below decides only WHEN a
-- transition becomes visible, never WHETHER it is correct — the function re-derives the
-- cutoff from oman_now() on every run. If pg_cron were configured in Asia/Muscat instead,
-- this would fire at 22:00 Oman, at which point a 20:00 appointment is only two hours old,
-- fails the six-hour threshold and is simply left for the following night. A misconfigured
-- schedule can therefore only DELAY a transition; it can never cause a premature one. That
-- asymmetry is deliberate — the repository has no existing daily-cron precedent that
-- documents its timezone (the GDPR purge's '0 2 * * *' does not say), so the design refuses
-- to depend on it.
--
-- Unschedule-first so re-applying this migration cannot create a duplicate job
-- (the pattern from 20260730000002 and 20260730000003).
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'sweep-missed-appointments' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'sweep-missed-appointments',
  '0 22 * * *',
  $$ SELECT public.sweep_missed_appointments(); $$
);

-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DO $$ DECLARE v BIGINT; BEGIN
--     SELECT jobid INTO v FROM cron.job WHERE jobname = 'sweep-missed-appointments' LIMIT 1;
--     IF v IS NOT NULL THEN PERFORM cron.unschedule(v); END IF;
--   END $$;
--   DROP FUNCTION IF EXISTS public.sweep_missed_appointments(INT, INT);
--   DROP FUNCTION IF EXISTS public.missed_sweep_activation_floor();
--   DELETE FROM public.system_config WHERE key = 'appointment_missed_sweep';
--
-- Rows already transitioned are identifiable for manual reversal: status = 'no_show' with an
-- audit_logs entry whose actor is the sweeper's definer role rather than a staff user.
-- =============================================================================
