-- BUG 1 + BUG 3 — Oman business time, and elapsed slots are not bookable
-- =============================================================================
-- Ref: docs/PRODUCTION_READINESS_AUDIT_2026-08-11.md §3D.
--
-- This migration deliberately does NOT touch the slot-occupancy rule or the
-- security model of any function. Those are BUG 2 / BUG 4 and land separately in
-- 20260811000100_slot_occupancy_and_availability_rls.sql, so each change can be
-- applied and verified on its own.
--
-- ── B1 · Elapsed slots today were bookable ───────────────────────────────────
-- `get_available_slots` filtered by DATE and by conflicting appointments, but never
-- compared `slot_start` to the current time. At 15:00 a patient could be offered —
-- and could pay for — a 09:00 slot today. `book_appointment_atomic` only checked the
-- slot existed in the doctor's weekly template, so a crafted RPC call bypassed any
-- client-side filtering entirely. Both the READ path (stop offering) and the WRITE
-- path (stop accepting) are fixed; the write path is the authoritative one.
--
-- ── B3 · CURRENT_DATE / NOW() are UTC, but MediLink operates in Oman ─────────
-- Oman is UTC+4. Between 00:00 and 04:00 Oman time `CURRENT_DATE` is still
-- YESTERDAY, so the booking-window guard and the availability clamp were off by one
-- day for four hours every night. Every business date and slot comparison in the
-- booking path now resolves through `public.oman_today()` / `public.oman_time_now()`.
--
-- `cancel_appointment_safe` and `reschedule_appointment_atomic` additionally read the
-- stored wall-clock slot `AT TIME ZONE 'UTC'`, which placed every Oman appointment 4
-- hours later than it really is and made both cutoffs 4 hours too lenient. They now
-- read it as Asia/Muscat.
--
--   BEHAVIOURAL NOTE (deliberate): this makes the cancellation / reschedule cutoffs
--   bite at the configured time instead of 4 hours late. `cancellation_cutoff_hours`
--   and `reschedule_cutoff_hours` keep their values and meaning — only the instant
--   they are measured against is corrected.
--
--   Storage is unchanged: `slot_date DATE` + `slot_start TIME` remain a local
--   wall-clock pair and every TIMESTAMPTZ column keeps storing UTC. Only the
--   INTERPRETATION of that wall clock, and the derivation of "today", change.
--
-- ── SAFETY / SCOPE ───────────────────────────────────────────────────────────
--   • NO schema change: no column, table, index, policy or grant is added, dropped
--     or altered. Nothing destructive, no data migration.
--   • Five functions are CREATE OR REPLACE'd with byte-identical signatures, so
--     existing GRANTs survive (REPLACE preserves privileges); they are re-issued
--     anyway and GRANT is idempotent.
--   • Security models are left EXACTLY as they are found: get_available_slots stays
--     SECURITY INVOKER, doctors_available_today stays SECURITY DEFINER (set by
--     20260721000000), book/reschedule/cancel stay SECURITY INVOKER.
--   • Slot-occupancy predicates are copied VERBATIM from the definitions this
--     migration supersedes — this migration changes WHEN a slot is offered, never
--     WHETHER a given appointment row occupies it.
--   • Rollback: re-run 20260725000000 (book), 20260721000000 (available_today),
--     20260717000002 (get_available_slots) and 20260501000003 (reschedule/cancel).
--   • Payments, refunds, invoices, the Thawani webhook, the email system, RLS
--     policies and auth are untouched.

-- ---------------------------------------------------------------------------
-- 1) Oman business-time helpers — the single source of truth for "now"
-- ---------------------------------------------------------------------------
-- Named zone rather than a hardcoded +4: Oman has not observed DST since 1977, but a
-- named zone stays correct if that ever changes and documents intent. STABLE, not
-- IMMUTABLE, because they read the transaction clock.

CREATE OR REPLACE FUNCTION public.oman_now()
RETURNS TIMESTAMP
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Muscat'); $$;

COMMENT ON FUNCTION public.oman_now() IS
  'Current Oman (Asia/Muscat) wall-clock timestamp. MediLink business time.';

CREATE OR REPLACE FUNCTION public.oman_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Muscat')::DATE; $$;

COMMENT ON FUNCTION public.oman_today() IS
  'Today''s calendar date in Oman. Replaces CURRENT_DATE (UTC) wherever a MediLink business date is meant.';

CREATE OR REPLACE FUNCTION public.oman_time_now()
RETURNS TIME
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Muscat')::TIME; $$;

COMMENT ON FUNCTION public.oman_time_now() IS
  'Current Oman wall-clock time of day, for comparison against appointments.slot_start.';

GRANT EXECUTE ON FUNCTION public.oman_now()      TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.oman_today()    TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.oman_time_now() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2) get_available_slots — Oman window clamp + stop offering elapsed slots
-- ---------------------------------------------------------------------------
-- Body is 20260717000002 §4a VERBATIM except:
--   • CURRENT_DATE  -> public.oman_today()                                    (B3)
--   • new final predicate excluding elapsed slots on today                    (B1)
-- The booked_slots occupancy predicate is copied unchanged; SECURITY INVOKER is
-- retained. Both are addressed by 20260811000100.

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_doctor_id UUID,
  p_date DATE,
  p_include_walkin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end TIME,
  slot_type TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day       INT;
  v_buffer    INT := 0;
  v_consult   INT := 15;
  v_window    INT := 7;
  v_today     DATE := public.oman_today();
  v_time_now  TIME := public.oman_time_now();
BEGIN
  v_day := EXTRACT(DOW FROM p_date);

  SELECT
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15),
    COALESCE(fs.booking_window_days, 7)
  INTO v_buffer, v_consult, v_window
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_window IS NULL THEN
    v_window := 7;
  END IF;

  -- BP-2 booking-window clamp, now on OMAN dates (B3).
  IF p_date < v_today OR p_date > (v_today + (v_window - 1)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT
      (slot->>'start')::TIME AS start_time,
      COALESCE(slot->>'type', 'normal') AS type
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = v_day
  ),

  adjusted_slots AS (
    SELECT
      start_time,
      (
        start_time
        + (v_consult || ' minutes')::interval
        + (v_buffer || ' minutes')::interval
      )::TIME AS end_time,
      type
    FROM raw_slots
  ),

  booked_slots AS (
    -- Occupancy predicate copied VERBATIM from 20260717000002 (BP-3). Unified with
    -- the booking path in 20260811000100 — deliberately unchanged here.
    SELECT a.slot_start AS booked_start
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.slot_date = p_date
      AND a.is_emergency = FALSE
      AND (
        a.status IN ('confirmed','checked_in')
        OR (a.status = 'pending' AND (a.hold_expires_at IS NULL OR a.hold_expires_at >= now()))
      )
  )

  SELECT
    a.start_time,
    a.end_time,
    a.type
  FROM adjusted_slots a
  WHERE
    NOT EXISTS (
      SELECT 1
      FROM booked_slots b
      WHERE b.booked_start = a.start_time
    )
    AND (
      p_include_walkin = TRUE
      OR a.type != 'walkin_reserved'
    )
    -- B1: on TODAY (Oman) a slot whose start time has already passed is not
    -- bookable. Future dates are unaffected. `<=` so a slot starting exactly now is
    -- already gone rather than racing the request.
    AND (p_date > v_today OR a.start_time > v_time_now)
  ORDER BY a.start_time;

END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3) doctors_available_today — Oman dates + stop badging elapsed-only days
-- ---------------------------------------------------------------------------
-- Body is 20260721000000 VERBATIM (including SECURITY DEFINER and the locked
-- search_path) except CURRENT_DATE -> public.oman_today() and the new elapsed-slot
-- predicate. Without the latter, a doctor whose last slot was 09:00 still showed the
-- "Available today" badge at 20:00 and tapping through produced an empty picker.

CREATE OR REPLACE FUNCTION public.doctors_available_today(p_date DATE)
RETURNS TABLE (doctor_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH template_slots AS (
    SELECT
      da.doctor_id,
      (slot->>'start')::TIME               AS start_time,
      COALESCE(slot->>'type', 'normal')    AS slot_type,
      COALESCE(fs.booking_window_days, 7)  AS window_days
    FROM public.doctor_availability da
    JOIN public.doctors d ON d.id = da.doctor_id
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    CROSS JOIN LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.day_of_week = EXTRACT(DOW FROM p_date)::INT
  )
  SELECT DISTINCT ts.doctor_id
  FROM template_slots ts
  WHERE ts.slot_type <> 'walkin_reserved'
    AND p_date >= public.oman_today()
    AND p_date <= (public.oman_today() + (ts.window_days - 1))
    AND (p_date > public.oman_today() OR ts.start_time > public.oman_time_now())
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.doctor_id   = ts.doctor_id
        AND a.slot_date   = p_date
        AND a.slot_start  = ts.start_time
        AND a.is_emergency = FALSE
        AND (
          a.status IN ('confirmed','checked_in')
          OR (a.status = 'pending' AND (a.hold_expires_at IS NULL OR a.hold_expires_at >= now()))
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.doctors_available_today(DATE)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4) book_appointment_atomic — Oman window + reject elapsed slots server-side
-- ---------------------------------------------------------------------------
-- Body is 20260725000000 VERBATIM except:
--   • window guard CURRENT_DATE -> public.oman_today()                        (B3)
--   • new SLOT_IN_PAST guard                                                  (B1)
-- Signature identical (9 args) so the 20260725000000 GRANT survives. Remains
-- SECURITY INVOKER: the INSERT must stay subject to appointments_patient_insert RLS
-- and its aal2_or_no_2fa() check.

CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_patient_id           UUID,
  p_doctor_id            UUID,
  p_facility_id          UUID,
  p_slot_date            DATE,
  p_slot_start           TIME,
  p_type                 TEXT    DEFAULT 'in_person',
  p_is_emergency         BOOLEAN DEFAULT FALSE,
  p_for_family_member_id UUID    DEFAULT NULL,
  p_reason               TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_end       TIME;
  v_buffer         INT := 0;
  v_consult        INT := 15;
  v_window         INT := 7;
  v_appointment_id UUID;
  v_today          DATE := public.oman_today();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patient_profiles
    WHERE id = p_patient_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_PATIENT');
  END IF;

  IF p_for_family_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE id = p_for_family_member_id AND patient_id = p_patient_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_FAMILY_MEMBER');
  END IF;

  -- BP-2: booking-window guard (NON-emergency only), on OMAN dates (B3).
  IF p_is_emergency = FALSE THEN
    SELECT COALESCE(fs.booking_window_days, 7)
    INTO v_window
    FROM public.doctors d
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    WHERE d.id = p_doctor_id;

    IF v_window IS NULL THEN
      v_window := 7;
    END IF;

    IF p_slot_date < v_today
       OR p_slot_date > (v_today + (v_window - 1)) THEN
      RETURN json_build_object('success', FALSE, 'error', 'OUTSIDE_BOOKING_WINDOW');
    END IF;

    -- B1: server-side rejection of an elapsed slot today. This is the guard a
    -- malicious or merely stale client cannot bypass — the availability RPC only
    -- stops OFFERING these; this stops them being BOOKED. Emergency bookings are
    -- exempt, consistent with their exemption from the booking window.
    IF p_slot_date = v_today AND p_slot_start <= public.oman_time_now() THEN
      RETURN json_build_object('success', FALSE, 'error', 'SLOT_IN_PAST');
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = EXTRACT(DOW FROM p_slot_date)
    AND (slot->>'start')::TIME = p_slot_start
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_SLOT');
  END IF;

  SELECT
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_buffer IS NULL THEN
    v_buffer  := 0;
    v_consult := 15;
  END IF;

  v_slot_end := (
    p_slot_start
    + (v_consult || ' minutes')::interval
    + (v_buffer  || ' minutes')::interval
  )::TIME;

  BEGIN
    INSERT INTO public.appointments (
      patient_id, doctor_id, facility_id,
      slot_date, slot_start, slot_end,
      type, status, is_emergency,
      for_family_member_id, hold_expires_at,
      reason_for_visit
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency,
      p_for_family_member_id,
      -- BP-3: 10-minute unpaid-hold TTL for online-payment (non-emergency) bookings.
      CASE WHEN p_is_emergency THEN NULL ELSE (now() + INTERVAL '10 minutes') END,
      NULLIF(btrim(p_reason), '')
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', FALSE, 'error', 'SLOT_ALREADY_BOOKED');
    WHEN OTHERS THEN
      RETURN json_build_object('success', FALSE, 'error', SQLERRM);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(UUID, UUID, UUID, DATE, TIME, TEXT, BOOLEAN, UUID, TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) reschedule_appointment_atomic — Oman dates, Oman cutoff, no past slots
-- ---------------------------------------------------------------------------
-- Body is 20260501000003 VERBATIM except:
--   • past-date check CURRENT_DATE -> public.oman_today()                      (B3)
--   • slot interpreted AT TIME ZONE 'Asia/Muscat' instead of 'UTC'             (B3)
--   • new SLOT_IN_PAST guard                                                   (B1)
-- The conflict-detection predicate is left unchanged (BUG 2 territory).

CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  p_id          UUID,
  p_user_id     UUID,
  p_new_date    DATE,
  p_new_start   TIME,
  p_new_end     TIME,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt      public.appointments%ROWTYPE;
  v_cutoff    INTEGER := 4;
  v_slot_time TIMESTAMPTZ;
  v_conflict  UUID;
  v_today     DATE := public.oman_today();
BEGIN
  -- Lock row: serialises concurrent reschedule attempts on the same appointment
  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF v_appt.status NOT IN ('pending', 'confirmed') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reschedule appointment in current status');
  END IF;

  -- B3: Oman calendar date, not the UTC one.
  IF p_new_date < v_today THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reschedule to a past date');
  END IF;

  -- B1: cannot move onto a slot that has already elapsed today.
  IF p_new_date = v_today AND p_new_start <= public.oman_time_now() THEN
    RETURN json_build_object('success', false, 'error', 'SLOT_IN_PAST');
  END IF;

  -- B3: the stored (slot_date, slot_start) pair is an Oman wall clock, so interpret
  -- it in Asia/Muscat. It was previously read AT TIME ZONE 'UTC' — 4 hours out, which
  -- made this cutoff 4 hours too lenient.
  v_slot_time := ((v_appt.slot_date + v_appt.slot_start)::TIMESTAMP) AT TIME ZONE 'Asia/Muscat';

  SELECT COALESCE(reschedule_cutoff_hours, 4) INTO v_cutoff
  FROM public.facility_settings
  WHERE facility_id = v_appt.facility_id;

  IF v_cutoff IS NULL THEN v_cutoff := 4; END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - (v_cutoff * INTERVAL '1 hour')) THEN
    RETURN json_build_object('success', false, 'error', 'Too late to reschedule');
  END IF;

  -- Explicit slot availability check before write (unique_violation is the backup).
  -- Predicate unchanged from 20260501000003 — hold-expiry awareness is BUG 2.
  SELECT id INTO v_conflict
  FROM public.appointments
  WHERE doctor_id    = v_appt.doctor_id
    AND slot_date    = p_new_date
    AND slot_start   = p_new_start
    AND status IN ('pending', 'confirmed', 'checked_in')
    AND is_emergency = FALSE
    AND id <> p_id;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'SLOT_ALREADY_TAKEN');
  END IF;

  BEGIN
    UPDATE public.appointments
    SET previous_slot_date  = slot_date,
        previous_slot_start = slot_start,
        slot_date           = p_new_date,
        slot_start          = p_new_start,
        slot_end            = p_new_end
    WHERE id = p_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'error', 'SLOT_ALREADY_TAKEN');
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(UUID, UUID, DATE, TIME, TIME, BOOLEAN)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) cancel_appointment_safe — Oman cutoff only
-- ---------------------------------------------------------------------------
-- Body is 20260501000003 VERBATIM except the AT TIME ZONE. Included here because
-- leaving it on 'UTC' while reschedule moves to 'Asia/Muscat' would make the two
-- cutoffs disagree by 4 hours for the same appointment. Cancellation policy,
-- statuses and the cutoff column are unchanged.

CREATE OR REPLACE FUNCTION public.cancel_appointment_safe(
  p_id          UUID,
  p_user_id     UUID,
  p_reason      TEXT DEFAULT NULL,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_appt      public.appointments%ROWTYPE;
  v_cutoff    INTEGER := 3;
  v_slot_time TIMESTAMPTZ;
BEGIN
  -- Lock row to serialise concurrent cancellations of the same appointment
  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF v_appt.status IN ('cancelled', 'completed', 'no_show') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel appointment in current status');
  END IF;

  -- B3: stored date+time is an Oman wall clock (was misread as UTC).
  v_slot_time := ((v_appt.slot_date + v_appt.slot_start)::TIMESTAMP) AT TIME ZONE 'Asia/Muscat';

  IF v_slot_time < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a past appointment');
  END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 3) INTO v_cutoff
  FROM public.facility_settings
  WHERE facility_id = v_appt.facility_id;

  IF v_cutoff IS NULL THEN v_cutoff := 3; END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - (v_cutoff * INTERVAL '1 hour')) THEN
    RETURN json_build_object('success', false, 'error', 'Too late to cancel');
  END IF;

  UPDATE public.appointments
  SET status              = 'cancelled',
      cancelled_by        = p_user_id,
      cancelled_at        = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_safe(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated, service_role;
