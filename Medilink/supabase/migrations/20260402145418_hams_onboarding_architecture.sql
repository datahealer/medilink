-- ================================================================
-- HAMS — CLINIC ADMIN & DOCTOR ONBOARDING (FINAL - PRODUCTION SAFE)
-- ================================================================


-- ================================================================
-- 1. ENUMS (SAFE)
-- ================================================================

DO $$ BEGIN
  CREATE TYPE public.invite_type AS ENUM ('facility_admin', 'doctor', 'technician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.onboarding_status AS ENUM (
    'invited', 'basic_info', 'credentials', 'availability', 'documents', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doctor_doc_type AS ENUM (
    'medical_license', 'degree_certificate', 'specialization_certificate',
    'passport', 'national_id', 'malpractice_insurance', 'cv', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.doc_verification_status AS ENUM (
    'pending', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ================================================================
-- 2. AUDIT LOGS
-- ================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id),
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_only"
ON public.audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin','facility_admin')
  )
);


-- ================================================================
-- 3. FACILITY ADMIN LIMIT
-- ================================================================

CREATE TABLE IF NOT EXISTS public.facility_admin_limit (
  facility_id UUID PRIMARY KEY REFERENCES public.facilities(id) ON DELETE CASCADE,
  max_admins INTEGER NOT NULL DEFAULT 1 CHECK (max_admins BETWEEN 1 AND 20),
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.hams_init_facility_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.facility_admin_limit (facility_id, updated_by)
  VALUES (NEW.id, auth.uid())
  ON CONFLICT (facility_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_facility_created_init_limit ON public.facilities;

CREATE TRIGGER on_facility_created_init_limit
AFTER INSERT ON public.facilities
FOR EACH ROW EXECUTE FUNCTION public.hams_init_facility_limit();


-- ================================================================
-- 4. FACILITY ADMINS
-- ================================================================

CREATE TABLE IF NOT EXISTS public.facility_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  permissions JSONB NOT NULL DEFAULT '{
    "onboard_doctors": true,
    "manage_appointments": true,
    "view_reports": true,
    "edit_clinic_profile": false,
    "access_billing": false
  }',

  is_primary BOOLEAN DEFAULT FALSE,
  assigned_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,

  UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_fa_active
ON public.facility_admins (facility_id, user_id)
WHERE revoked_at IS NULL;


-- ================================================================
-- 5. INVITATIONS (FINAL - BULLETPROOF)
-- ================================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 🔥 ENSURE ALL COLUMNS EXIST FIRST (CRITICAL)
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invite_type public.invite_type;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS facility_id UUID;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_hash TEXT;

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS status public.invite_status DEFAULT 'pending';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_name TEXT;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours');
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 🔥 FIX OLD DATA
UPDATE public.invitations
SET status = 'pending'
WHERE status IS NULL;

-- 🔥 NOW SAFE TO ENFORCE CONSTRAINTS
ALTER TABLE public.invitations ALTER COLUMN invite_type SET NOT NULL;
ALTER TABLE public.invitations ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.invitations ALTER COLUMN facility_id SET NOT NULL;
ALTER TABLE public.invitations ALTER COLUMN token_hash SET NOT NULL;

-- CONSTRAINT
ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS inv_accepted_has_timestamp;

ALTER TABLE public.invitations
ADD CONSTRAINT inv_accepted_has_timestamp
CHECK (status != 'accepted' OR accepted_at IS NOT NULL);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_pending
ON public.invitations (facility_id, invite_type, email)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ix_inv_expires
ON public.invitations (expires_at)
WHERE status = 'pending';

-- SECURITY
REVOKE INSERT, UPDATE ON public.invitations FROM authenticated;

-- ================================================================
-- 6. DOCTOR ONBOARDING
-- ================================================================

CREATE TABLE IF NOT EXISTS public.doctor_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID UNIQUE REFERENCES public.doctors(id) ON DELETE CASCADE,

  status public.onboarding_status DEFAULT 'invited',

  step_basic_info BOOLEAN DEFAULT FALSE,
  step_credentials BOOLEAN DEFAULT FALSE,
  step_availability BOOLEAN DEFAULT FALSE,
  step_documents BOOLEAN DEFAULT FALSE,

  license_number TEXT,
  license_expiry DATE,
  license_verified BOOLEAN DEFAULT FALSE,
  license_verified_by UUID REFERENCES public.profiles(id),
  license_verified_at TIMESTAMPTZ,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  initiated_by UUID REFERENCES public.profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS doctor_onboarding_updated_at ON public.doctor_onboarding;

CREATE TRIGGER doctor_onboarding_updated_at
BEFORE UPDATE ON public.doctor_onboarding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS ix_doctor_onboarding_status
ON public.doctor_onboarding (status);


-- ================================================================
-- 7. DOCTOR DOCUMENTS
-- ================================================================

CREATE TABLE IF NOT EXISTS public.doctor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,

  doc_type public.doctor_doc_type NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT NOT NULL,

  verification_status public.doc_verification_status DEFAULT 'pending',
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  deleted_at TIMESTAMPTZ,

  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dd_doctor
ON public.doctor_documents (doctor_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_dd_status
ON public.doctor_documents (verification_status);
