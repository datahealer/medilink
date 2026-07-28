-- ============================================================================
-- PHASE 5 (logic) — acknowledge_queue_call()
-- ============================================================================
-- Lets a patient confirm "I've seen the call" or "I'm on my way".
--
-- Why an RPC rather than a patient UPDATE policy:
--   queue_items_access is the only policy carrying a WITH CHECK clause and it
--   admits only facility_admin and facility_staff. Granting patients UPDATE
--   would mean a second write policy, and RLS cannot restrict WHICH columns a
--   patient may set — they could rewrite position or status. A SECURITY DEFINER
--   RPC writes exactly two columns and nothing else.
--
-- Columns come from 20260728000003; the ownership helper from 20260728000002.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acknowledge_queue_call(
  p_appointment_id UUID DEFAULT NULL,
  p_kind           TEXT DEFAULT 'seen'
)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_q      RECORD;
  v_first  BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', FALSE, 'reason', 'unauthenticated');
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('seen', 'on_my_way') THEN
    RETURN json_build_object('success', FALSE, 'reason', 'invalid_kind');
  END IF;

  -- Authorise before touching anything. A non-owner gets the same answer
  -- whether or not the appointment exists, so this cannot be used to probe.
  -- Reuses the pre-existing public._owns_appointment() found on the linked
  -- project rather than introducing a second ownership helper.
  IF p_appointment_id IS NOT NULL AND NOT public._owns_appointment(p_appointment_id) THEN
    RETURN json_build_object('success', FALSE, 'reason', 'forbidden');
  END IF;

  -- Lock the row so concurrent taps from two devices serialise.
  SELECT q.id, q.status, q.acknowledged_at
  INTO v_q
  FROM queue_items q
  JOIN appointments     a  ON a.id  = q.appointment_id
  JOIN patient_profiles pp ON pp.id = a.patient_id
  WHERE pp.user_id = v_uid
    AND (p_appointment_id IS NULL OR q.appointment_id = p_appointment_id)
    AND q.status IN ('waiting', 'called')
  ORDER BY
    CASE q.status WHEN 'called' THEN 0 ELSE 1 END,
    q.position ASC
  LIMIT 1
  FOR UPDATE OF q;

  IF NOT FOUND THEN
    RETURN json_build_object('success', FALSE, 'reason', 'not_in_active_queue');
  END IF;

  v_first := v_q.acknowledged_at IS NULL;

  -- Latest signal wins: a patient who tapped "seen" and then "on my way"
  -- should surface as on_my_way to reception, with a fresh timestamp.
  UPDATE queue_items
  SET acknowledged_at   = NOW(),
      acknowledged_kind = p_kind
  WHERE id = v_q.id;

  RETURN json_build_object(
    'success',           TRUE,
    'queue_item_id',     v_q.id,
    'queue_status',      v_q.status,
    'acknowledged_kind', p_kind,
    'first_acknowledgement', v_first,
    'acknowledged_at',   NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_queue_call(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_queue_call(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.acknowledge_queue_call(UUID, TEXT) IS
  'Patient confirms a queue call (seen | on_my_way). SECURITY DEFINER so it can '
  'write acknowledged_at/acknowledged_kind without granting patients UPDATE on '
  'queue_items. Ownership derived from auth.uid().';
