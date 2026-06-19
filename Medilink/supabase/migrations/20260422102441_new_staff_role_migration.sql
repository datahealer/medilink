-- =========================================================
-- F-22 STAFF + QUEUE (SAFE FILE)
-- =========================================================

-- STEP 1: ADD STAFF ROLE
DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STEP 2: STAFF ENUM
DO $$
BEGIN
  CREATE TYPE public.staff_role_type AS ENUM ('receptionist', 'assistant', 'coordinator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STEP 3: TABLE
CREATE TABLE IF NOT EXISTS public.facility_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  assigned_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_type public.staff_role_type NOT NULL DEFAULT 'receptionist',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_facility_staff_facility ON public.facility_staff(facility_id);

-- STEP 4: INVITATIONS
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.facility_staff(id);

-- STEP 5: ENABLE RLS
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;

-- STEP 6: QUEUE POLICY
DROP POLICY IF EXISTS queue_items_access ON public.queue_items;

CREATE POLICY queue_items_access
ON public.queue_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.facility_admins fa
    WHERE fa.user_id = auth.uid()
    AND fa.facility_id = queue_items.facility_id
    AND fa.revoked_at IS NULL
  )
  OR
  EXISTS (
    SELECT 1 FROM public.facility_staff fs
    WHERE fs.user_id = auth.uid()
    AND fs.facility_id = queue_items.facility_id
    AND fs.is_active = TRUE
  )
  OR
  EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.user_id = auth.uid()
    AND d.id = queue_items.doctor_id
    AND d.is_active = TRUE
  )
);

-- STEP 7: FIX PATIENT PROFILE POLICY
DROP POLICY IF EXISTS patient_profiles_select_staff ON public.patient_profiles;

CREATE POLICY patient_profiles_select_staff
ON public.patient_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.appointments a
    JOIN public.facility_staff fs ON fs.facility_id = a.facility_id
    WHERE a.patient_id = patient_profiles.id
    AND fs.user_id = auth.uid()
  )
);

-- STEP 8: QUEUE COLUMNS
ALTER TABLE public.queue_items
ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.facility_staff(id),
ADD COLUMN IF NOT EXISTS called_by_staff_id UUID REFERENCES public.facility_staff(id);