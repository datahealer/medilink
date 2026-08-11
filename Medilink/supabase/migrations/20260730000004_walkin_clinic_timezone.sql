-- Phase 5.7 — walk-in appointments must use clinic local time, not UTC
--
-- THE DEFECT
-- ----------
-- add_walkin_to_queue (20260429000006) derives the walk-in's slot from UTC:
--
--     v_slot_date  := (v_now AT TIME ZONE 'UTC')::DATE;
--     v_slot_start := (v_now AT TIME ZONE 'UTC')::TIME;
--
-- Oman is UTC+4 year-round, so every walk-in is recorded four hours earlier
-- than it happened. A patient registered at 10:15 is stored as 06:15, and any
-- walk-in between 00:00 and 04:00 local is filed under the PREVIOUS day.
--
-- That is not cosmetic. slot_date drives the reception day list, the clinic
-- calendar and every daily report, so an early-morning walk-in silently
-- disappears from today's view; and slot_start is what staff read on screen.
--
-- The original comment claimed the UTC cast avoided "Node.js server TZ
-- dependency" — correct in intent, wrong in choice of zone: the fix is to pin
-- the CLINIC's zone, not UTC.
--
-- THE FIX
-- -------
-- Compute slot_date/slot_start/slot_end in Asia/Muscat. Everything else in the
-- function is unchanged, including the atomic appointment+queue insert and the
-- delegation to enqueue_appointment.
--
-- Asia/Muscat is hard-coded rather than read from a settings column because
-- the platform is single-region today and inventing a per-facility timezone
-- column would be a schema change this phase does not need. If the product
-- ever goes multi-region, replace the constant with a facility setting.
-- Asia/Muscat has no DST, so this is a fixed +04 offset in practice while
-- remaining correct if that ever changed.
--
-- Signature is unchanged, so existing GRANTs and every caller stand.
--
-- MEDILINK COMPATIBILITY
--   Improves it. get_my_queue_position returns appointment.slot_date /
--   slot_start straight through to MediLink's queue screen, which was showing
--   walk-ins four hours out. Booked (non-walk-in) appointments were never
--   affected — book_appointment_atomic takes its slot from the caller.
--   No table, column, enum or signature change.
--
-- ROLLBACK
--   Re-apply the body from 20260429000006 (revert 'Asia/Muscat' to 'UTC').
--   Rows already written under the old behaviour are NOT rewritten — see below.
--
-- EXISTING DATA
--   Historical walk-in rows keep their UTC-derived values. They are not
--   back-corrected here: rewriting clinical timestamps is a data-migration
--   decision requiring explicit approval, and the rows are indistinguishable
--   from correct ones without knowing when the fix landed.

CREATE OR REPLACE FUNCTION public.add_walkin_to_queue(
  p_facility_id         UUID,
  p_doctor_id           UUID,
  p_patient_name        TEXT,
  p_patient_phone       TEXT,
  p_slot_duration_mins  INTEGER DEFAULT 15,
  p_created_by_staff_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Clinic-local "now". Everything below is derived from this single value so
  -- date and time cannot disagree across a midnight boundary.
  v_local_now    TIMESTAMP   := (NOW() AT TIME ZONE 'Asia/Muscat');
  v_now          TIMESTAMPTZ := NOW();
  v_slot_date    DATE        := v_local_now::DATE;
  v_slot_start   TIME        := v_local_now::TIME;
  v_slot_end     TIME;
  v_appt_id      UUID;
  v_queue_result JSON;
BEGIN
  IF p_slot_duration_mins <= 0 THEN
    RAISE EXCEPTION 'Invalid slot duration: must be > 0';
  END IF;

  v_slot_end := (v_local_now + (p_slot_duration_mins || ' minutes')::INTERVAL)::TIME;

  INSERT INTO appointments (
    facility_id, doctor_id, patient_id, patient_name, patient_phone,
    type, status, slot_date, slot_start, slot_end, checked_in_at
  ) VALUES (
    p_facility_id, p_doctor_id, NULL, p_patient_name, p_patient_phone,
    'walk_in', 'checked_in', v_slot_date, v_slot_start, v_slot_end, v_now
  )
  RETURNING id INTO v_appt_id;

  SELECT enqueue_appointment(
    v_appt_id, p_facility_id, p_doctor_id,
    p_patient_name, p_patient_phone,
    TRUE, FALSE, p_created_by_staff_id
  ) INTO v_queue_result;

  RETURN json_build_object(
    'appointment_id', v_appt_id,
    'queue_item_id',  v_queue_result->>'queue_item_id',
    'position',       (v_queue_result->>'position')::INTEGER
  );
END;
$$;

COMMENT ON FUNCTION public.add_walkin_to_queue(UUID, UUID, TEXT, TEXT, INTEGER, UUID) IS
  'Creates a walk-in appointment + queue entry atomically. slot_date/slot_start '
  'are clinic-local (Asia/Muscat) as of 20260730000004; they were previously '
  'derived in UTC, filing every Oman walk-in four hours early and pushing '
  'pre-04:00 arrivals onto the previous day.';
