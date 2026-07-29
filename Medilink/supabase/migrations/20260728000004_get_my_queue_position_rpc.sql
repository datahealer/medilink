-- ============================================================================
-- PHASE 3 — get_my_queue_position()
-- ============================================================================
-- The single read surface MediLink uses for live queue state.
--
-- Why an RPC and not a table read:
--   `people_ahead` and `now_serving_position` are aggregates over rows the
--   patient must never see. RLS alone cannot express "count rows you cannot
--   read". SECURITY DEFINER lets the aggregate run with full visibility while
--   the function returns only scalars — never another patient's row.
--
-- PHI guarantee. The payload contains exactly:
--   * the caller's own queue row and appointment
--   * integer counts (position, people_ahead, now_serving_position)
--   * doctor identity/status and facility name, both already public via the
--     doctor profile and facility listing pages
-- It contains no other patient's name, phone, appointment or queue row.
--
-- Ownership is re-derived from auth.uid() inside the function. Callers cannot
-- impersonate: p_appointment_id is a filter, never a trust boundary.
-- ============================================================================

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

  -- Explicit authorisation when a specific appointment is requested. A
  -- non-owner gets 'forbidden' whether or not the appointment exists, so the
  -- response cannot be used to probe for valid appointment ids.
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

  -- Resolve the queue row. With no appointment specified, pick the most
  -- relevant one: currently called first, then earliest waiting, then an
  -- item completed in the last 2h so the client can render a "done" state.
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
      OR q.status IN ('waiting', 'called')
      OR (q.status = 'done' AND q.done_at > NOW() - INTERVAL '2 hours')
    )
  ORDER BY
    CASE q.status WHEN 'called' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
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

  -- Facility pacing, used for the ETA.
  SELECT COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_avg_minutes
  FROM facility_settings fs
  WHERE fs.facility_id = v_q.facility_id;

  v_avg_minutes := COALESCE(v_avg_minutes, 15);

  -- people_ahead is scoped to the same doctor when one is assigned, because
  -- doctors consult in parallel; `position` is a facility-wide sequence and on
  -- its own would badly overstate the wait. Unassigned rows form their own
  -- pool. 'called' rows count as ahead — that patient is still occupying the
  -- room.
  IF v_q.status = 'waiting' THEN
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

  -- Lowest-positioned patient currently with the doctor. An integer only.
  SELECT MIN(q3.position)
  INTO v_now_serving
  FROM queue_items q3
  WHERE q3.facility_id = v_q.facility_id
    AND q3.status = 'called'
    AND q3.doctor_id IS NOT DISTINCT FROM v_q.doctor_id;

  v_eta := CASE
             WHEN v_q.status = 'waiting' THEN v_people_ahead * v_avg_minutes
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

REVOKE ALL ON FUNCTION public.get_my_queue_position(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_queue_position(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_queue_position(UUID) IS
  'Live queue state for the calling patient only. SECURITY DEFINER so it can '
  'aggregate people_ahead / now_serving over rows the caller cannot read, while '
  'returning no other patient PHI. Ownership is derived from auth.uid(); '
  'p_appointment_id is a filter, not a trust boundary.';
