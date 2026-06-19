-- Fix infinite recursion in patient_profiles RLS (Postgres error 42P17).
-- Migration 20260422102441 joined appointments in this policy, but
-- appointments_patient_read itself reads patient_profiles → cycle.
-- Replace with a simple profiles.role check (no cross-table reference).

DROP POLICY IF EXISTS "patient_profiles_select_staff" ON public.patient_profiles;
DROP POLICY IF EXISTS patient_profiles_select_staff   ON public.patient_profiles;

CREATE POLICY "patient_profiles_select_staff" ON public.patient_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('doctor', 'facility_admin', 'technician', 'staff', 'super_admin')
    )
  );
