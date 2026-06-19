-- ================================================================
-- BUG-4: Technician Onboarding State Tracking
-- ================================================================
-- Mirrors doctor_onboarding so technicians are not instantly
-- active after invitation acceptance. Onboarding status gates
-- access to technician-specific features until 'completed'.
-- ================================================================
 
CREATE TABLE IF NOT EXISTS public.technician_onboarding (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID         UNIQUE NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  status        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
ALTER TABLE public.technician_onboarding ENABLE ROW LEVEL SECURITY;
 
-- Technician reads/updates own onboarding record
DROP POLICY IF EXISTS "technician_onboarding_self" ON public.technician_onboarding;
CREATE POLICY "technician_onboarding_self"
ON public.technician_onboarding
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.id = technician_id
    AND t.user_id = auth.uid()
  )
);
 
-- Facility admin can view onboarding status for their facility's technicians
DROP POLICY IF EXISTS "technician_onboarding_facility_admin_read" ON public.technician_onboarding;
CREATE POLICY "technician_onboarding_facility_admin_read"
ON public.technician_onboarding
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.technicians t
    JOIN public.facility_admins fa ON fa.facility_id = t.facility_id
    WHERE t.id = technician_id
    AND fa.user_id = auth.uid()
    AND fa.revoked_at IS NULL
  )
);
 
-- Super admin sees all
DROP POLICY IF EXISTS "technician_onboarding_super_admin" ON public.technician_onboarding;
CREATE POLICY "technician_onboarding_super_admin"
ON public.technician_onboarding
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);
 
-- Service role bypass (for invitation accept API)
GRANT ALL ON public.technician_onboarding TO service_role;
GRANT SELECT, UPDATE ON public.technician_onboarding TO authenticated;
 