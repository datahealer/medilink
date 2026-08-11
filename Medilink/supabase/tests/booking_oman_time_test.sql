-- Regression tests for 20260811000000_booking_oman_business_time.sql
-- =============================================================================
-- Covers BUG 1 (elapsed slots today were bookable) and BUG 3 (UTC vs Oman dates)
-- from docs/PRODUCTION_READINESS_AUDIT_2026-08-11.md §3D.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_oman_time_test.sql
--   supabase db execute --file supabase/tests/booking_oman_time_test.sql
--
-- Every assertion RAISEs on failure, so a non-zero exit means a regression.
-- PART A runs inside a transaction that is rolled back and writes nothing.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — automated, no fixtures, no writes
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_expected_date DATE;
  v_expected_time TIME;
BEGIN
  -- ── B3 · Oman business time ───────────────────────────────────────────────
  v_expected_date := (now() AT TIME ZONE 'Asia/Muscat')::DATE;
  v_expected_time := (now() AT TIME ZONE 'Asia/Muscat')::TIME;

  IF public.oman_today() <> v_expected_date THEN
    RAISE EXCEPTION 'B3 FAIL: oman_today() = %, expected %', public.oman_today(), v_expected_date;
  END IF;

  -- Tolerance, not equality: the two calls are microseconds apart.
  IF abs(EXTRACT(EPOCH FROM (public.oman_time_now() - v_expected_time))) > 5 THEN
    RAISE EXCEPTION 'B3 FAIL: oman_time_now() = %, expected ~%', public.oman_time_now(), v_expected_time;
  END IF;

  -- Oman is 4 hours ahead of UTC, so its date is never behind the UTC date...
  IF public.oman_today() < CURRENT_DATE THEN
    RAISE EXCEPTION 'B3 FAIL: oman_today() (%) is behind CURRENT_DATE (%)', public.oman_today(), CURRENT_DATE;
  END IF;

  -- ...and is exactly one day ahead between 20:00 and 24:00 UTC. This is the window
  -- in which the old CURRENT_DATE-based guards were wrong.
  IF (now() AT TIME ZONE 'UTC')::TIME >= TIME '20:00'
     AND public.oman_today() <> CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'B3 FAIL: after 20:00 UTC the Oman date must be tomorrow (oman=%, utc=%)',
      public.oman_today(), CURRENT_DATE;
  END IF;

  IF (now() AT TIME ZONE 'UTC')::TIME < TIME '20:00'
     AND public.oman_today() <> CURRENT_DATE THEN
    RAISE EXCEPTION 'B3 FAIL: before 20:00 UTC the Oman date must equal the UTC date (oman=%, utc=%)',
      public.oman_today(), CURRENT_DATE;
  END IF;

  RAISE NOTICE 'PART A passed: Oman business-time helpers are correct.';
END $$;

-- ── B1/B3 · the guards are actually present in the deployed function bodies ──
-- Cheap structural assertion: catches a partial deploy or an accidental rollback to a
-- pre-fix definition, which would otherwise only show up as a wrong booking.
DO $$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_available_slots';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'B1 FAIL: public.get_available_slots does not exist';
  END IF;
  IF v_src NOT LIKE '%oman_today%' THEN
    RAISE EXCEPTION 'B3 FAIL: get_available_slots still uses a non-Oman date';
  END IF;
  IF v_src NOT LIKE '%oman_time_now%' THEN
    RAISE EXCEPTION 'B1 FAIL: get_available_slots has no elapsed-slot guard';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'book_appointment_atomic';

  IF v_src NOT LIKE '%SLOT_IN_PAST%' THEN
    RAISE EXCEPTION 'B1 FAIL: book_appointment_atomic does not reject elapsed slots — a client can still book the past';
  END IF;
  IF v_src NOT LIKE '%oman_today%' THEN
    RAISE EXCEPTION 'B3 FAIL: book_appointment_atomic booking window still uses CURRENT_DATE (UTC)';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reschedule_appointment_atomic';

  IF v_src NOT LIKE '%SLOT_IN_PAST%' THEN
    RAISE EXCEPTION 'B1 FAIL: reschedule_appointment_atomic does not reject elapsed slots';
  END IF;
  IF v_src LIKE '%AT TIME ZONE ''UTC''%' THEN
    RAISE EXCEPTION 'B3 FAIL: reschedule still reads the stored slot as UTC (cutoff will be 4h too lenient)';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cancel_appointment_safe';

  IF v_src LIKE '%AT TIME ZONE ''UTC''%' THEN
    RAISE EXCEPTION 'B3 FAIL: cancel still reads the stored slot as UTC';
  END IF;

  RAISE NOTICE 'PART A passed: B1/B3 guards present in all four deployed functions.';
END $$;

-- ── the security models this migration must NOT have changed ────────────────
DO $$
DECLARE
  v_secdef BOOLEAN;
BEGIN
  SELECT p.prosecdef INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'book_appointment_atomic';
  IF v_secdef THEN
    RAISE EXCEPTION 'SECURITY FAIL: book_appointment_atomic became SECURITY DEFINER — it would bypass patient INSERT RLS';
  END IF;

  SELECT p.prosecdef INTO v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'doctors_available_today';
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'REGRESSION: doctors_available_today lost SECURITY DEFINER (set by 20260721000000)';
  END IF;

  RAISE NOTICE 'PART A passed: security models unchanged.';
END $$;

-- uq_appointment_slot must be untouched by this migration.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'uq_appointment_slot';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'REGRESSION: uq_appointment_slot is missing — double-booking is no longer prevented';
  END IF;
  RAISE NOTICE 'PART A passed: uq_appointment_slot intact -> %', v_def;
END $$;

ROLLBACK;

-- =============================================================================
-- PART B — fixture-based (needs a seeded doctor); run on staging
-- =============================================================================
-- Substitute a doctor who has slots on today's Oman weekday, and run inside a
-- transaction you roll back.
--
--   BEGIN;
--   \set doctor_id '00000000-0000-0000-0000-000000000000'
--
--   -- B1.1 no offered slot for TODAY may start at or before the current Oman time
--   SELECT count(*) AS past_slots_offered
--   FROM public.get_available_slots(:'doctor_id'::uuid, public.oman_today(), FALSE)
--   WHERE slot_start <= public.oman_time_now();
--   -- EXPECT: 0
--
--   -- B1.2 future slots today are still offered (the guard is not over-broad)
--   SELECT count(*) AS future_slots_offered
--   FROM public.get_available_slots(:'doctor_id'::uuid, public.oman_today(), FALSE)
--   WHERE slot_start > public.oman_time_now();
--   -- EXPECT: > 0 if the doctor has any remaining slots today
--
--   -- B1.3 tomorrow is unaffected by the time-of-day guard
--   SELECT count(*) FROM public.get_available_slots(:'doctor_id'::uuid, public.oman_today() + 1, FALSE);
--   -- EXPECT: the doctor's template for that weekday, minus occupied slots
--
--   -- B1.4 booking a past slot is rejected SERVER-SIDE (client filtering bypassed).
--   --      Run as an authenticated patient (set request.jwt.claims) with a
--   --      slot_start earlier than public.oman_time_now() for today.
--   SELECT public.book_appointment_atomic(
--     '<patient_profiles.id>'::uuid, :'doctor_id'::uuid, '<facility_id>'::uuid,
--     public.oman_today(), TIME '00:01', 'in_person', FALSE, NULL, NULL);
--   -- EXPECT: {"success": false, "error": "SLOT_IN_PAST"}
--
--   -- B1.5 a FUTURE slot today still books successfully
--   -- EXPECT: {"success": true, "appointment_id": ...}
--
--   -- B3.1 the booking window is measured in Oman days
--   SELECT count(*) FROM public.get_available_slots(
--     :'doctor_id'::uuid, public.oman_today() + 7, FALSE);
--   -- EXPECT: 0 (day 8 of a 7-day window)
--
--   ROLLBACK;
