-- Refund integrity (MediLink release-audit B3 / tracker Phase 1 tasks 1.5–1.7).
--
-- The previous refund route (backend/.../payments/[id]/refund) was broken:
--   • no cancellation guard — it refunded even non-cancelled appointments;
--   • not atomic — a fetch → Thawani call → insert with a non-transactional
--     duplicate check, so concurrent calls could both issue a real refund;
--   • it never set payments.status, so a refunded payment still read as 'paid';
--   • it INSERTed a non-existent refunds.facility_id column (would fail at runtime);
--   • it read facility_settings.refund_percent (the column is partial_refund_percent);
--   • it compared appointments.cancelled_by (a profiles UUID) to the string 'facility',
--     so the facility-cancellation full-refund path never triggered.
--
-- This migration moves the refund decision + claim into an atomic, idempotent RPC that
-- derives the amount server-side from the clinic's configurable policy
-- (facility_settings.cancellation_cutoff_hours + partial_refund_percent). The external
-- Thawani call stays in the route (it cannot run inside a DB transaction); the RPC
-- claims the refund first so a second concurrent request can never double-refund.
--
-- Additive + reversible: three new functions only. No table/column/enum changes
-- (hams_payment_status already has 'refunded' + 'partial_refund'; refund_status already
-- has 'pending'/'failed'). Concurrency is guaranteed by SELECT … FOR UPDATE on the
-- payment row — two refund attempts for the same payment serialize on that lock.

-- 1. Validate + atomically claim a refund. Returns a JSON verdict; never calls Thawani.
CREATE OR REPLACE FUNCTION public.request_appointment_refund(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment        public.payments%ROWTYPE;
  v_appt           public.appointments%ROWTYPE;
  v_refund         public.refunds%ROWTYPE;
  v_cutoff         integer;
  v_percent        integer;
  v_canceller_role text;
  v_is_facility    boolean;
  v_hours          numeric;
  v_amount         numeric(10,3);
BEGIN
  -- Serialize concurrent refund attempts for this payment (prevents double refund).
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_NOT_FOUND');
  END IF;

  -- Idempotency: an active (not failed/rejected) refund already exists → return it,
  -- so the caller does NOT issue a second gateway refund.
  SELECT * INTO v_refund
    FROM public.refunds
   WHERE payment_id = p_payment_id AND status NOT IN ('failed', 'rejected')
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'code', 'ALREADY_REQUESTED', 'already', true,
      'refund_id', v_refund.id, 'amount', v_refund.amount,
      'gateway_session_id', v_payment.gateway_session_id
    );
  END IF;

  IF v_payment.status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_NOT_PAID', 'status', v_payment.status);
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = v_payment.appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPOINTMENT_NOT_FOUND');
  END IF;

  -- Cancellation guard: only a cancelled appointment is refundable.
  IF v_appt.status <> 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPOINTMENT_NOT_CANCELLED', 'status', v_appt.status);
  END IF;

  -- Clinic-configurable policy (defaults mirror the facility_settings defaults).
  SELECT cancellation_cutoff_hours, partial_refund_percent
    INTO v_cutoff, v_percent
    FROM public.facility_settings
   WHERE facility_id = v_payment.facility_id;
  v_cutoff  := COALESCE(v_cutoff, 2);
  v_percent := COALESCE(v_percent, 50);

  -- Who cancelled? A staff/facility cancellation always refunds in full. cancelled_by
  -- is a profiles UUID; a 'patient' role (or an unknown/null canceller) uses the
  -- timing-based policy.
  SELECT role::text INTO v_canceller_role FROM public.profiles WHERE id = v_appt.cancelled_by;
  v_is_facility := v_canceller_role IS NOT NULL AND v_canceller_role <> 'patient';

  -- Hours between now and the slot, in the clinic timezone (default Asia/Muscat, R5).
  v_hours := EXTRACT(EPOCH FROM (
    (v_appt.slot_date + v_appt.slot_start::time) - (now() AT TIME ZONE 'Asia/Muscat')
  )) / 3600.0;

  IF v_is_facility OR v_hours >= v_cutoff THEN
    v_amount := v_payment.amount;                                    -- full refund
  ELSE
    v_amount := round(v_payment.amount * v_percent / 100.0, 3);      -- partial refund
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'code', 'NO_REFUND_DUE', 'already', false, 'amount', 0);
  END IF;

  -- Claim: insert the pending refund inside the same locked transaction. Because the
  -- payment row is locked FOR UPDATE, no concurrent request can reach this point for
  -- the same payment until we commit, so exactly one refund row is ever created.
  INSERT INTO public.refunds (payment_id, amount, reason, status)
  VALUES (p_payment_id, v_amount, 'Appointment cancellation', 'pending')
  RETURNING * INTO v_refund;

  RETURN jsonb_build_object(
    'ok', true, 'code', 'REFUND_REQUESTED', 'already', false,
    'refund_id', v_refund.id, 'amount', v_amount, 'payment_amount', v_payment.amount,
    'gateway_session_id', v_payment.gateway_session_id
  );
END;
$$;

-- 2. Finalize after the gateway accepts the refund: record the ref + flip the payment
--    to refunded (full) or partial_refund (partial), atomically.
CREATE OR REPLACE FUNCTION public.finalize_appointment_refund(
  p_refund_id uuid,
  p_gateway_ref text,
  p_gateway_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.refunds
     SET gateway_refund_ref = p_gateway_ref,
         gateway_response = p_gateway_response
   WHERE id = p_refund_id;

  UPDATE public.payments p
     SET status = CASE
                    WHEN r.amount >= p.amount THEN 'refunded'::public.hams_payment_status
                    ELSE 'partial_refund'::public.hams_payment_status
                  END,
         updated_at = now()
    FROM public.refunds r
   WHERE r.id = p_refund_id AND p.id = r.payment_id;
END;
$$;

-- 3. Mark a refund failed if the gateway declines. Leaves payments.status = 'paid' and
--    (because uq is by active status) allows a later retry to create a fresh refund.
CREATE OR REPLACE FUNCTION public.fail_appointment_refund(
  p_refund_id uuid,
  p_gateway_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.refunds
     SET status = 'failed'::public.refund_status,
         gateway_response = p_gateway_response
   WHERE id = p_refund_id;
END;
$$;

-- Least privilege: only the backend service role may invoke these.
REVOKE ALL ON FUNCTION public.request_appointment_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_appointment_refund(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_appointment_refund(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_appointment_refund(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_appointment_refund(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_appointment_refund(uuid, jsonb) TO service_role;
