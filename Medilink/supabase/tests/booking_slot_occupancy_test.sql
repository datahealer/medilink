-- Regression tests for 20260811010000_slot_occupancy_and_availability_visibility.sql
-- =============================================================================
-- Covers BUG 2 (expired holds vs uq_appointment_slot) and BUG 4 (availability was
-- RLS-blind) from docs/PRODUCTION_READINESS_AUDIT_2026-08-11.md §3D.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_slot_occupancy_test.sql
--
-- Every assertion RAISEs on failure, so a non-zero exit means a regression.
-- PART A runs inside a transaction that is rolled back and writes nothing.

\set ON_ERROR_STOP on

-- =============================================================================
-- PART A — the occupancy rule (tests A, B, C, D)
-- =============================================================================
BEGIN;

DO $$
BEGIN
  -- C. Confirmed appointment blocks the slot — and keeps blocking it even though
  --    live data carries confirmed rows whose hold_expires_at is long past.
  IF NOT public.appointment_holds_slot('confirmed', NULL) THEN
    RAISE EXCEPTION 'C FAIL: a confirmed appointment must occupy its slot';
  END IF;
  IF NOT public.appointment_holds_slot('confirmed', now() - INTERVAL '5 days') THEN
    RAISE EXCEPTION 'C FAIL: confirmed must occupy regardless of a stale hold column';
  END IF;
  IF NOT public.appointment_holds_slot('checked_in', now() - INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'C FAIL: a checked-in appointment must occupy its slot';
  END IF;

  -- A. Unexpired unpaid hold blocks the slot.
  IF NOT public.appointment_holds_slot('pending', now() + INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'A FAIL: an unexpired pending hold must occupy its slot';
  END IF;
  -- NULL TTL = no expiry (emergency / staff-created) → holds indefinitely.
  IF NOT public.appointment_holds_slot('pending', NULL) THEN
    RAISE EXCEPTION 'A FAIL: a pending row with no TTL must occupy its slot';
  END IF;

  -- B. THE BUG: an expired unpaid hold must NOT block the slot.
  IF public.appointment_holds_slot('pending', now() - INTERVAL '1 second') THEN
    RAISE EXCEPTION 'B FAIL: an EXPIRED pending hold must NOT occupy its slot';
  END IF;

  -- D. Cancelled / completed / no_show follow existing product rules: never block.
  IF public.appointment_holds_slot('cancelled', now() + INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'D FAIL: a cancelled appointment must not occupy its slot';
  END IF;
  IF public.appointment_holds_slot('completed', NULL) THEN
    RAISE EXCEPTION 'D FAIL: a completed appointment must not occupy its slot';
  END IF;
  IF public.appointment_holds_slot('no_show', NULL) THEN
    RAISE EXCEPTION 'D FAIL: a no-show appointment must not occupy its slot';
  END IF;

  -- The release boundary must be exactly complementary to the occupancy boundary:
  -- occupied iff hold > now(); releasable iff hold <= now(). No gap, no overlap.
  IF public.appointment_holds_slot('pending', now()) THEN
    RAISE EXCEPTION 'BOUNDARY FAIL: a hold expiring exactly now must be releasable';
  END IF;

  RAISE NOTICE 'PART A passed: occupancy rule (A,B,C,D) correct.';
END $$;

-- Advisory-lock key: deterministic, and distinct per slot (E depends on this).
DO $$
DECLARE k BIGINT;
BEGIN
  k := public.slot_lock_key('11111111-1111-4111-8111-111111111111', DATE '2026-08-12', TIME '09:00');
  IF k <> public.slot_lock_key('11111111-1111-4111-8111-111111111111', DATE '2026-08-12', TIME '09:00') THEN
    RAISE EXCEPTION 'E FAIL: slot_lock_key is not deterministic — two bookers would not serialize';
  END IF;
  IF k = public.slot_lock_key('11111111-1111-4111-8111-111111111111', DATE '2026-08-12', TIME '09:30')
     OR k = public.slot_lock_key('11111111-1111-4111-8111-111111111111', DATE '2026-08-13', TIME '09:00')
     OR k = public.slot_lock_key('22222222-2222-4222-8222-222222222222', DATE '2026-08-12', TIME '09:00') THEN
    RAISE EXCEPTION 'E FAIL: distinct slots collide on one lock key';
  END IF;
  RAISE NOTICE 'PART A passed: advisory-lock key sound.';
END $$;

-- =============================================================================
-- PART A2 — security models and the reuse contract (tests I, J, K)
-- =============================================================================
DO $$
DECLARE v_secdef BOOLEAN; v_src TEXT;
BEGIN
  -- I/J. Availability must be RLS-independent, or Patient B is offered Patient A's
  -- slot and guests see every slot as free.
  SELECT p.prosecdef INTO v_secdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_available_slots';
  IF v_secdef IS NULL THEN RAISE EXCEPTION 'B4 FAIL: get_available_slots missing'; END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'B4 FAIL: get_available_slots is SECURITY INVOKER — RLS silently hides other patients'' bookings';
  END IF;

  FOR v_src IN SELECT unnest(ARRAY['doctors_available_today','slot_is_occupied','expired_hold_on_slot','release_unpaid_hold'])
  LOOP
    SELECT p.prosecdef INTO v_secdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_src;
    IF NOT COALESCE(v_secdef,FALSE) THEN
      RAISE EXCEPTION 'B4 FAIL: %() must be SECURITY DEFINER', v_src;
    END IF;
  END LOOP;

  -- K. The write paths must NOT become definer, or patient INSERT RLS (and its
  -- aal2_or_no_2fa check) would be bypassed.
  FOR v_src IN SELECT unnest(ARRAY['book_appointment_atomic','reschedule_appointment_atomic'])
  LOOP
    SELECT p.prosecdef INTO v_secdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_src;
    IF COALESCE(v_secdef,FALSE) THEN
      RAISE EXCEPTION 'SECURITY FAIL: %() became SECURITY DEFINER — it would bypass appointment RLS', v_src;
    END IF;
  END LOOP;

  -- Every definer function must pin search_path (privilege-escalation hygiene).
  FOR v_src IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND p.proname IN ('get_available_slots','doctors_available_today','slot_is_occupied',
                         'expired_hold_on_slot','release_unpaid_hold')
       AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    RAISE EXCEPTION 'SECURITY FAIL: definer %() has no pinned search_path', v_src;
  END LOOP;

  RAISE NOTICE 'PART A2 passed: security models correct (I, J, K).';
END $$;

-- K. Guests must be able to READ availability but never reach a write/release RPC.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('book_appointment_atomic','reschedule_appointment_atomic',
                      'release_unpaid_hold','expired_hold_on_slot','sweep_expired_holds')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'K FAIL: anon can EXECUTE privileged function(s): %', v_bad;
  END IF;

  -- ...and guests MUST retain the two read-only availability RPCs (guest mode).
  IF NOT has_function_privilege('anon', 'public.get_available_slots(uuid,date,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'J FAIL: anon lost EXECUTE on get_available_slots — guest browsing broken';
  END IF;
  IF NOT has_function_privilege('anon', 'public.doctors_available_today(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'J FAIL: anon lost EXECUTE on doctors_available_today';
  END IF;

  RAISE NOTICE 'PART A2 passed: guest boundary intact (J, K).';
END $$;

-- HAMS reuse contract: exactly ONE release implementation must exist, and the
-- sweeper + its cron job must be untouched.
DO $$
DECLARE v_n INT; v_src TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='sweep_expired_holds') THEN
    RAISE EXCEPTION 'HAMS FAIL: sweep_expired_holds() is gone';
  END IF;

  -- The earlier draft's duplicate release function must NOT exist.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='reap_expired_slot_hold') THEN
    RAISE EXCEPTION 'HAMS FAIL: reap_expired_slot_hold exists — release logic is duplicated';
  END IF;

  -- Only release_unpaid_hold may delete from appointments as part of hold release.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND pg_get_functiondef(p.oid) ILIKE '%DELETE FROM public.appointments%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'HAMS FAIL: expected exactly 1 definer function deleting appointments, found %', v_n;
  END IF;

  -- The service-role branch of release_unpaid_hold must be preserved verbatim.
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='release_unpaid_hold';
  IF v_src NOT LIKE '%HOLD_NOT_EXPIRED%' THEN
    RAISE EXCEPTION 'HAMS FAIL: release_unpaid_hold lost its service-role expiry guard — the cron sweeper contract is broken';
  END IF;
  IF v_src NOT LIKE '%ALREADY_PAID%' THEN
    RAISE EXCEPTION 'PAYMENT FAIL: release_unpaid_hold lost its ALREADY_PAID guard';
  END IF;

  RAISE NOTICE 'PART A2 passed: HAMS release architecture reused, not duplicated.';
END $$;

-- The index must remain the concurrency backstop, unchanged.
DO $$
DECLARE v_def TEXT;
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes
   WHERE schemaname='public' AND indexname='uq_appointment_slot';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'E FAIL: uq_appointment_slot is missing — double-booking is unprevented';
  END IF;
  IF v_def NOT LIKE '%UNIQUE%' THEN
    RAISE EXCEPTION 'E FAIL: uq_appointment_slot is no longer UNIQUE';
  END IF;
  RAISE NOTICE 'PART A2 passed: uq_appointment_slot intact -> %', v_def;
END $$;

ROLLBACK;

-- =============================================================================
-- PART B — fixture-based behaviour (tests F, G, H) — staging
-- =============================================================================
-- Needs a doctor with a weekly template and two patient profiles. Run in a
-- transaction you ROLL BACK.
--
--   BEGIN;
--   \set doctor  '<doctors.id>'
--   \set fac     '<facilities.id>'
--   \set pat_a   '<patient_profiles.id of A>'
--   \set pat_b   '<patient_profiles.id of B>'
--   \set slot    '<a FREE future slot_start from the template>'
--   \set day     '<its date, within the booking window>'
--
--   -- G. availability says OCCUPIED -> booking must not succeed
--   INSERT INTO public.appointments (patient_id, doctor_id, facility_id, slot_date,
--     slot_start, slot_end, status, hold_expires_at)
--   VALUES (:'pat_a', :'doctor', :'fac', :'day', :'slot', :'slot'::time + INTERVAL '15 min',
--           'pending', now() + INTERVAL '5 minutes');
--   SELECT public.slot_is_occupied(:'doctor', :'day', :'slot');            -- EXPECT true
--   SELECT count(*) FROM public.get_available_slots(:'doctor', :'day', FALSE)
--    WHERE slot_start = :'slot';                                           -- EXPECT 0
--   -- as patient B: SELECT public.book_appointment_atomic(...)            -- EXPECT SLOT_ALREADY_BOOKED
--
--   -- H. expire that hold -> availability FREE -> booking SUCCEEDS
--   UPDATE public.appointments SET hold_expires_at = now() - INTERVAL '1 minute'
--    WHERE patient_id = :'pat_a' AND slot_date = :'day' AND slot_start = :'slot';
--   SELECT public.slot_is_occupied(:'doctor', :'day', :'slot');            -- EXPECT false
--   SELECT count(*) FROM public.get_available_slots(:'doctor', :'day', FALSE)
--    WHERE slot_start = :'slot';                                           -- EXPECT 1
--   SELECT public.expired_hold_on_slot(:'doctor', :'day', :'slot');        -- EXPECT A's id
--   -- as patient B: SELECT public.book_appointment_atomic(...)            -- EXPECT success:true
--   -- and A's stale row is gone (released via release_unpaid_hold)
--
--   -- F. availability says FREE -> booking succeeds (on a genuinely free slot)
--
--   -- PAYMENT SAFETY: repeat H with a payments row status='paid' for A.
--   SELECT public.expired_hold_on_slot(:'doctor', :'day', :'slot');        -- EXPECT NULL
--   SELECT public.release_unpaid_hold('<A id>');                           -- EXPECT ALREADY_PAID
--   -- as patient B: booking                                               -- EXPECT SLOT_ALREADY_BOOKED
--
--   -- I. RLS: as patient B (JWT set), the occupancy read must still see A's row...
--   SELECT public.slot_is_occupied(:'doctor', :'day', :'slot');            -- EXPECT true
--   -- ...while B still cannot read A's appointment itself:
--   SELECT count(*) FROM public.appointments WHERE patient_id = :'pat_a';  -- EXPECT 0
--
--   ROLLBACK;
--
-- =============================================================================
-- PART C — concurrency (test E) — two sessions, cannot be scripted single-session
-- =============================================================================
-- Pick one FREE future slot. Two psql sessions, two different patients.
--
--   Session A                                   Session B
--   ---------                                   ---------
--   BEGIN;
--   SELECT book_appointment_atomic(...);        -- takes advisory lock, inserts
--                                               BEGIN;
--                                               SELECT book_appointment_atomic(...);
--                                               -- BLOCKS on pg_advisory_xact_lock
--   COMMIT;
--                                               -- unblocks; no stale hold to release;
--                                               -- INSERT hits uq_appointment_slot
--                                               -- EXPECT: SLOT_ALREADY_BOOKED
--                                               ROLLBACK;
--   EXPECT: exactly one appointment row for that slot.
--
-- Variant 1 — A ROLLBACKs instead of COMMIT: B must SUCCEED.
-- Variant 2 — slot pre-loaded with an EXPIRED unpaid hold from a third patient:
--   A succeeds and the stale row is gone; B gets SLOT_ALREADY_BOOKED; one row remains.
-- Variant 3 — slot pre-loaded with a PAID expired hold:
--   both A and B get SLOT_ALREADY_BOOKED; the paid row survives untouched.
