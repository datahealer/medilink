-- Phase 5.5 (part 2 of 2) — queue staff operations
--
-- REQUIRES 20260731000001 to be applied first (it adds 'skipped' and 'no_show'
-- to queue_status; PostgreSQL will not let this file both add and use them).
--
-- WHAT THIS ADDS
--   queue_call_next(facility, doctor?)  — call the longest-waiting patient
--   queue_skip(item)                    — patient did not come forward
--   queue_recall(item)                  — put a skipped patient back in line
--   queue_no_show(item)                 — terminal; never attended
-- Plus: `called_by_staff_id` is finally written (the column has existed since
-- 22 April and nothing has ever populated it, leaving the audit trail blank).
--
-- THE STATE MACHINE, made explicit for the first time
--
--     waiting  --call-->  called
--     called   --done-->  done          (existing route, unchanged)
--     called   --skip-->  skipped
--     waiting  --skip-->  skipped       (stepped out before being called)
--     skipped  --recall-> waiting
--     waiting  --no_show-> no_show      (terminal)
--     called   --no_show-> no_show      (terminal)
--
-- Every transition below is guarded, so a double-click or a stale screen
-- cannot drive an item into a nonsense state; each function returns a JSON
-- verdict rather than raising, so callers get a clean message.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE TWO PARTIAL UNIQUE INDEXES MUST CHANGE
--
--   unique_appointment_active_queue  ON (appointment_id) WHERE status IN ('waiting','called')
--   unique_active_queue_position     ON (facility_id, position) WHERE status IN ('waiting','called')
--
-- A `skipped` row is still ACTIVE — the patient is in the building and will be
-- recalled — but it would fall outside both predicates. That would let the same
-- appointment be enqueued a second time (duplicate queue entry for one patient)
-- and let a new arrival be handed a position number the skipped patient still
-- holds, so recalling them would collide. Both indexes are widened to include
-- 'skipped'. `no_show` and `done` are terminal and correctly excluded.
--
-- enqueue_appointment's own idempotency probe is widened for the same reason.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- MEDILINK COMPATIBILITY — the important part
--   get_my_queue_position is re-created to (a) treat 'skipped' as an active
--   state so a skipped patient still sees their entry instead of falling off
--   to "not in queue", and (b) return two NEW booleans, is_skipped and
--   is_no_show, next to the existing is_waiting / is_called / is_done.
--   Additive: every field MediLink reads today keeps its name, type and
--   meaning, so an older client simply ignores the new keys. people_ahead
--   continues to count only 'waiting' and 'called' — a skipped patient is not
--   occupying the doctor and must not inflate anyone's ETA.
--   Signature and GRANTs are unchanged.
--
-- ROLLBACK
--   DROP the four functions, restore the two indexes to the ('waiting','called')
--   predicate, and re-apply get_my_queue_position / enqueue_appointment from
--   20260728000004 and 20260429000006 respectively. No data is migrated by this
--   file, so rollback loses nothing.

-- ---------------------------------------------------------------------------
-- 1) Widen "active" to include 'skipped'
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS unique_appointment_active_queue;
CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_active_queue
ON public.queue_items (appointment_id)
WHERE status IN ('waiting', 'called', 'skipped');

DROP INDEX IF EXISTS unique_active_queue_position;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_queue_position
ON public.queue_items (facility_id, position)
WHERE status IN ('waiting', 'called', 'skipped');

-- enqueue_appointment: same widening in its idempotency probe, and position is
-- still MAX+1 over active rows. Body otherwise verbatim from 20260429000006.
CREATE OR REPLACE FUNCTION public.enqueue_appointment(
  p_appointment_id      UUID,
  p_facility_id         UUID,
  p_doctor_id           UUID,
  p_patient_name        TEXT,
  p_patient_phone       TEXT,
  p_is_walkin           BOOLEAN DEFAULT FALSE,
  p_is_online           BOOLEAN DEFAULT FALSE,
  p_created_by_staff_id UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position INTEGER;
  v_queue_id UUID;
BEGIN
  SELECT id INTO v_queue_id
  FROM queue_items
  WHERE appointment_id = p_appointment_id
    AND status IN ('waiting', 'called', 'skipped')
  LIMIT 1;

  IF v_queue_id IS NOT NULL THEN
    RETURN json_build_object('queue_item_id', v_queue_id, 'already_queued', TRUE);
  END IF;

  SELECT COALESCE(MAX(pos), 0) + 1
  INTO v_position
  FROM (
    SELECT position AS pos
    FROM queue_items
    WHERE facility_id = p_facility_id
      AND status IN ('waiting', 'called', 'skipped')
    FOR UPDATE
  ) locked_rows;

  INSERT INTO queue_items (
    facility_id, appointment_id, doctor_id,
    patient_name, patient_phone,
    is_walkin, is_online, position, status,
    created_by_staff_id
  ) VALUES (
    p_facility_id, p_appointment_id, p_doctor_id,
    p_patient_name, p_patient_phone,
    p_is_walkin, p_is_online, v_position, 'waiting',
    p_created_by_staff_id
  )
  RETURNING id INTO v_queue_id;

  RETURN json_build_object(
    'queue_item_id',  v_queue_id,
    'position',       v_position,
    'already_queued', FALSE
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Staff operations
--     All SECURITY DEFINER: queue_items RLS admits writes only via
--     queue_items_access (facility_admin + staff WITH CHECK). Authorisation is
--     enforced in the API layer before these are called, exactly as the
--     existing call/done path does.
-- ---------------------------------------------------------------------------

-- Call the longest-waiting patient. Optionally scoped to one doctor, which is
-- what a receptionist bound to a single doctor needs.
CREATE OR REPLACE FUNCTION public.queue_call_next(
  p_facility_id UUID,
  p_doctor_id   UUID DEFAULT NULL,
  p_staff_id    UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- FOR UPDATE SKIP LOCKED so two receptionists pressing "Call next" at the
  -- same moment get two different patients instead of blocking or colliding.
  SELECT id, position, patient_name
  INTO v_item
  FROM queue_items
  WHERE facility_id = p_facility_id
    AND status = 'waiting'
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
  ORDER BY position ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'error', 'QUEUE_EMPTY');
  END IF;

  UPDATE queue_items
     SET status = 'called',
         called_at = NOW(),
         called_by_staff_id = COALESCE(p_staff_id, called_by_staff_id)
   WHERE id = v_item.id;

  RETURN json_build_object(
    'success', TRUE,
    'queue_item_id', v_item.id,
    'position', v_item.position,
    'patient_name', v_item.patient_name
  );
END;
$$;

-- Patient did not come forward. Recoverable.
CREATE OR REPLACE FUNCTION public.queue_skip(
  p_queue_item_id UUID,
  p_staff_id      UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status::TEXT INTO v_status
  FROM queue_items WHERE id = p_queue_item_id FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_FOUND');
  END IF;

  IF v_status NOT IN ('waiting', 'called') THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_STATE', 'status', v_status);
  END IF;

  -- position is retained so recall restores the patient's original place.
  UPDATE queue_items
     SET status = 'skipped',
         called_by_staff_id = COALESCE(p_staff_id, called_by_staff_id)
   WHERE id = p_queue_item_id;

  RETURN json_build_object('success', TRUE, 'queue_item_id', p_queue_item_id, 'status', 'skipped');
END;
$$;

-- Bring a skipped patient back into the waiting line, keeping their position.
CREATE OR REPLACE FUNCTION public.queue_recall(
  p_queue_item_id UUID,
  p_staff_id      UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status::TEXT INTO v_status
  FROM queue_items WHERE id = p_queue_item_id FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_FOUND');
  END IF;

  IF v_status <> 'skipped' THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_SKIPPED', 'status', v_status);
  END IF;

  UPDATE queue_items
     SET status = 'waiting',
         called_at = NULL,
         called_by_staff_id = COALESCE(p_staff_id, called_by_staff_id)
   WHERE id = p_queue_item_id;

  RETURN json_build_object('success', TRUE, 'queue_item_id', p_queue_item_id, 'status', 'waiting');
END;
$$;

-- Terminal: the patient never attended.
CREATE OR REPLACE FUNCTION public.queue_no_show(
  p_queue_item_id UUID,
  p_staff_id      UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
  v_appt   UUID;
BEGIN
  SELECT status::TEXT, appointment_id INTO v_status, v_appt
  FROM queue_items WHERE id = p_queue_item_id FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'NOT_FOUND');
  END IF;

  IF v_status NOT IN ('waiting', 'called', 'skipped') THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_STATE', 'status', v_status);
  END IF;

  UPDATE queue_items
     SET status = 'no_show',
         done_at = NOW(),
         called_by_staff_id = COALESCE(p_staff_id, called_by_staff_id)
   WHERE id = p_queue_item_id;

  -- Keep the appointment in step. appointment_status already has 'no_show'
  -- (base schema). Only a still-open appointment is moved; a completed or
  -- cancelled one is left exactly as it is.
  IF v_appt IS NOT NULL THEN
    UPDATE appointments
       SET status = 'no_show'
     WHERE id = v_appt
       AND status IN ('confirmed', 'checked_in');
  END IF;

  RETURN json_build_object('success', TRUE, 'queue_item_id', p_queue_item_id, 'status', 'no_show');
END;
$$;

REVOKE ALL ON FUNCTION public.queue_call_next(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_skip(UUID, UUID)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_recall(UUID, UUID)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_no_show(UUID, UUID)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.queue_call_next(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_skip(UUID, UUID)            TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_recall(UUID, UUID)          TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_no_show(UUID, UUID)         TO service_role;

-- ---------------------------------------------------------------------------
-- 3) get_my_queue_position — teach MediLink the new states
--     Verbatim from 20260728000004 except: 'skipped' counts as active, and two
--     new booleans are returned. Signature and GRANTs unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_queue_position(
  p_appointment_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_owns         BOOLEAN;
  v_q            RECORD;
  v_people_ahead INTEGER := 0;
  v_now_serving  INTEGER;
  v_avg_minutes  INTEGER;
  v_eta          INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('found', FALSE, 'reason', 'unauthenticated');
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM appointments a
      JOIN patient_profiles pp ON pp.id = a.patient_id
      WHERE a.id = p_appointment_id
        AND pp.user_id = v_uid
    ) INTO v_owns;

    IF NOT v_owns THEN
      RETURN json_build_object('found', FALSE, 'reason', 'forbidden');
    END IF;
  END IF;

  SELECT
    q.id                AS queue_item_id,
    q.position          AS position,
    q.status            AS status,
    q.checked_in_at     AS checked_in_at,
    q.called_at         AS called_at,
    q.done_at           AS done_at,
    q.acknowledged_at   AS acknowledged_at,
    q.acknowledged_kind AS acknowledged_kind,
    q.is_walkin         AS is_walkin,
    q.is_online         AS is_online,
    q.facility_id       AS facility_id,
    q.doctor_id         AS doctor_id,
    a.id                AS appointment_id,
    a.reference_number  AS reference_number,
    a.slot_date         AS slot_date,
    a.slot_start        AS slot_start,
    a.slot_end          AS slot_end,
    a.status            AS appointment_status,
    a.type              AS appointment_type,
    a.checked_in_at     AS appointment_checked_in_at,
    d.full_name         AS doctor_name,
    d.specialty         AS doctor_specialty,
    d.status            AS doctor_status,
    d.status_updated_at AS doctor_status_updated_at,
    f.name              AS facility_name
  INTO v_q
  FROM queue_items q
  JOIN appointments      a  ON a.id  = q.appointment_id
  JOIN patient_profiles  pp ON pp.id = a.patient_id
  LEFT JOIN doctors      d  ON d.id  = q.doctor_id
  LEFT JOIN facilities   f  ON f.id  = q.facility_id
  WHERE pp.user_id = v_uid
    AND (p_appointment_id IS NULL OR q.appointment_id = p_appointment_id)
    AND (
      p_appointment_id IS NOT NULL
      -- 'skipped' is active: the patient is still present and will be recalled,
      -- so they must keep seeing their entry rather than "not in queue".
      OR q.status IN ('waiting', 'called', 'skipped')
      OR (q.status IN ('done', 'no_show') AND q.done_at > NOW() - INTERVAL '2 hours')
    )
  ORDER BY
    CASE q.status
      WHEN 'called'  THEN 0
      WHEN 'waiting' THEN 1
      WHEN 'skipped' THEN 2
      ELSE 3
    END,
    q.position ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'found',  FALSE,
      'reason', CASE WHEN p_appointment_id IS NULL
                     THEN 'not_in_queue'
                     ELSE 'not_checked_in' END
    );
  END IF;

  SELECT COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_avg_minutes
  FROM facility_settings fs
  WHERE fs.facility_id = v_q.facility_id;

  v_avg_minutes := COALESCE(v_avg_minutes, 15);

  -- A skipped patient is not occupying the doctor, so they never count as
  -- "ahead" of anyone. Only waiting and called do.
  IF v_q.status IN ('waiting', 'skipped') THEN
    SELECT COUNT(*)
    INTO v_people_ahead
    FROM queue_items q2
    WHERE q2.facility_id = v_q.facility_id
      AND q2.status IN ('waiting', 'called')
      AND q2.position < v_q.position
      AND q2.doctor_id IS NOT DISTINCT FROM v_q.doctor_id;
  ELSE
    v_people_ahead := 0;
  END IF;

  SELECT MIN(q3.position)
  INTO v_now_serving
  FROM queue_items q3
  WHERE q3.facility_id = v_q.facility_id
    AND q3.status = 'called'
    AND q3.doctor_id IS NOT DISTINCT FROM v_q.doctor_id;

  v_eta := CASE
             WHEN v_q.status IN ('waiting', 'skipped') THEN v_people_ahead * v_avg_minutes
             ELSE 0
           END;

  RETURN json_build_object(
    'found',                 TRUE,
    'queue_item_id',         v_q.queue_item_id,
    'position',              v_q.position,
    'people_ahead',          v_people_ahead,
    'now_serving_position',  v_now_serving,
    'queue_status',          v_q.status,
    'is_waiting',            v_q.status = 'waiting',
    'is_called',             v_q.status = 'called',
    'is_done',               v_q.status = 'done',
    -- New in 20260731000002. Additive: older clients ignore them.
    'is_skipped',            v_q.status = 'skipped',
    'is_no_show',            v_q.status = 'no_show',
    'is_checked_in',         v_q.appointment_status = 'checked_in'
                               OR v_q.appointment_checked_in_at IS NOT NULL,
    'checked_in_at',         v_q.checked_in_at,
    'called_at',             v_q.called_at,
    'done_at',               v_q.done_at,
    'acknowledged_at',       v_q.acknowledged_at,
    'acknowledged_kind',     v_q.acknowledged_kind,
    'is_walkin',             v_q.is_walkin,
    'is_online',             v_q.is_online,
    'estimated_wait_minutes',    v_eta,
    'avg_consultation_minutes',  v_avg_minutes,
    'appointment', json_build_object(
      'id',               v_q.appointment_id,
      'reference_number', v_q.reference_number,
      'slot_date',        v_q.slot_date,
      'slot_start',       v_q.slot_start,
      'slot_end',         v_q.slot_end,
      'status',           v_q.appointment_status,
      'type',             v_q.appointment_type,
      'checked_in_at',    v_q.appointment_checked_in_at
    ),
    'doctor', CASE WHEN v_q.doctor_id IS NULL THEN NULL ELSE json_build_object(
      'id',                v_q.doctor_id,
      'full_name',         v_q.doctor_name,
      'specialty',         v_q.doctor_specialty,
      'status',            v_q.doctor_status,
      'status_updated_at', v_q.doctor_status_updated_at
    ) END,
    'facility', json_build_object(
      'id',   v_q.facility_id,
      'name', v_q.facility_name
    ),
    'server_time', NOW()
  );
END;
$$;
