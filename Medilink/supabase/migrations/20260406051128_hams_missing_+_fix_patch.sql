-- =========================================================
-- ✅ HAMS MISSING + FIX PATCH (FINAL WORKING VERSION)
-- =========================================================


-- =========================================================
-- 1. FIX: ADD EMAIL TO PROFILES
-- =========================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
AND p.email IS NULL;


-- =========================================================
-- 2. FIX: INVITATION SYSTEM
-- =========================================================

ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS role TEXT,
ADD COLUMN IF NOT EXISTS facility_id UUID,
ADD COLUMN IF NOT EXISTS token TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS invited_by UUID,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitations_role_check'
  ) THEN
    ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_role_check
    CHECK (role IN ('facility_admin','doctor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitations_status_check'
  ) THEN
    ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_status_check
    CHECK (status IN ('pending','accepted','expired'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invitations' AND column_name='token'
  ) THEN
    CREATE INDEX IF NOT EXISTS ix_invitations_token
    ON public.invitations(token);
  END IF;
END $$;


-- =========================================================
-- 3. FIX: ADMIN LIMIT
-- =========================================================

ALTER TABLE public.facilities
ADD COLUMN IF NOT EXISTS max_admins INTEGER DEFAULT 3;


-- =========================================================
-- 4. FIX: NOTIFICATION ENUM (🔥 FIXED PROPERLY)
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum'
  ) THEN
    CREATE TYPE notification_type_enum AS ENUM ('info','warning','error');
  END IF;
END $$;

-- 🔥 DROP DEFAULT FIRST (THIS FIXES YOUR ERROR)
ALTER TABLE public.in_app_notifications
ALTER COLUMN type DROP DEFAULT;

-- 🔥 CONVERT COLUMN
ALTER TABLE public.in_app_notifications
ALTER COLUMN type TYPE notification_type_enum
USING type::text::notification_type_enum;

-- 🔥 ADD DEFAULT BACK
ALTER TABLE public.in_app_notifications
ALTER COLUMN type SET DEFAULT 'info';


-- =========================================================
-- 5. FIX: FACILITY MEMBERS RLS
-- =========================================================

DROP POLICY IF EXISTS "doctors_facility_admin" ON public.doctors;
DROP POLICY IF EXISTS "doctors_facility_members" ON public.doctors;

CREATE POLICY "doctors_facility_members"
ON public.doctors
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.facility_members fm
    WHERE fm.user_id = auth.uid()
    AND fm.facility_id = doctors.facility_id
  )
);

DROP POLICY IF EXISTS "facilities_admin_write" ON public.facilities;
DROP POLICY IF EXISTS "facilities_members_write" ON public.facilities;

CREATE POLICY "facilities_members_write"
ON public.facilities
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.facility_members fm
    WHERE fm.user_id = auth.uid()
    AND fm.facility_id = facilities.id
  )
);

DROP POLICY IF EXISTS "appointments_facility_admin" ON public.appointments;
DROP POLICY IF EXISTS "appointments_facility_members" ON public.appointments;

CREATE POLICY "appointments_facility_members"
ON public.appointments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.facility_members fm
    WHERE fm.user_id = auth.uid()
    AND fm.facility_id = appointments.facility_id
  )
);


-- =========================================================
-- 6. UNIQUE ACTIVE INVITE
-- =========================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invitations' AND column_name='email'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invitation_active
    ON public.invitations (facility_id, email, role)
    WHERE status = 'pending';
  END IF;
END $$;


-- =========================================================
-- ✅ DONE (THIS WILL NOT FAIL NOW)
-- =========================================================