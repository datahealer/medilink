-- Fix: patients could not read their own payment rows.
--
-- Symptom: the mobile app showed "Payment not found" after paying, and the Invoice
-- & Payment History screens were empty.
--
-- Root cause: payments.patient_id is the auth user id (its FK targets profiles(id) =
-- auth.uid(), and POST /api/payments/checkout writes user.id into it). But the
-- original read policy keyed off patient_profiles.id:
--   USING (patient_id IN (SELECT id FROM patient_profiles WHERE user_id = auth.uid()))
-- patient_profiles.id is a separate uuid from the auth uid, so that subquery never
-- matched the stored value and every patient SELECT on payments returned 0 rows.
--
-- Fix: align the read policy with the column's actual identity (auth.uid()).

DROP POLICY IF EXISTS "payments_patient_read" ON public.payments;

CREATE POLICY "payments_patient_read" ON public.payments
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());
