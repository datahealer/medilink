-- Regression tests for 20260814000000_appointment_missed_sweep.sql
-- =============================================================================
-- Covers cases A–N from the approved no-show lifecycle spec.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/appointment_missed_sweep_test.sql
--   supabase db query --linked --file supabase/tests/appointment_missed_sweep_test.sql
--   (NB: `supabase db execute` does not exist in CLI v2 — the subcommand is `db query`, and
--    `--linked` is required or it targets a local Docker database instead of the project.)
--
-- Every assertion RAISEs on failure, so a non-zero exit means a regression.
--
-- WRITES: PART B and PART C create disposable fixture rows inside transactions that are
-- ROLLED BACK. Nothing is committed and no production appointment is modified. PART A is
-- pure inspection and writes nothing at all.
--
-- The fixtures use fixed sentinel UUIDs so a failed/aborted run leaves nothing to clean up
-- (the rollback handles it) and so a stray row would be obvious if one ever escaped.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — contract, security model and guards (no fixtures, no writes)
-- =============================================================================
DO $$
DECLARE
  v_secdef  BOOLEAN;
  v_config  TEXT;
  v_floor   DATE;
  v_has_pub BOOLEAN;
BEGIN
  -- ── Security model ────────────────────────────────────────────────────────
  SELECT p.prosecdef INTO v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sweep_missed_appointments';
  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'A FAIL: sweep_missed_appointments() does not exist';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'A FAIL: sweep_missed_appointments must be SECURITY DEFINER';
  END IF;

  -- search_path must be pinned, or a SECURITY DEFINER function is hijackable.
  SELECT array_to_string(p.proconfig, ',') INTO v_config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sweep_missed_appointments';
  IF v_config IS NULL OR v_config NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'A FAIL: search_path not pinned to "public, pg_temp" (got %)', v_config;
  END IF;

  -- Neither anon nor authenticated may execute it — it writes to a shared HAMS table.
  SELECT bool_or(has_function_privilege(r, 'public.sweep_missed_appointments(int,int)', 'EXECUTE'))
    INTO v_has_pub
    FROM unnest(ARRAY['anon', 'authenticated']) AS r;
  IF COALESCE(v_has_pub, FALSE) THEN
    RAISE EXCEPTION 'A FAIL: anon/authenticated can EXECUTE sweep_missed_appointments';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.sweep_missed_appointments(int,int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A FAIL: service_role cannot EXECUTE sweep_missed_appointments';
  END IF;

  -- ── Activation floor exists and is a real date ────────────────────────────
  v_floor := public.missed_sweep_activation_floor();
  IF v_floor IS NULL THEN
    RAISE EXCEPTION 'A FAIL: activation floor is NULL — system_config key missing/malformed';
  END IF;

  -- ── Threshold guard: must refuse anything below the 60-minute UI grace ─────
  BEGIN
    PERFORM public.sweep_missed_appointments(30, 10);
    RAISE EXCEPTION 'A FAIL: a 30-minute threshold was accepted; it must be refused (UI grace is 60)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%must be >= 60%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.sweep_missed_appointments(360, 0);
    RAISE EXCEPTION 'A FAIL: p_limit = 0 was accepted; it must be refused';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%p_limit must be a positive integer%' THEN RAISE; END IF;
  END;

  -- ── The cron job exists exactly once ──────────────────────────────────────
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'sweep-missed-appointments') <> 1 THEN
    RAISE EXCEPTION 'A FAIL: expected exactly one sweep-missed-appointments cron job, found %',
      (SELECT count(*) FROM cron.job WHERE jobname = 'sweep-missed-appointments');
  END IF;

  RAISE NOTICE 'PART A passed: security model, floor, guards and schedule sound.';
END $$;

-- =============================================================================
-- PART B — transition matrix (cases A–I, M, N). Fixtures, rolled back.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_patient   UUID;
  v_doctor    UUID;
  v_facility  UUID;
  v_floor     DATE;
  v_past      DATE;
  v_future    DATE;
  v_before    DATE;
  v_status    TEXT;
  v_result    JSON;
  v_id_conf   UUID := '0f000000-0000-4000-8000-000000000001';
  v_id_appr   UUID := '0f000000-0000-4000-8000-000000000002';
  v_id_chk    UUID := '0f000000-0000-4000-8000-000000000003';
  v_id_pend   UUID := '0f000000-0000-4000-8000-000000000004';
  v_id_canc   UUID := '0f000000-0000-4000-8000-000000000005';
  v_id_comp   UUID := '0f000000-0000-4000-8000-000000000006';
  v_id_nosh   UUID := '0f000000-0000-4000-8000-000000000007';
  v_id_futr   UUID := '0f000000-0000-4000-8000-000000000008';
  v_id_hist   UUID := '0f000000-0000-4000-8000-000000000009';
  v_id_resch  UUID := '0f000000-0000-4000-8000-00000000000a';
BEGIN
  -- Borrow any existing patient/doctor/facility so FKs are satisfied without inventing
  -- identities. Read-only reuse; nothing about them is modified.
  SELECT id INTO v_patient  FROM public.patient_profiles LIMIT 1;
  SELECT id INTO v_doctor   FROM public.doctors          LIMIT 1;
  SELECT id INTO v_facility FROM public.facilities       LIMIT 1;
  IF v_patient IS NULL OR v_doctor IS NULL OR v_facility IS NULL THEN
    RAISE EXCEPTION 'PART B SKIPPED: needs at least one patient_profile, doctor and facility';
  END IF;

  v_floor  := public.missed_sweep_activation_floor();
  -- Yesterday in Oman: on or after the floor (so sweepable) and long elapsed.
  v_past   := GREATEST(v_floor, public.oman_today() - 1);
  v_future := public.oman_today() + 7;
  v_before := v_floor - 1;   -- strictly before the activation floor

  INSERT INTO public.appointments
    (id, patient_id, doctor_id, facility_id, slot_date, slot_start, slot_end, status, type)
  VALUES
    (v_id_conf,  v_patient, v_doctor, v_facility, v_past,   TIME '09:00', TIME '09:30', 'confirmed',  'in_person'),
    (v_id_appr,  v_patient, v_doctor, v_facility, v_past,   TIME '10:00', TIME '10:30', 'approved',   'in_person'),
    (v_id_chk,   v_patient, v_doctor, v_facility, v_past,   TIME '11:00', TIME '11:30', 'checked_in', 'in_person'),
    (v_id_pend,  v_patient, v_doctor, v_facility, v_past,   TIME '12:00', TIME '12:30', 'pending',    'in_person'),
    (v_id_canc,  v_patient, v_doctor, v_facility, v_past,   TIME '13:00', TIME '13:30', 'cancelled',  'in_person'),
    (v_id_comp,  v_patient, v_doctor, v_facility, v_past,   TIME '14:00', TIME '14:30', 'completed',  'in_person'),
    (v_id_nosh,  v_patient, v_doctor, v_facility, v_past,   TIME '15:00', TIME '15:30', 'no_show',    'in_person'),
    (v_id_futr,  v_patient, v_doctor, v_facility, v_future, TIME '09:00', TIME '09:30', 'confirmed',  'in_person'),
    (v_id_hist,  v_patient, v_doctor, v_facility, v_before, TIME '09:00', TIME '09:30', 'confirmed',  'in_person'),
    -- I. "Rescheduled": the RPC mutates slot_date/slot_end in place, so a rescheduled
    --    appointment is simply one whose CURRENT slot is in the future. It must be safe.
    (v_id_resch, v_patient, v_doctor, v_facility, v_future, TIME '16:00', TIME '16:30', 'confirmed',  'in_person');

  v_result := public.sweep_missed_appointments(360, 500);
  RAISE NOTICE 'sweep returned: %', v_result;

  -- A. confirmed + elapsed  → no_show
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_conf;
  IF v_status <> 'no_show' THEN RAISE EXCEPTION 'A FAIL: confirmed+elapsed = %, expected no_show', v_status; END IF;

  -- B. approved + elapsed   → no_show
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_appr;
  IF v_status <> 'no_show' THEN RAISE EXCEPTION 'B FAIL: approved+elapsed = %, expected no_show', v_status; END IF;

  -- C. checked_in           → untouched (the patient arrived)
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_chk;
  IF v_status <> 'checked_in' THEN RAISE EXCEPTION 'C FAIL: checked_in was changed to %', v_status; END IF;

  -- D. pending              → untouched (payment/hold lifecycle owns it)
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_pend;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'D FAIL: pending was changed to %', v_status; END IF;

  -- E/F/G. already-resolved statuses are never rewritten
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_canc;
  IF v_status <> 'cancelled' THEN RAISE EXCEPTION 'E FAIL: cancelled was changed to %', v_status; END IF;
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_comp;
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'F FAIL: completed was changed to %', v_status; END IF;
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_nosh;
  IF v_status <> 'no_show' THEN RAISE EXCEPTION 'G FAIL: no_show was changed to %', v_status; END IF;

  -- H. future appointment   → untouched
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_futr;
  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'H FAIL: future appointment was changed to %', v_status; END IF;

  -- I. rescheduled-to-future → untouched
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_resch;
  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'I FAIL: rescheduled future slot was changed to %', v_status; END IF;

  -- N. before the activation floor → untouched, however old
  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_hist;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'N FAIL: an appointment before the activation floor was swept (now %)', v_status;
  END IF;

  -- M. idempotency — a second run must change nothing
  v_result := public.sweep_missed_appointments(360, 500);
  IF (v_result ->> 'swept')::INT <> 0 THEN
    RAISE EXCEPTION 'M FAIL: second run swept % rows; must be 0 (audit-flood regression)',
      (v_result ->> 'swept')::INT;
  END IF;

  RAISE NOTICE 'PART B passed: cases A,B,C,D,E,F,G,H,I,M,N correct.';
END $$;

ROLLBACK;

-- =============================================================================
-- PART C — threshold boundary, Asia/Muscat behaviour, bounded batch. Rolled back.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_patient  UUID;
  v_doctor   UUID;
  v_facility UUID;
  v_floor    DATE;
  v_now      TIMESTAMP;
  v_inside   TIMESTAMP;
  v_outside  TIMESTAMP;
  v_status   TEXT;
  v_result   JSON;
  v_id_in    UUID := '0f000000-0000-4000-8000-0000000000b1';
  v_id_out   UUID := '0f000000-0000-4000-8000-0000000000b2';
BEGIN
  SELECT id INTO v_patient  FROM public.patient_profiles LIMIT 1;
  SELECT id INTO v_doctor   FROM public.doctors          LIMIT 1;
  SELECT id INTO v_facility FROM public.facilities       LIMIT 1;
  IF v_patient IS NULL OR v_doctor IS NULL OR v_facility IS NULL THEN
    RAISE EXCEPTION 'PART C SKIPPED: needs at least one patient_profile, doctor and facility';
  END IF;

  v_floor := public.missed_sweep_activation_floor();
  v_now   := public.oman_now();

  -- With a 60-minute threshold: one slot ended 90 minutes ago (must sweep), the other
  -- 30 minutes ago (must not). Both are built from OMAN wall clock, which is the point —
  -- computing them from now() (UTC) would place them four hours off and the boundary
  -- assertions below would fail. That is the timezone regression this pins.
  v_inside  := v_now - INTERVAL '90 minutes';
  v_outside := v_now - INTERVAL '30 minutes';

  -- Only meaningful if both land on a date at/after the floor.
  IF v_inside::DATE < v_floor OR v_outside::DATE < v_floor THEN
    RAISE NOTICE 'PART C SKIPPED: boundary fixtures fall before the activation floor (floor=%)', v_floor;
    RETURN;
  END IF;

  INSERT INTO public.appointments
    (id, patient_id, doctor_id, facility_id, slot_date, slot_start, slot_end, status, type)
  VALUES
    (v_id_in,  v_patient, v_doctor, v_facility, v_inside::DATE,
       (v_inside - INTERVAL '30 minutes')::TIME, v_inside::TIME, 'confirmed', 'in_person'),
    (v_id_out, v_patient, v_doctor, v_facility, v_outside::DATE,
       (v_outside - INTERVAL '30 minutes')::TIME, v_outside::TIME, 'confirmed', 'in_person');

  v_result := public.sweep_missed_appointments(60, 500);

  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_in;
  IF v_status <> 'no_show' THEN
    RAISE EXCEPTION 'BOUNDARY FAIL: slot ended 90 min ago with a 60-min threshold = %, expected no_show', v_status;
  END IF;

  SELECT status::TEXT INTO v_status FROM public.appointments WHERE id = v_id_out;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'BOUNDARY FAIL: slot ended 30 min ago with a 60-min threshold = %, expected confirmed', v_status;
  END IF;

  -- Bounded batch: p_limit = 1 may sweep at most one row.
  UPDATE public.appointments SET status = 'confirmed' WHERE id IN (v_id_in, v_id_out);
  UPDATE public.appointments
     SET slot_date = v_inside::DATE, slot_start = (v_inside - INTERVAL '30 minutes')::TIME, slot_end = v_inside::TIME
   WHERE id = v_id_out;

  v_result := public.sweep_missed_appointments(60, 1);
  IF (v_result ->> 'swept')::INT <> 1 THEN
    RAISE EXCEPTION 'LIMIT FAIL: p_limit=1 swept % rows, expected exactly 1', (v_result ->> 'swept')::INT;
  END IF;

  RAISE NOTICE 'PART C passed: threshold boundary, Asia/Muscat basis and p_limit bound correct.';
END $$;

ROLLBACK;

-- =============================================================================
-- PART D — concurrency (cases J, K, L). MANUAL: needs two sessions.
-- =============================================================================
-- SKIP LOCKED cannot be exercised from a single session, so these are documented rather
-- than automated. Run each with two psql connections against staging.
--
-- J. Check-in wins
--    S1: BEGIN; UPDATE appointments SET status='checked_in' WHERE id=<elapsed confirmed>;
--        -- hold the transaction open
--    S2: SELECT public.sweep_missed_appointments(60, 500);
--        -- expect swept = 0 for that row (S1 holds the lock; SKIP LOCKED passes over it)
--    S1: COMMIT;
--    S2: SELECT public.sweep_missed_appointments(60, 500);
--        -- expect swept = 0 again; the row is now checked_in and fails the predicate
--    ASSERT final status = 'checked_in'
--
-- K. Completion wins when it commits first
--    S1: BEGIN; UPDATE appointments SET status='completed', completed_at=now() WHERE id=<row>; COMMIT;
--    S2: SELECT public.sweep_missed_appointments(60, 500);
--    ASSERT final status = 'completed'
--
--    ⚠️ THE REVERSE ORDER IS THE KNOWN HAZARD, AND IT IS NOT FIXED HERE.
--    If the sweep commits FIRST, HAMS's POST /api/appointments/[id]/complete updates with
--    `.in("status", ["confirmed","checked_in"])`, matches zero rows, and returns
--    { success: true, message: "Already completed or invalid state" } — a SILENT SUCCESS.
--    The doctor is told the consultation was recorded when it was not. The six-hour
--    nightly threshold is the mitigation, not a fix; the fix belongs in HAMS's route
--    (return a 409 when the conditional update matches nothing). Raised with HAMS.
--    Regression check for whoever fixes it:
--      S1: SELECT public.sweep_missed_appointments(60, 500);   -- row becomes no_show
--      S2: POST /api/appointments/<id>/complete
--      ASSERT the response is NOT a bare success — it must surface the conflict.
--
-- L. queue_no_show concurrently → exactly one transition
--    S1: BEGIN; SELECT public.queue_no_show(<queue_item_id>);
--    S2: SELECT public.sweep_missed_appointments(60, 500);   -- expect swept = 0
--    S1: COMMIT;
--    ASSERT final status = 'no_show' and exactly ONE audit_logs row for the transition
-- =============================================================================
