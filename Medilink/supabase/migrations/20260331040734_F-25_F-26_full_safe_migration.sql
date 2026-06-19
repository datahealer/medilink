-- =========================================================
-- F-25 + F-26 FULL SAFE MIGRATION
-- =========================================================


-- =========================================================
-- F-25: OVERBOOKING CONTROL
-- =========================================================

-- 1. Add emergency column safely
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Fix unique index for slot booking
DROP INDEX IF EXISTS uq_appointment_slot;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_slot
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in')
AND is_emergency = FALSE;

-- 3. Performance index
CREATE INDEX IF NOT EXISTS ix_appointments_slot_lookup
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in')
AND is_emergency = FALSE;


-- =========================================================
-- F-26: WAITLIST MANAGEMENT
-- =========================================================

-- 1. Ensure enum exists
DO $$ BEGIN
  CREATE TYPE public.waitlist_status AS ENUM (
    'waiting', 'offered', 'expired', 'booked', 'withdrawn'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- 2. Create table if not exists
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,

  preferred_date DATE NOT NULL,

  position INTEGER NOT NULL DEFAULT 1,

  status public.waitlist_status NOT NULL DEFAULT 'waiting',

  offered_slot JSONB,
  offered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 3. Ensure columns exist (for older DBs)
ALTER TABLE public.waitlist_entries
ADD COLUMN IF NOT EXISTS offered_slot JSONB,
ADD COLUMN IF NOT EXISTS offered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;


-- =========================================================
-- INDEXES
-- =========================================================

-- Queue lookup
CREATE INDEX IF NOT EXISTS ix_waitlist_queue
ON public.waitlist_entries (doctor_id, preferred_date, status, position);

-- Prevent duplicate position
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_position
ON public.waitlist_entries (doctor_id, preferred_date, position);

-- Prevent duplicate patient entry
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_patient_once
ON public.waitlist_entries (patient_id, doctor_id, preferred_date)
WHERE status IN ('waiting','offered');


-- =========================================================
-- CONSTRAINTS
-- =========================================================

DO $$ BEGIN
  ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT valid_waitlist_flow CHECK (
    (status = 'waiting' AND offered_at IS NULL)
    OR
    (status = 'offered' AND offered_at IS NOT NULL)
    OR
    (status IN ('expired','booked','withdrawn'))
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- =========================================================
-- RLS (ROW LEVEL SECURITY)
-- =========================================================

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Patient can manage own waitlist
DO $$ BEGIN
  CREATE POLICY "waitlist_patient_own"
  ON public.waitlist_entries
  FOR ALL TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Staff can read
DO $$ BEGIN
  CREATE POLICY "waitlist_staff_read"
  ON public.waitlist_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('facility_admin','doctor','super_admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- =========================================================
-- GRANTS
-- =========================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.waitlist_entries
TO authenticated;

GRANT ALL
ON public.waitlist_entries
TO service_role;


-- =========================================================
-- OPTIONAL: FUNCTION PERMISSIONS (F-25 RPCs)
-- =========================================================

GRANT EXECUTE ON FUNCTION public.get_available_slots(
  UUID,
  DATE,
  BOOLEAN
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(
  UUID,
  UUID,
  UUID,
  DATE,
  TIME,
  TEXT,
  BOOLEAN
) TO authenticated;


-- =========================================================
-- DONE ✅ PRODUCTION READY
-- =========================================================

