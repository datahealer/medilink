-- Add facility_id to profiles table.
-- Single source of truth for which facility this user belongs to.
-- Populated during invite acceptance (doctor, technician, facility_admin flows).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_profiles_facility_id
  ON public.profiles (facility_id)
  WHERE facility_id IS NOT NULL;
