-- Replace the broad FOR ALL policy with explicit per-operation policies so that
-- the USING / WITH CHECK clauses are enforced correctly for each statement type.
-- Doctors may only mutate their own doctor_availability rows.
-- facility_admin and super_admin may mutate any row.

DROP POLICY IF EXISTS "doctor_availability_write" ON public.doctor_availability;

CREATE POLICY "doctor_availability_insert" ON public.doctor_availability
  FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('facility_admin', 'super_admin')
    )
  );

CREATE POLICY "doctor_availability_update" ON public.doctor_availability
  FOR UPDATE TO authenticated
  USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('facility_admin', 'super_admin')
    )
  )
  WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('facility_admin', 'super_admin')
    )
  );

CREATE POLICY "doctor_availability_delete" ON public.doctor_availability
  FOR DELETE TO authenticated
  USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('facility_admin', 'super_admin')
    )
  );
