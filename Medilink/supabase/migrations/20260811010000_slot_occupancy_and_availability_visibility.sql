-- BUG 2 + BUG 4 — one occupancy rule, and availability that can actually see it
-- =============================================================================
-- Ref: docs/PRODUCTION_READINESS_AUDIT_2026-08-11.md §3D.
-- Requires 20260811000000_booking_oman_business_time.sql (applied 2026-08-11): the
-- bodies below are that migration's bodies plus this delta.
--
-- ═══ TWO DEFECTS, ONE SYMPTOM ═══════════════════════════════════════════════
-- Both make availability advertise a slot that booking then refuses. B4 is by far
-- the more common of the two and was not in the original bug report.
--
-- ── B4 · availability could not SEE other patients' appointments ─────────────
-- `get_available_slots` was SECURITY INVOKER and its `booked_slots` CTE reads
-- `public.appointments`, which carries `appointments_patient_read`
-- (USING patient_id IN <my patient profiles>). `anon` and `authenticated` both hold
-- table-level SELECT, so the read does not ERROR — RLS simply returns ZERO ROWS.
-- Silent, not loud. Every slot booked by anybody else was therefore reported free.
--
--   MEASURED ON THE LIVE DATABASE (2026-08-11), doctor 073a4e03…, 2026-08-12,
--   where 09:30 is a CONFIRMED appointment:
--     anon         -> 12 slots, 09:30 OFFERED   (wrong)
--     service_role -> 11 slots, 09:30 withheld  (correct)
--
-- This is the bug 20260721000000 fixed for `doctors_available_today`; it was never
-- applied here. Same fix, same precedent: SECURITY DEFINER + locked search_path.
-- Safe because the function is strictly read-only and returns ONLY
-- (slot_start, slot_end, slot_type) for one doctor on one date — no patient,
-- appointment or payment column is exposed, and no row becomes readable that was
-- not already. It removes a false-availability leak; it adds no data access.
--
-- The same blindness affects the WRITE paths: `book_appointment_atomic` and
-- `reschedule_appointment_atomic` are SECURITY INVOKER, so they cannot see — let
-- alone release — a stale hold belonging to another patient. That is why the
-- lookups below are their own tiny SECURITY DEFINER helpers.
--
-- ── B2 · availability and the write path disagreed about expired holds ───────
-- BP-3 (20260717000002) taught the availability functions that an expired unpaid
-- `pending` hold is free, but the write path is arbitrated by
-- `uq_appointment_slot (doctor_id, slot_date, slot_start) WHERE status IN
-- ('pending','confirmed','checked_in') AND is_emergency = FALSE`, which knows
-- nothing about `hold_expires_at`.
--
--   WHY THE INDEX IS NOT CHANGED: occupancy is time-dependent and a partial index
--   predicate must be IMMUTABLE. `hold_expires_at > now()` is STABLE, so Postgres
--   rejects it ("functions in index predicate must be marked IMMUTABLE"). The index
--   CANNOT express the rule. It is left exactly as it is, doing the one job it does
--   correctly — guaranteeing two LIVE rows never share a slot — and remains the
--   final arbiter under concurrency.
--
-- ═══ REUSING HAMS'S RELEASE ARCHITECTURE (not duplicating it) ════════════════
-- HAMS's 20260730000002 established that expired holds are released through ONE
-- implementation: `release_unpaid_hold`, driven by `sweep_expired_holds()` on a
-- 1-minute pg_cron job. That sweeper demonstrably works — a live check found ZERO
-- expired unpaid holds outstanding.
--
-- But cron is CLEANUP, not correctness: for up to ~60s an expired hold still
-- occupies the index while availability advertises the slot as free. The booking
-- transaction must therefore resolve it itself.
--
--   REJECTED: a second release function (the earlier draft's `reap_expired_slot_hold`).
--   It would have re-implemented the release rule — pending-only, never paid, detach
--   unpaid payments first, delete — in a second place, exactly the duplication HAMS
--   deliberately avoided. Two copies of a money-adjacent rule is how they drift.
--
--   CHOSEN: reuse `release_unpaid_hold` verbatim, and widen its authorization by the
--   minimum needed. `release_unpaid_hold` is MEDILINK-owned (defined in
--   20260717000002); HAMS only consumes it. Its two existing branches are preserved
--   BYTE-FOR-BYTE, so `sweep_expired_holds` is completely unaffected:
--     • owner, authenticated        → may release their own hold at any time
--     • service role (auth.uid NULL) → may release only EXPIRED holds   ← unchanged
--   and ONE branch is added:
--     • NON-owner, authenticated     → may release ONLY an already-EXPIRED hold
--
--   Why that is safe: the newly-permitted set is exactly the set the cron deletes
--   within 60 seconds anyway, and exactly the set availability already reports as
--   free. It can never touch a confirmed, checked-in, unexpired or PAID row (the
--   ALREADY_PAID guard is untouched), it returns no data beyond success/error, and
--   `anon` holds no EXECUTE grant, so guests are entirely unaffected.
--
-- ═══ CONCURRENCY ════════════════════════════════════════════════════════════
-- Two patients, same slot, same instant:
--   • Both request pg_advisory_xact_lock(slot_lock_key(doctor,date,start)). ONE
--     wins; the other blocks inside its own transaction. Transaction-scoped, so it
--     releases on COMMIT or ROLLBACK and a crashed session cannot wedge a slot.
--   • Winner W: releases a stale hold if present, INSERTs its `pending` row, commits.
--   • Loser L: acquires the lock only after W commits, re-checks (finds nothing
--     stale — W's hold is fresh), attempts its INSERT, hits uq_appointment_slot →
--     unique_violation → { success:false, SLOT_ALREADY_BOOKED }.
--   • If W rolls back, L proceeds and succeeds. Exactly one row is ever created.
-- The release can never remove a hold another transaction is claiming: claiming
-- requires the same advisory lock and holders are serialized. The unique index stays
-- as the backstop for writers that do not take the lock (staff/HAMS paths, walk-ins,
-- waitlist claims).
--
-- ═══ SAFETY / SCOPE ═════════════════════════════════════════════════════════
--   • NO schema change: no table, column, index, policy or grant is dropped or
--     altered. Nothing destructive. No data migration.
--   • Five functions CREATE OR REPLACE'd with byte-identical signatures, so existing
--     GRANTs survive; re-issued anyway (GRANT is idempotent).
--   • HAMS objects untouched: sweep_expired_holds, the pg_cron job,
--     add_walkin_to_queue, every queue/profile/2FA function. Verified: none of the
--     12 synced HAMS migrations touches appointments RLS, its grants, or the index.
--   • Bug 1's Oman-time logic is preserved verbatim in every body.
--   • Payments/refunds/Thawani/email untouched. Late payment still safe: a PAID row
--     is never released.
--   • Rollback: re-run 20260811000000 (restores the pre-B2/B4 bodies) and
--     20260717000002 (restores the two-branch release_unpaid_hold), then DROP the
--     four helpers added here.

-- ---------------------------------------------------------------------------
-- 1) THE occupancy rule — one definition, used by availability AND booking
-- ---------------------------------------------------------------------------
-- A non-emergency appointment row holds its slot iff:
--   • confirmed or checked_in (active / paid), regardless of hold_expires_at — live
--     data has confirmed rows whose hold column is long past, and they must stay
--     occupied; OR
--   • pending AND the hold has not expired (NULL = no TTL = holds indefinitely,
--     which is the emergency / staff-created case).
-- cancelled, completed, no_show and EXPIRED pending all leave the slot free —
-- unchanged product rules, now stated once.
--
-- Pure: no table access, so no RLS or security consideration. STABLE + SQL so
-- Postgres inlines it into callers at plan time (no per-row call cost).
--
-- Boundary: occupied iff hold_expires_at > now(); releasable iff <= now().
-- Exactly complementary — no gap, no overlap.

CREATE OR REPLACE FUNCTION public.appointment_holds_slot(
  p_status          TEXT,
  p_hold_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_status IN ('confirmed', 'checked_in')
      OR (p_status = 'pending' AND (p_hold_expires_at IS NULL OR p_hold_expires_at > now()));
$$;

COMMENT ON FUNCTION public.appointment_holds_slot(TEXT, TIMESTAMPTZ) IS
  'THE slot-occupancy rule. Shared by get_available_slots, doctors_available_today, slot_is_occupied and the booking/reschedule RPCs so availability and booking cannot disagree.';

GRANT EXECUTE ON FUNCTION public.appointment_holds_slot(TEXT, TIMESTAMPTZ)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2) slot_lock_key — one hashing rule so every writer takes the SAME lock
-- ---------------------------------------------------------------------------
-- IMMUTABLE: depends only on its arguments. Defined once because a mismatch between
-- call sites would silently defeat the mutual exclusion.

CREATE OR REPLACE FUNCTION public.slot_lock_key(
  p_doctor_id  UUID,
  p_slot_date  DATE,
  p_slot_start TIME
)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT hashtextextended(
    p_doctor_id::TEXT || '|' || p_slot_date::TEXT || '|' || p_slot_start::TEXT, 0
  );
$$;

COMMENT ON FUNCTION public.slot_lock_key(UUID, DATE, TIME) IS
  'Advisory-lock key for one bookable slot. Every writer that releases-then-claims must lock on this.';

GRANT EXECUTE ON FUNCTION public.slot_lock_key(UUID, DATE, TIME)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) slot_is_occupied — RLS-independent occupancy read
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason as get_available_slots: the caller's RLS
-- hides other patients' rows, which is precisely the blindness being fixed.
-- Returns a BOOLEAN and nothing else — no id, no patient, no times.

CREATE OR REPLACE FUNCTION public.slot_is_occupied(
  p_doctor_id     UUID,
  p_slot_date     DATE,
  p_slot_start    TIME,
  p_exclude_appt  UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id    = p_doctor_id
      AND a.slot_date    = p_slot_date
      AND a.slot_start   = p_slot_start
      AND a.is_emergency = FALSE
      AND (p_exclude_appt IS NULL OR a.id <> p_exclude_appt)
      AND public.appointment_holds_slot(a.status::TEXT, a.hold_expires_at)
  );
$$;

COMMENT ON FUNCTION public.slot_is_occupied(UUID, DATE, TIME, UUID) IS
  'Is this slot held right now? SECURITY DEFINER so the answer does not depend on which patient is asking. Returns only a boolean.';

GRANT EXECUTE ON FUNCTION public.slot_is_occupied(UUID, DATE, TIME, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) expired_hold_on_slot — find the stale hold the caller cannot see
-- ---------------------------------------------------------------------------
-- Read-only lookup, SECURITY DEFINER. Returns ONLY the id of a `pending`,
-- already-EXPIRED, UNPAID hold on that exact slot (or NULL). The booking path needs
-- the id so it can hand it to `release_unpaid_hold` — the single release
-- implementation. This helper deliberately performs NO deletion of its own.
--
-- Disclosure: a UUID of an abandoned, expired, unpaid hold on a slot the caller is
-- already allowed to query availability for. No patient, time or payment data.

CREATE OR REPLACE FUNCTION public.expired_hold_on_slot(
  p_doctor_id  UUID,
  p_slot_date  DATE,
  p_slot_start TIME
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id
  FROM public.appointments a
  WHERE a.doctor_id       = p_doctor_id
    AND a.slot_date       = p_slot_date
    AND a.slot_start      = p_slot_start
    AND a.is_emergency    = FALSE
    AND a.status          = 'pending'
    AND a.hold_expires_at IS NOT NULL
    AND a.hold_expires_at <= now()
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.appointment_id = a.id AND p.status = 'paid'
    )
  ORDER BY a.hold_expires_at
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.expired_hold_on_slot(UUID, DATE, TIME) IS
  'Id of an expired, unpaid, pending hold occupying this slot (or NULL). Lookup only — release goes through release_unpaid_hold.';

GRANT EXECUTE ON FUNCTION public.expired_hold_on_slot(UUID, DATE, TIME)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) release_unpaid_hold — ONE added authorization branch
-- ---------------------------------------------------------------------------
-- Body is 20260717000002 §3 VERBATIM except the authenticated branch. The
-- service-role branch, the ALREADY_PAID guard, the NOT_A_PENDING_HOLD guard and the
-- delete ordering are untouched, so HAMS's sweep_expired_holds() behaves exactly as
-- before. Signature unchanged → existing GRANTs stand.

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
  --  • authenticated OWNER  → may release their own reservation at any time (they
  --    are abandoning it), expired or not.                              [unchanged]
  --  • authenticated NON-OWNER → may release ONLY an already-EXPIRED hold. Added so
  --    book/reschedule can claim a slot whose hold has lapsed without waiting for
  --    the 1-minute cron sweeper. The permitted set is exactly what that sweeper
  --    deletes anyway and exactly what the availability RPCs already report as free;
  --    a confirmed, checked-in, unexpired or PAID row remains untouchable.   [NEW]
  --  • service role (sweeper, auth.uid() IS NULL) → EXPIRED holds only.  [unchanged]
  IF v_uid IS NOT NULL THEN
    IF v_owner_uid IS DISTINCT FROM v_uid
       AND (v_expires IS NULL OR v_expires > now()) THEN
      RETURN json_build_object('success', FALSE, 'error', 'FORBIDDEN');
    END IF;
  ELSE
    IF v_expires IS NULL OR v_expires >= now() THEN
      RETURN json_build_object('success', FALSE, 'error', 'HOLD_NOT_EXPIRED');
    END IF;
  END IF;

  -- Never void a reservation that has already been paid (late-payment /
  -- reconciliation is handled by the webhook/verify path — not here).
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
-- 6) get_available_slots — SECURITY DEFINER (B4) + shared occupancy rule (B2)
-- ---------------------------------------------------------------------------
-- Body is 20260811000000 §2 VERBATIM except: SECURITY DEFINER + locked search_path
-- + STABLE (it is read-only), and booked_slots now uses appointment_holds_slot.
-- Bug 1's Oman window clamp and elapsed-slot guard are preserved unchanged.
-- Signature unchanged → the authenticated + anon GRANTs from 20260717000003 stand.

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
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    -- B4: this read is why the function must be SECURITY DEFINER. Under SECURITY
    -- INVOKER, `appointments_patient_read` silently reduced it to the CALLER'S OWN
    -- rows (anon: zero rows), so slots taken by other patients were reported free.
    -- B2: occupancy comes from the shared rule, so it cannot drift from the
    -- booking path again.
    SELECT a.slot_start AS booked_start
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.slot_date = p_date
      AND a.is_emergency = FALSE
      AND public.appointment_holds_slot(a.status::TEXT, a.hold_expires_at)
  )

  SELECT
    a.start_time,
    a.end_time,
    a.type
  FROM adjusted_slots a
  WHERE
    NOT EXISTS (
      SELECT 1 FROM booked_slots b WHERE b.booked_start = a.start_time
    )
    AND (p_include_walkin = TRUE OR a.type != 'walkin_reserved')
    -- Bug 1 (20260811000000): no elapsed slots today, Oman time.
    AND (p_date > v_today OR a.start_time > v_time_now)
  ORDER BY a.start_time;

END;
$$;

COMMENT ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN) IS
  'Bookable slots for a doctor on an Oman calendar date. SECURITY DEFINER so occupancy does not depend on the caller''s RLS; returns only slot times, never patient data.';

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 7) doctors_available_today — shared occupancy rule
-- ---------------------------------------------------------------------------
-- Body is 20260811000000 §3 VERBATIM except the occupancy predicate. Already
-- SECURITY DEFINER since 20260721000000.

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
        AND public.appointment_holds_slot(a.status::TEXT, a.hold_expires_at)
    );
$$;

GRANT EXECUTE ON FUNCTION public.doctors_available_today(DATE)
  TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 8) book_appointment_atomic — lock, release a lapsed hold, then claim
-- ---------------------------------------------------------------------------
-- Body is 20260811000000 §4 VERBATIM plus the lock + release immediately before the
-- INSERT. Stays SECURITY INVOKER: the INSERT must remain subject to
-- `appointments_patient_insert` and its aal2_or_no_2fa() check. That is exactly why
-- the stale-hold lookup is delegated to expired_hold_on_slot (a definer helper) —
-- making this function definer would have bypassed patient INSERT RLS.

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
  v_stale_hold     UUID;
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

  -- B2: serialize every release-then-claim on this slot. MUST precede the release —
  -- it is what makes removing another patient's lapsed hold safe against a
  -- concurrent claim. Transaction-scoped: freed on COMMIT or ROLLBACK.
  PERFORM pg_advisory_xact_lock(public.slot_lock_key(p_doctor_id, p_slot_date, p_slot_start));

  -- B2 + B4: an expired unpaid hold is FREE per the availability rule, so it must
  -- not block the claim. Looked up through a definer helper (this function's own RLS
  -- cannot see another patient's row) and released through the ONE release
  -- implementation the sweeper also uses. Correctness does not wait for cron.
  v_stale_hold := public.expired_hold_on_slot(p_doctor_id, p_slot_date, p_slot_start);
  IF v_stale_hold IS NOT NULL THEN
    PERFORM public.release_unpaid_hold(v_stale_hold);
  END IF;

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
      CASE WHEN p_is_emergency THEN NULL ELSE (now() + INTERVAL '10 minutes') END,
      NULLIF(btrim(p_reason), '')
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

  EXCEPTION
    WHEN unique_violation THEN
      -- uq_appointment_slot remains the final arbiter under concurrency.
      RETURN json_build_object('success', FALSE, 'error', 'SLOT_ALREADY_BOOKED');
    WHEN OTHERS THEN
      RETURN json_build_object('success', FALSE, 'error', SQLERRM);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(UUID, UUID, UUID, DATE, TIME, TEXT, BOOLEAN, UUID, TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) reschedule_appointment_atomic — same treatment on the move path
-- ---------------------------------------------------------------------------
-- Body is 20260811000000 §5 VERBATIM plus the lock + release, and the conflict check
-- now goes through slot_is_occupied. That check previously ran under the caller's
-- own RLS, so it could not see another patient's appointment either — it returned
-- "no conflict" and the move then failed on the unique index. It now returns the
-- correct SLOT_ALREADY_TAKEN instead of relying on the exception path.

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
  v_appt       public.appointments%ROWTYPE;
  v_cutoff     INTEGER := 4;
  v_slot_time  TIMESTAMPTZ;
  v_today      DATE := public.oman_today();
  v_stale_hold UUID;
BEGIN
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

  IF p_new_date < v_today THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reschedule to a past date');
  END IF;

  IF p_new_date = v_today AND p_new_start <= public.oman_time_now() THEN
    RETURN json_build_object('success', false, 'error', 'SLOT_IN_PAST');
  END IF;

  v_slot_time := ((v_appt.slot_date + v_appt.slot_start)::TIMESTAMP) AT TIME ZONE 'Asia/Muscat';

  SELECT COALESCE(reschedule_cutoff_hours, 4) INTO v_cutoff
  FROM public.facility_settings
  WHERE facility_id = v_appt.facility_id;

  IF v_cutoff IS NULL THEN v_cutoff := 4; END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - (v_cutoff * INTERVAL '1 hour')) THEN
    RETURN json_build_object('success', false, 'error', 'Too late to reschedule');
  END IF;

  -- B2: same lock + release as the booking path, so a lapsed hold on the TARGET slot
  -- does not block a legitimate move and two movers cannot race.
  PERFORM pg_advisory_xact_lock(public.slot_lock_key(v_appt.doctor_id, p_new_date, p_new_start));

  v_stale_hold := public.expired_hold_on_slot(v_appt.doctor_id, p_new_date, p_new_start);
  IF v_stale_hold IS NOT NULL AND v_stale_hold <> p_id THEN
    PERFORM public.release_unpaid_hold(v_stale_hold);
  END IF;

  -- B4: RLS-independent occupancy check (was blind to other patients' rows).
  IF public.slot_is_occupied(v_appt.doctor_id, p_new_date, p_new_start, p_id) THEN
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
