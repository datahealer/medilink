-- Feature F3 · BP-3 — Pending-hold TTL + release-on-failure
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Booking & Payment §4/§5,
-- Engineering Decisions R2/R7, and Implementation Phases → Phase BP-3.
--
-- An unpaid `pending` booking must not hold its slot forever. We add a 10-minute
-- hold (`hold_expires_at`), a dedicated release path, and make the availability
-- layer treat an EXPIRED unpaid pending hold as free in real time (so a lapsed
-- slot re-books instantly, before the sweeper deletes the stale row).
--
-- This migration (all additive/reversible):
--   1. appointments.hold_expires_at (nullable) + a sweeper lookup index.
--   2. book_appointment_atomic — set hold_expires_at = now()+10min for NON-emergency
--      pending bookings (emergency: NULL, no TTL). Reproduces the BP-2 window guard.
--   3. release_unpaid_hold(appointment_id) — void a still-pending, UNPAID reservation
--      (detach unpaid payments, delete the row → slot frees). Owner-scoped for an
--      authenticated caller; service-role (Edge Function) may release only EXPIRED
--      holds. Never touches confirmed/paid rows (R2).
--   4. get_available_slots + doctors_available_today — exclude expired unpaid pending
--      holds in real time (keeps the BP-2 window clamp).
--
-- The Scheduled Edge Function `release-expired-holds` (R7, ~1-min cadence) calls
-- release_unpaid_hold for expired rows — see supabase/functions/release-expired-holds.
-- No client TS reads hold_expires_at, so no generated-type change is required here;
-- run `npm run db:types` after applying to keep supabase.ts in sync.

-- ---------------------------------------------------------------------------
-- 1) Hold column + sweeper index
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_appointments_expired_holds
  ON public.appointments (hold_expires_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2) book_appointment_atomic — set the 10-minute hold on the pending insert
--    (BP-2 window guard preserved). Same signature → existing GRANTs stand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_patient_id           UUID,
  p_doctor_id            UUID,
  p_facility_id          UUID,
  p_slot_date            DATE,
  p_slot_start           TIME,
  p_type                 TEXT    DEFAULT 'in_person',
  p_is_emergency         BOOLEAN DEFAULT FALSE,
  p_for_family_member_id UUID    DEFAULT NULL
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

  -- BP-2: booking-window guard (NON-emergency only). Emergency bypasses the window.
  IF p_is_emergency = FALSE THEN
    SELECT COALESCE(fs.booking_window_days, 7)
    INTO v_window
    FROM public.doctors d
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    WHERE d.id = p_doctor_id;

    IF v_window IS NULL THEN
      v_window := 7;
    END IF;

    IF p_slot_date < CURRENT_DATE
       OR p_slot_date > (CURRENT_DATE + (v_window - 1)) THEN
      RETURN json_build_object('success', FALSE, 'error', 'OUTSIDE_BOOKING_WINDOW');
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
      for_family_member_id, hold_expires_at
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency,
      p_for_family_member_id,
      -- BP-3: 10-minute unpaid-hold TTL for online-payment (non-emergency) bookings.
      CASE WHEN p_is_emergency THEN NULL ELSE (now() + INTERVAL '10 minutes') END
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

-- ---------------------------------------------------------------------------
-- 3) release_unpaid_hold — void a still-pending, UNPAID reservation (R2).
--    SECURITY DEFINER so it can delete under the explicit guard below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_unpaid_hold(p_appointment_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_status    TEXT;
  v_expires   TIMESTAMPTZ;
  v_owner_uid UUID;
  v_paid      BOOLEAN;
BEGIN
  SELECT a.status::TEXT, a.hold_expires_at, pp.user_id
    INTO v_status, v_expires, v_owner_uid
  FROM public.appointments a
  JOIN public.patient_profiles pp ON pp.id = a.patient_id
  WHERE a.id = p_appointment_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_FOUND');
  END IF;

  -- Only ever act on a PENDING hold; never a confirmed/checked_in/cancelled row.
  IF v_status <> 'pending' THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_A_PENDING_HOLD');
  END IF;

  -- Authorization:
  --  • authenticated caller (explicit cancel) → must OWN it; may release even
  --    before expiry (they are abandoning their own reservation).
  --  • service role (Edge Function sweeper, auth.uid() IS NULL) → may release only
  --    EXPIRED holds.
  IF v_uid IS NOT NULL THEN
    IF v_owner_uid IS DISTINCT FROM v_uid THEN
      RETURN json_build_object('success', FALSE, 'error', 'FORBIDDEN');
    END IF;
  ELSE
    IF v_expires IS NULL OR v_expires >= now() THEN
      RETURN json_build_object('success', FALSE, 'error', 'HOLD_NOT_EXPIRED');
    END IF;
  END IF;

  -- Never void a reservation that has already been paid (late-payment/reconciliation
  -- is handled by the webhook/verify path, §4 — not here).
  SELECT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.appointment_id = p_appointment_id AND p.status = 'paid'
  ) INTO v_paid;

  IF v_paid THEN
    RETURN json_build_object('success', FALSE, 'error', 'ALREADY_PAID');
  END IF;

  -- Detach any UNPAID payment rows first (payments.appointment_id is UNIQUE / FK),
  -- then void the reservation → the row drops out of uq_appointment_slot and the
  -- availability RPCs, freeing the slot.
  DELETE FROM public.payments
    WHERE appointment_id = p_appointment_id AND status <> 'paid';
  DELETE FROM public.appointments
    WHERE id = p_appointment_id;

  RETURN json_build_object('success', TRUE, 'appointment_id', p_appointment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_unpaid_hold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_unpaid_hold(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4a) get_available_slots — exclude EXPIRED unpaid pending holds in real time
--     (BP-2 window clamp preserved). Same signature → GRANTs stand.
-- ---------------------------------------------------------------------------
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
  v_day     INT;
  v_buffer  INT := 0;
  v_consult INT := 15;
  v_window  INT := 7;
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

  IF p_date < CURRENT_DATE OR p_date > (CURRENT_DATE + (v_window - 1)) THEN
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
    SELECT a.slot_start AS booked_start
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.slot_date = p_date
      AND a.is_emergency = FALSE
      -- A slot is taken by a confirmed/checked_in appt, OR a pending hold that has
      -- NOT expired (NULL hold = no TTL → treated as held). Expired pending = free.
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
  ORDER BY a.start_time;

END;
$$;

-- ---------------------------------------------------------------------------
-- 4b) doctors_available_today — same expired-hold exclusion (BP-2 window clamp kept).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctors_available_today(p_date DATE)
RETURNS TABLE (doctor_id UUID)
LANGUAGE sql
STABLE
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
    AND p_date >= CURRENT_DATE
    AND p_date <= (CURRENT_DATE + (ts.window_days - 1))
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
