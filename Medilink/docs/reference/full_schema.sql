-- ================================================================
-- HAMS SCHEMA — FINAL CORRECTED MIGRATION
-- ================================================================


-- ================================================================
-- STEP 1: ENUMs
-- ================================================================

CREATE TYPE public.user_role AS ENUM (
  'patient', 'doctor', 'technician', 'facility_admin', 'super_admin'
);
CREATE TYPE public.gender_type AS ENUM (
  'male', 'female', 'other', 'prefer_not_to_say'
);
CREATE TYPE public.blood_group_type AS ENUM (
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
);
CREATE TYPE public.smoking_status AS ENUM (
  'never', 'former', 'current', 'unknown'
);
CREATE TYPE public.family_relation AS ENUM (
  'spouse', 'child', 'parent', 'sibling', 'other'
);
CREATE TYPE public.document_type AS ENUM (
  'prescription', 'report', 'imaging', 'insurance', 'other'
);
CREATE TYPE public.facility_type AS ENUM (
  'clinic', 'hospital', 'lab', 'radiology', 'pharmacy', 'dental',
  'optical', 'physiotherapy', 'mental_health', 'other'
);
CREATE TYPE public.doctor_status AS ENUM (
  'available', 'with_patient', 'on_break', 'unavailable'
);
CREATE TYPE public.appointment_status AS ENUM (
  'pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'
);
CREATE TYPE public.appointment_type AS ENUM (
  'in_person', 'online'
);
CREATE TYPE public.queue_status AS ENUM (
  'waiting', 'called', 'done', 'expired'
);
CREATE TYPE public.waitlist_status AS ENUM (
  'waiting', 'offered', 'expired', 'booked', 'withdrawn'
);
-- renamed: avoids conflict with MakerKit payment_status
CREATE TYPE public.hams_payment_status AS ENUM (
  'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partial_refund'
);
CREATE TYPE public.refund_status AS ENUM (
  'pending', 'processing', 'processed', 'failed', 'rejected'
);
CREATE TYPE public.review_target AS ENUM (
  'doctor', 'facility'
);
CREATE TYPE public.audit_action AS ENUM (
  'login', 'logout', 'register',
  'appointment_create', 'appointment_update', 'appointment_cancel',
  'payment_processed', 'refund_initiated', 'refund_processed',
  'profile_update', 'document_access', 'document_upload', 'document_delete',
  'review_flagged', 'review_removed', 'review_restored',
  'user_suspended', 'user_reactivated',
  'facility_approved', 'facility_suspended',
  'prescription_created', 'lab_result_uploaded',
  '2fa_enabled', '2fa_disabled',
  'data_export_requested', 'account_deletion_requested'
);
CREATE TYPE public.account_status AS ENUM (
  'active', 'suspended', 'deletion_pending', 'deleted'
);
-- renamed: avoids conflict with MakerKit notification_channel
CREATE TYPE public.hams_notification_channel AS ENUM (
  'sms', 'email', 'whatsapp', 'push', 'in_app'
);
-- renamed: avoids potential conflict with MakerKit notification_status
CREATE TYPE public.hams_notification_status AS ENUM (
  'pending', 'sent', 'delivered', 'failed'
);


-- ================================================================
-- STEP 1B: Helper functions
-- ================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Separate trigger name from MakerKit's on_auth_user_created
CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );
  -- Prevent role escalation via metadata
  IF v_role NOT IN ('patient','doctor','technician','facility_admin') THEN
    v_role := 'patient';
  END IF;

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'patient' THEN
    INSERT INTO public.patient_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_hams
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.hams_handle_new_user();


-- ================================================================
-- STEP 1C: profiles
-- ================================================================

CREATE TABLE public.profiles (
  id                    UUID                  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  public.user_role      NOT NULL DEFAULT 'patient',
  full_name             TEXT                  NOT NULL DEFAULT '',
  phone                 TEXT,
  phone_verified        BOOLEAN               NOT NULL DEFAULT FALSE,
  two_factor_enabled    BOOLEAN               NOT NULL DEFAULT FALSE,
  language              TEXT                  NOT NULL DEFAULT 'en',
  theme_preference      TEXT                  NOT NULL DEFAULT 'system',
  notification_prefs    JSONB                 NOT NULL DEFAULT '{"sms":true,"email":true,"whatsapp":false,"push":true}',
  consent_flags         JSONB                 NOT NULL DEFAULT '{"marketing":false,"data_sharing":false,"analytics":true}',
  consented_at          TIMESTAMPTZ,
  push_tokens           TEXT[]                NOT NULL DEFAULT '{}',
  status                public.account_status NOT NULL DEFAULT 'active',
  deletion_requested_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_select_super_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR current_setting('jwt.claims.role', true) = 'super_admin'
  );

CREATE POLICY "profiles_select_facility_staff"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR current_setting('jwt.claims.role', true) IN ('facility_admin', 'doctor', 'technician')
  );

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO anon;


-- ================================================================
-- STEP 2: Auth support tables
-- ================================================================

CREATE TABLE public.otp_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hash         TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.two_factor_secrets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_secret TEXT        NOT NULL,
  enabled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.two_factor_recovery_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash  TEXT        NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_integrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider      TEXT        NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE public.web_push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.otp_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "otp_records_own" ON public.otp_records FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "otp_records_service" ON public.otp_records FOR ALL TO service_role USING (true);

ALTER TABLE public.two_factor_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "2fa_secrets_own" ON public.two_factor_secrets FOR ALL TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.two_factor_recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "2fa_recovery_own" ON public.two_factor_recovery_codes FOR ALL TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrations_own" ON public.user_integrations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "web_push_own" ON public.web_push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_records TO authenticated;
GRANT ALL ON public.otp_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_secrets TO authenticated;
GRANT ALL ON public.two_factor_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_recovery_codes TO authenticated;
GRANT ALL ON public.two_factor_recovery_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;
GRANT SELECT, INSERT, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;


-- ================================================================
-- STEP 3: Patient tables
-- ================================================================

CREATE TABLE public.patient_profiles (
  id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID                    NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_of_birth     DATE,
  gender            public.gender_type,
  blood_group       public.blood_group_type NOT NULL DEFAULT 'unknown',
  profile_photo_url TEXT,
  address           JSONB,
  emergency_contact JSONB,
  created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
CREATE TRIGGER patient_profiles_updated_at
  BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.family_members (
  id            UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID                   NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  full_name     TEXT                   NOT NULL,
  relation      public.family_relation NOT NULL,
  date_of_birth DATE,
  gender        public.gender_type,
  created_at    TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE TABLE public.patient_documents (
  id                    UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID                 NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  name                  TEXT                 NOT NULL,
  type                  public.document_type NOT NULL DEFAULT 'other',
  file_url              TEXT                 NOT NULL,
  storage_path          TEXT,
  file_type             TEXT                 NOT NULL,
  file_size_bytes       INTEGER,
  linked_appointment_id UUID,
  deleted_at            TIMESTAMPTZ,
  uploaded_at           TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE public.medical_histories (
  id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID                  NOT NULL UNIQUE REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  allergies      TEXT[]                NOT NULL DEFAULT '{}',
  conditions     TEXT[]                NOT NULL DEFAULT '{}',
  medications    JSONB[]               NOT NULL DEFAULT '{}',
  surgeries      JSONB[]               NOT NULL DEFAULT '{}',
  smoking_status public.smoking_status NOT NULL DEFAULT 'unknown',
  notes          TEXT,
  updated_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE TABLE public.favourites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  target_type TEXT        NOT NULL CHECK (target_type IN ('doctor','facility')),
  target_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, target_type, target_id)
);

CREATE TABLE public.patient_insurance (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL,
  member_id      TEXT        NOT NULL,
  policy_number  TEXT,
  expiry_date    DATE,
  coverage_type  TEXT,
  card_photo_url TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER patient_insurance_updated_at
  BEFORE UPDATE ON public.patient_insurance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient_profiles_select_own" ON public.patient_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "patient_profiles_insert_own" ON public.patient_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "patient_profiles_update_own" ON public.patient_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "patient_profiles_select_staff" ON public.patient_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','technician','super_admin')));

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_members_own" ON public.family_members FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "clinical_read_family" ON public.family_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','super_admin')));

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient_documents_own" ON public.patient_documents FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "patient_documents_staff_read" ON public.patient_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','technician','super_admin')));

ALTER TABLE public.medical_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medical_histories_own" ON public.medical_histories FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "medical_histories_staff_read" ON public.medical_histories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','technician','super_admin')));

ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favourites_own" ON public.favourites FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

ALTER TABLE public.patient_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient_insurance_own" ON public.patient_insurance FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "patient_insurance_staff_read" ON public.patient_insurance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','technician','super_admin')));

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.patient_profiles TO authenticated;
GRANT ALL ON public.patient_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_documents TO authenticated;
GRANT ALL ON public.patient_documents TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.medical_histories TO authenticated;
GRANT ALL ON public.medical_histories TO service_role;
GRANT SELECT, INSERT, DELETE ON public.favourites TO authenticated;
GRANT ALL ON public.favourites TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_insurance TO authenticated;
GRANT ALL ON public.patient_insurance TO service_role;


-- ================================================================
-- STEP 4: Facility & Doctor tables
-- ================================================================

CREATE TABLE public.facilities (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT                 NOT NULL,
  type                public.facility_type NOT NULL DEFAULT 'clinic',
  logo_url            TEXT,
  cover_photo_url     TEXT,
  description         TEXT,
  address             JSONB                NOT NULL DEFAULT '{}',
  phone               TEXT,
  email               TEXT,
  website             TEXT,
  working_hours       JSONB[]              NOT NULL DEFAULT '{}',
  services            TEXT[]               NOT NULL DEFAULT '{}',
  accepted_insurances TEXT[]               NOT NULL DEFAULT '{}',
  rating              NUMERIC(3,2)         NOT NULL DEFAULT 0,
  review_count        INTEGER              NOT NULL DEFAULT 0,
  status              TEXT                 NOT NULL DEFAULT 'pending_approval',
  is_verified         BOOLEAN              NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE TRIGGER facilities_updated_at BEFORE UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.branches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  address       JSONB       NOT NULL DEFAULT '{}',
  phone         TEXT,
  working_hours JSONB[]     NOT NULL DEFAULT '{}',
  is_main       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.facility_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  caption     TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.facility_settings (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id                  UUID        NOT NULL UNIQUE REFERENCES public.facilities(id) ON DELETE CASCADE,
  cancellation_cutoff_hours    INTEGER     NOT NULL DEFAULT 2,
  buffer_minutes_between_appts INTEGER     NOT NULL DEFAULT 10,
  avg_consultation_minutes     INTEGER     NOT NULL DEFAULT 15,
  walkin_slots_per_hour        INTEGER     NOT NULL DEFAULT 1,
  max_daily_broadcasts         INTEGER     NOT NULL DEFAULT 2,
  partial_refund_percent       INTEGER     NOT NULL DEFAULT 50,
  require_prepayment           BOOLEAN     NOT NULL DEFAULT FALSE,
  allow_online_booking         BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_telemedicine           BOOLEAN     NOT NULL DEFAULT FALSE,
  currency                     TEXT        NOT NULL DEFAULT 'OMR',
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.doctors (
  id                UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  facility_id       UUID                 NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  branch_id         UUID                 REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name         TEXT                 NOT NULL,
  specialty         TEXT                 NOT NULL,
  sub_specialty     TEXT,
  qualifications    TEXT[]               NOT NULL DEFAULT '{}',
  years_experience  INTEGER              NOT NULL DEFAULT 0,
  bio               TEXT,
  profile_photo_url TEXT,
  languages         TEXT[]               NOT NULL DEFAULT '{"en"}',
  fees              JSONB                NOT NULL DEFAULT '{"in_person":0,"online":0}',
  status            public.doctor_status NOT NULL DEFAULT 'unavailable',
  status_updated_at TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  avg_rating        NUMERIC(3,2)         NOT NULL DEFAULT 0,
  review_count      INTEGER              NOT NULL DEFAULT 0,
  is_active         BOOLEAN              NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE TRIGGER doctors_updated_at BEFORE UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.technicians (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  facility_id       UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  branch_id         UUID        REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name         TEXT        NOT NULL,
  specialization    TEXT,
  profile_photo_url TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER technicians_updated_at BEFORE UPDATE ON public.technicians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.doctor_availability (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID     NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slots       JSONB[]  NOT NULL DEFAULT '{}',
  UNIQUE (doctor_id, day_of_week)
);

CREATE TABLE public.reviews (
  id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID                 NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  target_type    public.review_target NOT NULL,
  target_id      UUID                 NOT NULL,
  appointment_id UUID,
  rating         SMALLINT             NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text    TEXT,
  reply          JSONB,
  is_visible     BOOLEAN              NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE public.moderation_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID        NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  flagged_by  UUID        NOT NULL REFERENCES public.profiles(id),
  reason      TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  resolved_by UUID        REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facilities_public_read" ON public.facilities FOR SELECT USING (status = 'active');
CREATE POLICY "facilities_admin_read" ON public.facilities FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doctors d WHERE d.facility_id = facilities.id AND d.user_id = auth.uid()));
CREATE POLICY "facilities_admin_write" ON public.facilities FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'facility_admin'));
CREATE POLICY "facilities_super_admin" ON public.facilities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_public_read" ON public.branches FOR SELECT USING (true);
CREATE POLICY "branches_admin_write" ON public.branches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.facility_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facility_photos_public_read" ON public.facility_photos FOR SELECT USING (true);
CREATE POLICY "facility_photos_admin_write" ON public.facility_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.facility_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facility_settings_admin_only" ON public.facility_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctors_public_read" ON public.doctors FOR SELECT USING (is_active = TRUE);
CREATE POLICY "doctors_self_update" ON public.doctors FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "doctors_facility_admin" ON public.doctors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "technicians_select_own" ON public.technicians FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "technicians_update_own" ON public.technicians FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "technicians_facility_admin" ON public.technicians FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));
CREATE POLICY "technicians_same_facility_read" ON public.technicians FOR SELECT TO authenticated
  USING (facility_id IN (SELECT facility_id FROM public.technicians WHERE user_id = auth.uid()));

ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor_availability_public_read" ON public.doctor_availability FOR SELECT USING (true);
CREATE POLICY "doctor_availability_write" ON public.doctor_availability FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin'))
  );

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (is_visible = TRUE);
CREATE POLICY "reviews_patient_insert" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "reviews_facility_reply" ON public.reviews FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.moderation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_facility_admin" ON public.moderation_requests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

-- Grants
GRANT SELECT ON public.facilities TO anon;
GRANT SELECT, INSERT, UPDATE ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;
GRANT SELECT ON public.branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
GRANT SELECT ON public.facility_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facility_photos TO authenticated;
GRANT ALL ON public.facility_photos TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.facility_settings TO authenticated;
GRANT ALL ON public.facility_settings TO service_role;
GRANT SELECT ON public.doctors TO anon;
GRANT SELECT, INSERT, UPDATE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
GRANT SELECT, UPDATE ON public.technicians TO authenticated;
GRANT ALL ON public.technicians TO service_role;
GRANT SELECT ON public.doctor_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_availability TO authenticated;
GRANT ALL ON public.doctor_availability TO service_role;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.moderation_requests TO authenticated;
GRANT ALL ON public.moderation_requests TO service_role;


-- ================================================================
-- STEP 5: Appointments & Scheduling
-- ================================================================

CREATE TABLE public.appointments (
  id                   UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number     TEXT                       NOT NULL UNIQUE
                         DEFAULT 'HAMS-' || upper(substr(md5(random()::text), 1, 8)),
  patient_id           UUID                       NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  doctor_id            UUID                       REFERENCES public.doctors(id) ON DELETE SET NULL,
  facility_id          UUID                       REFERENCES public.facilities(id) ON DELETE SET NULL,
  branch_id            UUID                       REFERENCES public.branches(id) ON DELETE SET NULL,
  for_family_member_id UUID                       REFERENCES public.family_members(id) ON DELETE SET NULL,
  follow_up_of         UUID                       REFERENCES public.appointments(id) ON DELETE SET NULL,
  slot_date            DATE                       NOT NULL,
  slot_start           TIME                       NOT NULL,
  slot_end             TIME                       NOT NULL,
  status               public.appointment_status  NOT NULL DEFAULT 'pending',
  type                 public.appointment_type    NOT NULL DEFAULT 'in_person',
  payment_status       public.hams_payment_status NOT NULL DEFAULT 'unpaid',
  reason_for_visit     TEXT,
  notes                TEXT,
  patient_summary      TEXT,
  ai_generated         BOOLEAN                    NOT NULL DEFAULT FALSE,
  cancellation_reason  TEXT,
  cancelled_by         UUID                       REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_in_at        TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  call_started_at      TIMESTAMPTZ,
  call_ended_at        TIMESTAMPTZ,
  room_url             TEXT,
  room_token           TEXT,
  google_event_id      TEXT,
  created_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_appointment_slot
  ON public.appointments (doctor_id, slot_date, slot_start)
  WHERE status NOT IN ('cancelled');

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deferred FKs now that appointments exists
ALTER TABLE public.patient_documents
  ADD CONSTRAINT patient_documents_appointment_fk
  FOREIGN KEY (linked_appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_appointment_fk
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE TABLE public.appointment_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  content        TEXT        NOT NULL,
  tags           TEXT[]      NOT NULL DEFAULT '{}',
  created_by     UUID        NOT NULL REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.queue_items (
  id             UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID                NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  branch_id      UUID                REFERENCES public.branches(id) ON DELETE SET NULL,
  appointment_id UUID                REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_id      UUID                REFERENCES public.doctors(id) ON DELETE SET NULL,
  patient_name   TEXT                NOT NULL,
  patient_phone  TEXT,
  is_walkin      BOOLEAN             NOT NULL DEFAULT FALSE,
  is_online      BOOLEAN             NOT NULL DEFAULT FALSE,
  position       INTEGER             NOT NULL DEFAULT 0,
  status         public.queue_status NOT NULL DEFAULT 'waiting',
  checked_in_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  called_at      TIMESTAMPTZ,
  done_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE public.waitlist_entries (
  id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID                   NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  doctor_id      UUID                   NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  facility_id    UUID                   NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  preferred_date DATE                   NOT NULL,
  position       INTEGER                NOT NULL DEFAULT 1,
  status         public.waitlist_status NOT NULL DEFAULT 'waiting',
  offered_slot   JSONB,
  offered_at     TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE TABLE public.pre_consultation_forms (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID        NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  chief_complaint     TEXT        NOT NULL,
  symptoms_duration   TEXT,
  relevant_history    TEXT,
  current_medications TEXT,
  additional_notes    TEXT,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_patient_read" ON public.appointments FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "appointments_patient_insert" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "appointments_patient_update" ON public.appointments FOR UPDATE TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "appointments_doctor_read" ON public.appointments FOR SELECT TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
CREATE POLICY "appointments_doctor_update" ON public.appointments FOR UPDATE TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
CREATE POLICY "appointments_facility_admin" ON public.appointments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));
CREATE POLICY "appointments_technician_read" ON public.appointments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'technician')
    AND facility_id IN (SELECT facility_id FROM public.technicians WHERE user_id = auth.uid())
  );

ALTER TABLE public.appointment_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appt_notes_patient_read" ON public.appointment_notes FOR SELECT TO authenticated
  USING (appointment_id IN (
    SELECT a.id FROM public.appointments a
    JOIN public.patient_profiles pp ON a.patient_id = pp.id
    WHERE pp.user_id = auth.uid()
  ));
CREATE POLICY "appt_notes_staff_all" ON public.appointment_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','super_admin')));

ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_items_staff_only" ON public.queue_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','doctor','technician','super_admin')));

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_patient_own" ON public.waitlist_entries FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "waitlist_staff_read" ON public.waitlist_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','doctor','super_admin')));

ALTER TABLE public.pre_consultation_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_consult_patient_own" ON public.pre_consultation_forms FOR ALL TO authenticated
  USING (appointment_id IN (
    SELECT a.id FROM public.appointments a
    JOIN public.patient_profiles pp ON a.patient_id = pp.id
    WHERE pp.user_id = auth.uid()
  ));
CREATE POLICY "pre_consult_doctor_read" ON public.pre_consultation_forms FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','super_admin')));

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
GRANT SELECT, INSERT ON public.appointment_notes TO authenticated;
GRANT ALL ON public.appointment_notes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.queue_items TO authenticated;
GRANT ALL ON public.queue_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_entries TO authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;
GRANT SELECT, INSERT ON public.pre_consultation_forms TO authenticated;
GRANT ALL ON public.pre_consultation_forms TO service_role;


-- ================================================================
-- STEP 6: Payments & Billing
-- ================================================================

CREATE TABLE public.payments (
  id                         UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id             UUID                       NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE RESTRICT,
  patient_id                 UUID                       NOT NULL REFERENCES public.patient_profiles(id),
  facility_id                UUID                       NOT NULL REFERENCES public.facilities(id),
  amount                     NUMERIC(10,3)              NOT NULL,
  currency                   TEXT                       NOT NULL DEFAULT 'OMR',
  status                     public.hams_payment_status NOT NULL DEFAULT 'pending',
  payment_method             TEXT,
  gateway                    TEXT,
  gateway_session_id         TEXT,
  gateway_ref                TEXT,
  gateway_response           JSONB,
  invoice_url                TEXT,
  insurance_applied          BOOLEAN                    NOT NULL DEFAULT FALSE,
  insurance_provider         TEXT,
  insurance_discount_percent INTEGER                    NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.refunds (
  id                 UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         UUID                 NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount             NUMERIC(10,3)        NOT NULL,
  reason             TEXT                 NOT NULL,
  cancelled_by       UUID                 REFERENCES public.profiles(id),
  status             public.refund_status NOT NULL DEFAULT 'pending',
  gateway_refund_ref TEXT,
  gateway_response   JSONB,
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE public.payouts (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id      UUID          NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  amount           NUMERIC(10,3) NOT NULL,
  currency         TEXT          NOT NULL DEFAULT 'OMR',
  period_start     DATE          NOT NULL,
  period_end       DATE          NOT NULL,
  reference_number TEXT          NOT NULL UNIQUE,
  status           TEXT          NOT NULL DEFAULT 'pending',
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_patient_read" ON public.payments FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "payments_facility_admin" ON public.payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));
CREATE POLICY "payments_service_role" ON public.payments FOR ALL TO service_role USING (true);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_patient_read" ON public.refunds FOR SELECT TO authenticated
  USING (payment_id IN (
    SELECT p.id FROM public.payments p
    JOIN public.patient_profiles pp ON p.patient_id = pp.id
    WHERE pp.user_id = auth.uid()
  ));
CREATE POLICY "refunds_facility_admin" ON public.refunds FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_facility_admin" ON public.payouts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

-- Grants
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;


-- ================================================================
-- STEP 7: Notifications & Communication
-- NOTE: MakerKit already has 'notifications' table
--       We use 'in_app_notifications' and 'notification_logs'
--       with hams_notification_channel + hams_notification_status
-- ================================================================

CREATE TABLE public.notification_logs (
  id             UUID                             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID                             NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id UUID                             REFERENCES public.appointments(id) ON DELETE SET NULL,
  channel        public.hams_notification_channel NOT NULL,
  status         public.hams_notification_status  NOT NULL DEFAULT 'pending',
  title          TEXT,
  body           TEXT                             NOT NULL,
  error          TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ                      NOT NULL DEFAULT NOW()
);

CREATE TABLE public.in_app_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'info',
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  participants    UUID[]      NOT NULL DEFAULT '{}',
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.messages (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID             NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID             NOT NULL REFERENCES public.profiles(id),
  sender_role     public.user_role NOT NULL,
  content         TEXT             NOT NULL,
  attachment_url  TEXT,
  is_read         BOOLEAN          NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE public.announcements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  channels        TEXT[]      NOT NULL DEFAULT '{"push"}',
  target_audience TEXT        NOT NULL DEFAULT 'all',
  created_by      UUID        NOT NULL REFERENCES public.profiles(id),
  sent_at         TIMESTAMPTZ,
  recipient_count INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.muted_facilities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  facility_id UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, facility_id)
);

-- RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_logs_own" ON public.notification_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notification_logs_service" ON public.notification_logs FOR ALL TO service_role USING (true);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "in_app_notifications_own" ON public.in_app_notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "in_app_notifications_service" ON public.in_app_notifications FOR INSERT TO service_role WITH CHECK (true);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_participants" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = ANY(participants)) WITH CHECK (auth.uid() = ANY(participants));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_participants" ON public.messages FOR ALL TO authenticated
  USING (conversation_id IN (SELECT id FROM public.conversations WHERE auth.uid() = ANY(participants)))
  WITH CHECK (conversation_id IN (SELECT id FROM public.conversations WHERE auth.uid() = ANY(participants)));

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_admin_write" ON public.announcements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));
CREATE POLICY "announcements_patients_read" ON public.announcements FOR SELECT TO authenticated USING (true);

ALTER TABLE public.muted_facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "muted_facilities_own" ON public.muted_facilities FOR ALL TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

-- Grants
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.in_app_notifications TO authenticated;
GRANT ALL ON public.in_app_notifications TO service_role;
GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
GRANT SELECT, INSERT, DELETE ON public.muted_facilities TO authenticated;
GRANT ALL ON public.muted_facilities TO service_role;


-- ================================================================
-- STEP 8: Health Records + AI + System
-- ================================================================

CREATE TABLE public.prescriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id         UUID        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id              UUID        NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  patient_id             UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  medications            JSONB[]     NOT NULL DEFAULT '{}',
  instructions           TEXT,
  pdf_url                TEXT,
  share_token            TEXT,
  share_token_expires_at TIMESTAMPTZ,
  issued_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.lab_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  facility_id    UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  appointment_id UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  test_name      TEXT        NOT NULL,
  file_url       TEXT        NOT NULL,
  storage_path   TEXT,
  file_type      TEXT        NOT NULL,
  notes          TEXT,
  is_viewed      BOOLEAN     NOT NULL DEFAULT FALSE,
  viewed_at      TIMESTAMPTZ,
  uploaded_by    UUID        NOT NULL REFERENCES public.profiles(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_request_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature     TEXT        NOT NULL,
  prompt_hash TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.symptom_check_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  symptoms       TEXT        NOT NULL,
  urgency        TEXT,
  conditions     TEXT[],
  patient_age    INTEGER,
  patient_gender TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.analytics_cache (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  cache_key   TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id, cache_key)
);

CREATE TABLE public.generated_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        REFERENCES public.facilities(id) ON DELETE CASCADE,
  patient_id  UUID        REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  report_type TEXT        NOT NULL,
  period      TEXT,
  file_url    TEXT        NOT NULL,
  created_by  UUID        NOT NULL REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE TABLE public.audit_logs (
  id            UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID                REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role    public.user_role,
  actor_ip      INET,
  action        public.audit_action NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  before        JSONB,
  after         JSONB,
  metadata      JSONB               NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
CREATE RULE audit_no_update AS ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

CREATE TABLE public.data_export_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending',
  download_url TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.system_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_by UUID        REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescriptions_patient_read" ON public.prescriptions FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "prescriptions_doctor_write" ON public.prescriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('doctor','facility_admin','super_admin')));

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_results_patient_read" ON public.lab_results FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "lab_results_patient_viewed" ON public.lab_results FOR UPDATE TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "lab_results_facility_write" ON public.lab_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','technician','super_admin')));

ALTER TABLE public.ai_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_logs_own" ON public.ai_request_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ai_logs_service" ON public.ai_request_logs FOR INSERT TO service_role WITH CHECK (true);

ALTER TABLE public.symptom_check_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symptom_logs_super_admin" ON public.symptom_check_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_cache_facility_admin" ON public.analytics_cache FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated_reports_own" ON public.generated_reports FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));
CREATE POLICY "generated_reports_staff_write" ON public.generated_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('facility_admin','super_admin')));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_super_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
CREATE POLICY "audit_logs_service_insert" ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "data_export_own" ON public.data_export_requests FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_config_super_admin" ON public.system_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
CREATE POLICY "system_config_read_authenticated" ON public.system_config FOR SELECT TO authenticated USING (true);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
GRANT SELECT, UPDATE ON public.lab_results TO authenticated;
GRANT ALL ON public.lab_results TO service_role;
GRANT SELECT ON public.ai_request_logs TO authenticated;
GRANT ALL ON public.ai_request_logs TO service_role;
GRANT ALL ON public.symptom_check_logs TO service_role;
GRANT SELECT ON public.analytics_cache TO authenticated;
GRANT ALL ON public.analytics_cache TO service_role;
GRANT SELECT ON public.generated_reports TO authenticated;
GRANT ALL ON public.generated_reports TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT, INSERT ON public.data_export_requests TO authenticated;
GRANT ALL ON public.data_export_requests TO service_role;
GRANT SELECT ON public.system_config TO anon;
GRANT SELECT ON public.system_config TO authenticated;
GRANT ALL ON public.system_config TO service_role;


-- ================================================================
-- STEP 9: Indexes
-- ================================================================

CREATE INDEX ix_profiles_role ON public.profiles (role);
CREATE INDEX ix_profiles_status ON public.profiles (status);
CREATE INDEX ix_patient_profiles_user_id ON public.patient_profiles (user_id);
CREATE INDEX ix_family_members_patient_id ON public.family_members (patient_id);
CREATE INDEX ix_patient_documents_patient_id ON public.patient_documents (patient_id);
CREATE INDEX ix_patient_documents_type ON public.patient_documents (type);
CREATE INDEX ix_doctors_facility_id ON public.doctors (facility_id);
CREATE INDEX ix_doctors_specialty ON public.doctors (specialty);
CREATE INDEX ix_doctors_status ON public.doctors (status);
CREATE INDEX ix_doctors_user_id ON public.doctors (user_id);
CREATE INDEX ix_appointments_patient_id ON public.appointments (patient_id);
CREATE INDEX ix_appointments_doctor_id ON public.appointments (doctor_id);
CREATE INDEX ix_appointments_facility_id ON public.appointments (facility_id);
CREATE INDEX ix_appointments_slot_date ON public.appointments (slot_date);
CREATE INDEX ix_appointments_status ON public.appointments (status);
CREATE INDEX ix_queue_items_facility_id ON public.queue_items (facility_id);
CREATE INDEX ix_queue_items_status ON public.queue_items (status);
CREATE INDEX ix_waitlist_doctor_date ON public.waitlist_entries (doctor_id, preferred_date);
CREATE INDEX ix_waitlist_status ON public.waitlist_entries (status);
CREATE INDEX ix_payments_patient_id ON public.payments (patient_id);
CREATE INDEX ix_payments_facility_id ON public.payments (facility_id);
CREATE INDEX ix_payments_status ON public.payments (status);
CREATE INDEX ix_reviews_target ON public.reviews (target_type, target_id);
CREATE INDEX ix_reviews_patient_id ON public.reviews (patient_id);
CREATE INDEX ix_in_app_notifications_user_id ON public.in_app_notifications (user_id);
CREATE INDEX ix_in_app_notifications_is_read ON public.in_app_notifications (user_id, is_read);
CREATE INDEX ix_messages_conversation_id ON public.messages (conversation_id);
CREATE INDEX ix_audit_logs_actor ON public.audit_logs (actor_user_id);
CREATE INDEX ix_audit_logs_action ON public.audit_logs (action);
CREATE INDEX ix_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX ix_lab_results_patient_id ON public.lab_results (patient_id);
CREATE INDEX ix_lab_results_is_viewed ON public.lab_results (patient_id, is_viewed);
CREATE INDEX ix_ai_logs_user_feature ON public.ai_request_logs (user_id, feature, created_at DESC);
-- ================================================================
-- FIX: hams_handle_new_user trigger (profiles not being created)
-- ================================================================

-- 1. Replace function (REMOVE search_path issue)

CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Get role safely
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  -- Prevent role escalation
  IF v_role NOT IN ('patient','doctor','technician','facility_admin') THEN
    v_role := 'patient';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Always ensure patient profile exists (safe)
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- 2. Recreate trigger (safe)

DROP TRIGGER IF EXISTS on_auth_user_created_hams ON auth.users;

CREATE TRIGGER on_auth_user_created_hams
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hams_handle_new_user();-- =========================================================
-- FIX: Backfill missing profiles for existing users
-- =========================================================

INSERT INTO public.profiles (id, role, full_name)
SELECT 
  u.id,
  'patient',
  COALESCE(u.email, 'User')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- =========================================================
-- FIX: Ensure every user has patient_profile
-- =========================================================

INSERT INTO public.patient_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE pp.user_id IS NULL;-- =========================================================
-- FIX: Profiles RLS policies (SSR compatibility)
-- =========================================================

-- 1. Drop existing policies

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_facility_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_super_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;


-- =========================================================
-- 2. Recreate SELECT policies (FIXED)
-- =========================================================

-- ✅ Users can read their own profile
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO public
USING (id = auth.uid());


-- ✅ Facility staff can read relevant profiles
CREATE POLICY "profiles_select_facility_staff"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('facility_admin', 'doctor', 'technician')
  )
);


-- ✅ Super admin can read everything
CREATE POLICY "profiles_select_super_admin"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
  )
);


-- =========================================================
-- 3. UPDATE policy (safe)
-- =========================================================

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (id = auth.uid());


-- =========================================================
-- DONE
-- =========================================================-- =========================================================
-- FIX: patient_profiles RLS (SSR compatible)
-- =========================================================

-- 1. Drop existing policies

DROP POLICY IF EXISTS "patient_profiles_select_own" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_select_staff" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_update_own" ON public.patient_profiles;


-- =========================================================
-- 2. SELECT policies
-- =========================================================

-- ✅ Patient can read their own profile
CREATE POLICY "patient_profiles_select_own"
ON public.patient_profiles
FOR SELECT
TO public
USING (user_id = auth.uid());


-- ✅ Staff can read patient profiles
CREATE POLICY "patient_profiles_select_staff"
ON public.patient_profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('doctor', 'technician', 'facility_admin')
  )
);


-- =========================================================
-- 3. UPDATE policy
-- =========================================================

CREATE POLICY "patient_profiles_update_own"
ON public.patient_profiles
FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- =========================================================
-- DONE
-- =========================================================-- =========================================
-- FIX patient_profiles RLS (FINAL SAFE)
-- =========================================

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_profiles_select_own" ON public.patient_profiles;
DROP POLICY IF EXISTS "patient_profiles_update_own" ON public.patient_profiles;

-- ✅ Allow authenticated users to read their profile
CREATE POLICY "patient_profiles_select_own"
ON public.patient_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ✅ Allow insert for own profile
CREATE POLICY "patient_profiles_insert_own"
ON public.patient_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- ✅ Allow update
CREATE POLICY "patient_profiles_update_own"
ON public.patient_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =========================================
-- FIX family_members RLS (STRICT)
-- =========================================

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_own" ON public.family_members;

CREATE POLICY "family_members_own"
ON public.family_members
FOR ALL
TO authenticated
USING (
  patient_id IN (
    SELECT id FROM public.patient_profiles
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  patient_id IN (
    SELECT id FROM public.patient_profiles
    WHERE user_id = auth.uid()
  )
);-- =========================================
-- FIX GRANTS (CRITICAL)
-- =========================================

-- Allow schema usage
GRANT USAGE ON SCHEMA public TO authenticated;

-- patient_profiles
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.patient_profiles
TO authenticated;

-- family_members
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.family_members
TO authenticated;

-- profiles (used in joins / auth)
GRANT SELECT, UPDATE
ON TABLE public.profiles
TO authenticated;-- =========================================================
-- SAFETY: SLOT VALIDATION CONSTRAINT
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_valid_slot'
  ) THEN
    ALTER TABLE public.appointments
    ADD CONSTRAINT check_valid_slot
    CHECK (slot_end > slot_start);
  END IF;
END $$;


-- =========================================================
-- RPC: BOOK APPOINTMENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_facility_id UUID,
  p_slot_date DATE,
  p_slot_start TIME,
  p_slot_end TIME,
  p_type public.appointment_type,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    facility_id,
    slot_date,
    slot_start,
    slot_end,
    type,
    notes,
    status
  )
  VALUES (
    p_patient_id,
    p_doctor_id,
    p_facility_id,
    p_slot_date,
    p_slot_start,
    p_slot_end,
    p_type,
    p_notes,
    'pending'
  )
  RETURNING id INTO v_appointment_id;

  RETURN json_build_object(
    'success', true,
    'appointment_id', v_appointment_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Slot already booked'
    );
END;
$$;

-- ✅ Grants (FIXED)
GRANT EXECUTE ON FUNCTION public.book_appointment(
  UUID, UUID, UUID, DATE, TIME, TIME, public.appointment_type, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.book_appointment(
  UUID, UUID, UUID, DATE, TIME, TIME, public.appointment_type, TEXT
) TO service_role;


-- =========================================================
-- RPC: RESCHEDULE APPOINTMENT
-- =========================================================

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_id UUID,
  p_new_date DATE,
  p_new_start TIME,
  p_new_end TIME
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ✅ Check if appointment exists & not cancelled
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments 
    WHERE id = p_id AND status <> 'cancelled'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Appointment not found or already cancelled'
    );
  END IF;

  UPDATE public.appointments
  SET 
    slot_date = p_new_date,
    slot_start = p_new_start,
    slot_end = p_new_end,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object(
      'success', false,
      'error', 'New slot already booked'
    );
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(
  UUID, DATE, TIME, TIME
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(
  UUID, DATE, TIME, TIME
) TO service_role;


-- =========================================================
-- RPC: CANCEL APPOINTMENT WITH CUT-OFF
-- =========================================================

CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_hours INTEGER;
  v_slot_time TIMESTAMP;
BEGIN
  SELECT 
    a.slot_date + a.slot_start,
    fs.cancellation_cutoff_hours
  INTO v_slot_time, v_cutoff_hours
  FROM public.appointments a
  LEFT JOIN public.facility_settings fs 
    ON fs.facility_id = a.facility_id
  WHERE a.id = p_id;

  IF v_slot_time IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Appointment not found'
    );
  END IF;

  IF v_cutoff_hours IS NULL THEN
    v_cutoff_hours := 2;
  END IF;

  IF NOW() > (v_slot_time - (v_cutoff_hours || ' hours')::interval) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Too late to cancel'
    );
  END IF;

  UPDATE public.appointments
  SET 
    status = 'cancelled',
    cancelled_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.cancel_appointment(
  UUID, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_appointment(
  UUID, UUID
) TO service_role;


-- =========================================================
-- RPC: FOLLOW-UP REBOOK
-- =========================================================

CREATE OR REPLACE FUNCTION public.rebook_appointment(
  p_original_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    facility_id,
    type,
    follow_up_of,
    status
  )
  SELECT
    patient_id,
    doctor_id,
    facility_id,
    type,
    id,
    'pending'
  FROM public.appointments
  WHERE id = p_original_id
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Original appointment not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'appointment_id', v_new_id
  );
END;
$$;

-- ✅ Grants
GRANT EXECUTE ON FUNCTION public.rebook_appointment(
  UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rebook_appointment(
  UUID
) TO service_role;CREATE POLICY "doctors_self_insert"
ON public.doctors
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());-- ✅ Allow authenticated users to upload files
create policy "Allow authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'patient-docs'
);

-- ✅ Allow authenticated users to read files
create policy "Allow authenticated read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'patient-docs'
);

-- ✅ Allow users to delete their own files (optional but good)
create policy "Allow delete own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'patient-docs'
);CREATE OR REPLACE FUNCTION public.validate_slot_overlap(
  new_slots JSONB[],
  existing_slots JSONB[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ns JSONB;
  es JSONB;
BEGIN
  FOR ns IN SELECT * FROM unnest(new_slots)
  LOOP
    FOR es IN SELECT * FROM unnest(existing_slots)
    LOOP
      IF (
        (ns->>'start')::time < (es->>'end')::time AND
        (ns->>'end')::time > (es->>'start')::time
      ) THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN TRUE;
END;
$$;
-- =====================================================
-- F14: FACILITY PROFILE MANAGEMENT UPGRADE
-- =====================================================

-- -------------------------------
-- STEP 1: Enable PostGIS
-- -------------------------------
create extension if not exists postgis;

-- -------------------------------
-- STEP 2: Add GEO location column
-- -------------------------------
alter table public.facilities
add column if not exists location geography(Point, 4326);

-- -------------------------------
-- STEP 3: Facility Members (NEW)
-- -------------------------------
create table if not exists public.facility_members (
  id uuid primary key default gen_random_uuid(),

  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  role text not null check (role in ('admin','doctor','staff')),

  created_at timestamptz default now(),

  unique(facility_id, user_id)
);

-- -------------------------------
-- STEP 4: RLS for facility_members
-- -------------------------------
alter table public.facility_members enable row level security;

create policy "facility_members_read_own"
on public.facility_members
for select
using (user_id = auth.uid());

create policy "facility_members_admin_insert"
on public.facility_members
for insert
with check (
  exists (
    select 1 from public.facility_members fm
    where fm.facility_id = facility_members.facility_id
    and fm.user_id = auth.uid()
    and fm.role = 'admin'
  )
);

-- -------------------------------
-- STEP 5: Backfill existing admins
-- -------------------------------
insert into public.facility_members (facility_id, user_id, role)
select
  f.id,
  p.id,
  'admin'
from public.facilities f
join public.profiles p
  on p.role = 'facility_admin'
on conflict do nothing;

-- -------------------------------
-- STEP 6: Nearby Search Function
-- -------------------------------
create or replace function public.nearby_facilities(
  lat float,
  lng float,
  radius int
)
returns setof public.facilities
language sql
as $$
  select *
  from public.facilities
  where location is not null
  and ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    radius
  );
$$;
DROP POLICY IF EXISTS facilities_admin_write ON facilities;

CREATE POLICY "facilities_admin_write"
ON facilities
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'facility_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'facility_admin'
  )
);
----+++===============================
-- These are not nedded now as we have tabel for doctors already 
---- this is important -- Realtime setup
-- ALTER PUBLICATION supabase_realtime ADD TABLE doctors;
-----+++===============================

-- -- ================================
-- -- 1️⃣ MAKE DOCTOR FIELDS OPTIONAL
-- -- ================================

-- alter table public.doctors
--   alter column specialty drop not null,
--   alter column sub_specialty drop not null,
--   alter column years_experience drop not null,
--   alter column bio drop not null,
--   alter column fees drop not null,
--   alter column qualifications drop not null,
--   alter column languages drop not null,
--   alter column facility_id drop not null;


-- -- ================================
-- -- 2️⃣ CREATE FUNCTION (AUTO CREATE DOCTOR)
-- -- ================================

-- create or replace function public.handle_new_user()
-- returns trigger as $$
-- begin
--   -- Only create doctor if role = doctor
--   if new.raw_user_meta_data->>'role' = 'doctor' then
--     insert into public.doctors (
--       user_id,
--       full_name,
--       created_at,
--       updated_at
--     )
--     values (
--       new.id,
--       coalesce(new.raw_user_meta_data->>'full_name', 'Doctor'),
--       now(),
--       now()
--     );
--   end if;

--   return new;
-- end;
-- $$ language plpgsql security definer;


-- -- ================================
-- -- 3️⃣ CREATE TRIGGER
-- -- ================================

-- drop trigger if exists on_auth_user_created on auth.users;

-- create trigger on_auth_user_created
-- after insert on auth.users
-- for each row
-- execute procedure public.handle_new_user();
---- this is important -- Realtime setup
-- ALTER PUBLICATION supabase_realtime ADD TABLE doctors;

-- =========================================================
-- F17: DOCTOR LIVE AVAILABILITY STATUS (FINAL SCHEMA)
-- =========================================================

-- =========================================================
-- 1. ADD STATUS COLUMNS
-- =========================================================
ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS status TEXT CHECK (
  status IN ('available','with_patient','on_break','unavailable')
) DEFAULT 'unavailable',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();


-- =========================================================
-- 2. BACKFILL EXISTING DATA
-- =========================================================
UPDATE public.doctors
SET status = 'unavailable'
WHERE status IS NULL;


-- =========================================================
-- 3. INDEX FOR PERFORMANCE
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_doctors_status
ON public.doctors(status);


-- =========================================================
-- 4. ENABLE REALTIME
-- =========================================================
-- DO $$
-- BEGIN
--   BEGIN
--     ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
--   EXCEPTION
--     WHEN duplicate_object THEN
--       -- already added, ignore
--       NULL;
--   END;
-- END $$;


-- =========================================================
-- 5. ENABLE CRON (pg_cron)
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- =========================================================
-- 6. REMOVE EXISTING JOB (SAFE)
-- =========================================================
DO $$
DECLARE
  job_id INT;
BEGIN
  SELECT jobid INTO job_id
  FROM cron.job
  WHERE jobname = 'auto-unavailable-doctors'
  LIMIT 1;

  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;


-- =========================================================
-- 7. CREATE CRON JOB (STEP 7)
-- =========================================================
SELECT cron.schedule(
  'auto-unavailable-doctors',
  '*/5 * * * *',
  $$
  UPDATE public.doctors
  SET status = 'unavailable'
  WHERE status_updated_at < NOW() - INTERVAL '15 minutes';
  $$
);


-- =========================================================
-- 8. OPTIONAL: TEST QUERY (MANUAL)
-- =========================================================
-- UPDATE public.doctors
-- SET status = 'available',
--     status_updated_at = NOW() - INTERVAL '20 minutes';
---drop table

DROP TABLE IF EXISTS public.otp_records;

---create table
CREATE TABLE public.otp_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🔗 MUST match your code
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- OTP (hash recommended later)
  hash          TEXT NOT NULL,

  -- expiry
  expires_at    TIMESTAMPTZ NOT NULL,

  -- security
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
  locked_until  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ✅ IMPORTANT: only one active OTP per user
  UNIQUE (user_id)
);

---create index
CREATE INDEX ix_otp_user_id ON public.otp_records(user_id);
CREATE INDEX ix_otp_expires ON public.otp_records(expires_at);
CREATE INDEX ix_otp_locked_until ON public.otp_records(locked_until);


---RLS
ALTER TABLE public.otp_records ENABLE ROW LEVEL SECURITY;

-- Only backend (service role) can access OTP
CREATE POLICY "otp_service_only"
ON public.otp_records
FOR ALL
TO service_role
USING (true);

CREATE POLICY "otp_authenticated_insert"
ON public.otp_records
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "otp_authenticated_update"
ON public.otp_records
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "otp_authenticated_select"
ON public.otp_records
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "otp_authenticated_delete"
ON public.otp_records
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

---Grants 
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_records TO authenticated;
GRANT ALL ON public.otp_records TO service_role;

-- =========================================================
-- F-18 FIXES MIGRATION (FINAL CORRECTED)
-- =========================================================


-- =========================================================
-- 0. EXTENSION (MUST BE FIRST)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_net;


-- =========================================================
-- 1. PREVENT DUPLICATE FLAGGING
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_review_flag'
  ) THEN
    ALTER TABLE public.moderation_requests
    ADD CONSTRAINT unique_review_flag UNIQUE (review_id);
  END IF;
END $$;


-- =========================================================
-- 2. INDEX OPTIMIZATION
-- =========================================================

CREATE INDEX IF NOT EXISTS ix_moderation_status 
ON public.moderation_requests (status);

CREATE INDEX IF NOT EXISTS ix_moderation_review 
ON public.moderation_requests (review_id);

CREATE INDEX IF NOT EXISTS ix_reviews_visible 
ON public.reviews (is_visible);

CREATE INDEX IF NOT EXISTS ix_reviews_created 
ON public.reviews (created_at DESC);


-- =========================================================
-- 3. FIX RLS: SECURE FACILITY OWNERSHIP
-- =========================================================

-- Remove old unsafe policy
DROP POLICY IF EXISTS "reviews_facility_reply" ON public.reviews;
DROP POLICY IF EXISTS "reviews_facility_own" ON public.reviews;

-- Secure policy
CREATE POLICY "reviews_facility_own"
ON public.reviews
FOR UPDATE
TO authenticated
USING (
  -- Super admin can always update
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )

  OR

  -- Facility admin / doctor can update ONLY their facility reviews
  EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = public.reviews.target_id
      AND public.reviews.target_type = 'facility'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )

  OR

  EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = public.reviews.target_id
      AND public.reviews.target_type = 'facility'
  )
);


-- =========================================================
-- 4. TRIGGER → CALL EDGE FUNCTION (EMAIL)
-- =========================================================

CREATE OR REPLACE FUNCTION public.notify_moderation_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://zojrwuvxrkmgnlwyuypg.functions.supabase.co/send-moderation-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'review_id', NEW.review_id,
      'reason', NEW.reason,
      'flagged_by', NEW.flagged_by
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;


-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_notify_moderation ON public.moderation_requests;

-- Create trigger
CREATE TRIGGER trigger_notify_moderation
AFTER INSERT ON public.moderation_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_moderation_request();


-- =========================================================
-- 5. AUDIT LOG HELPER (AUTO LOGGING)
-- =========================================================

CREATE OR REPLACE FUNCTION public.log_review_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    NEW.flagged_by,
    'review_flagged',
    'review',
    NEW.review_id,
    jsonb_build_object('reason', NEW.reason)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_review_flag ON public.moderation_requests;

CREATE TRIGGER trigger_audit_review_flag
AFTER INSERT ON public.moderation_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_review_flag();


-- =========================================================
-- 
-- =========================================================
-- RPC: GET AVAILABLE SLOTS
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_doctor_id UUID,
  p_date DATE,
  p_include_walkin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end TIME,
  slot_type TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day INT;
  v_buffer INT := 0;
  v_consult INT := 15;
BEGIN
  v_day := EXTRACT(DOW FROM p_date);

  SELECT 
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_buffer IS NULL THEN
    v_buffer := 0;
    v_consult := 15;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT 
      (slot->>'start')::TIME AS start_time,
      COALESCE(slot->>'type', 'normal') AS type
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = v_day
  ),
  adjusted_slots AS (
    SELECT
      start_time,
      (
        start_time 
        + (v_consult || ' minutes')::interval 
        + (v_buffer || ' minutes')::interval
      )::TIME AS end_time,
      type
    FROM raw_slots
  ),
  booked_slots AS (
    SELECT slot_start
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND slot_date = p_date
      AND status IN ('pending','confirmed','checked_in')
      AND is_emergency = FALSE
  )
  SELECT 
    a.start_time,
    a.end_time,
    a.type
  FROM adjusted_slots a
  WHERE 
    NOT EXISTS (
      SELECT 1 
      FROM booked_slots b
      WHERE b.slot_start = a.start_time
    )
    AND (
      p_include_walkin = TRUE 
      OR a.type != 'walkin_reserved'
    )
  ORDER BY a.start_time;
END;
$$;


-- RPC: BOOK APPOINTMENT
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_patient_id UUID,
  p_doctor_id UUID,
  p_facility_id UUID,
  p_slot_date DATE,
  p_slot_start TIME,
  p_type TEXT DEFAULT 'in_person',
  p_is_emergency BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_end TIME;
  v_buffer INT := 0;
  v_consult INT := 15;
  v_appointment_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patient_profiles
    WHERE id = p_patient_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_PATIENT');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = EXTRACT(DOW FROM p_slot_date)
    AND (slot->>'start')::TIME = p_slot_start
  ) THEN
    RETURN json_build_object('success', FALSE, 'error', 'INVALID_SLOT');
  END IF;

  SELECT 
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  IF v_buffer IS NULL THEN
    v_buffer := 0;
    v_consult := 15;
  END IF;

  v_slot_end := (
    p_slot_start 
    + (v_consult || ' minutes')::interval
    + (v_buffer || ' minutes')::interval
  )::TIME;

  BEGIN
    INSERT INTO public.appointments (
      patient_id, doctor_id, facility_id,
      slot_date, slot_start, slot_end,
      type, status, is_emergency
    )
    VALUES (
      p_patient_id, p_doctor_id, p_facility_id,
      p_slot_date, p_slot_start, v_slot_end,
      p_type::public.appointment_type,
      'pending', p_is_emergency
    )
    RETURNING id INTO v_appointment_id;

    RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('success', FALSE, 'error', 'SLOT_ALREADY_BOOKED');
    WHEN OTHERS THEN
      RETURN json_build_object('success', FALSE, 'error', SQLERRM);
  END;
END;
$$;
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS uq_appointment_slot;

CREATE UNIQUE INDEX uq_appointment_slot
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in')
AND is_emergency = FALSE;

CREATE INDEX IF NOT EXISTS ix_appointments_slot_lookup
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in');
-- =========================================================
-- F25: RPC PERMISSIONS (EXECUTE ACCESS)
-- =========================================================

-- Allow authenticated users to call get_available_slots
GRANT EXECUTE ON FUNCTION public.get_available_slots(
  UUID,
  DATE,
  BOOLEAN
) TO authenticated;


-- Allow authenticated users to call book_appointment_atomic
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(
  UUID,
  UUID,
  UUID,
  DATE,
  TIME,
  TEXT,
  BOOLEAN
) TO authenticated;


-- OPTIONAL: Allow anon (only if needed for public access)
-- GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN) TO anon;


-- =========================================================
-- DONE ✅
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_doctor_id UUID,
  p_date DATE,
  p_include_walkin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end TIME,
  slot_type TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_day INT;
  v_buffer INT := 0;
  v_consult INT := 15;
BEGIN
  v_day := EXTRACT(DOW FROM p_date);

  SELECT 
    COALESCE(fs.buffer_minutes_between_appts, 0),
    COALESCE(fs.avg_consultation_minutes, 15)
  INTO v_buffer, v_consult
  FROM public.doctors d
  LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
  WHERE d.id = p_doctor_id;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT 
      (slot->>'start')::TIME AS start_time,
      COALESCE(slot->>'type', 'normal') AS type
    FROM public.doctor_availability da,
    LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.doctor_id = p_doctor_id
    AND da.day_of_week = v_day
  ),

  adjusted_slots AS (
    SELECT
      start_time,
      (
        start_time 
        + (v_consult || ' minutes')::interval 
        + (v_buffer || ' minutes')::interval
      )::TIME AS end_time,
      type
    FROM raw_slots
  ),

  booked_slots AS (
    SELECT a.slot_start AS booked_start
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.slot_date = p_date
      AND a.status IN ('pending','confirmed','checked_in')
      AND a.is_emergency = FALSE
  )

  SELECT 
    a.start_time,
    a.end_time,
    a.type
  FROM adjusted_slots a
  WHERE 
    NOT EXISTS (
      SELECT 1 
      FROM booked_slots b
      WHERE b.booked_start = a.start_time
    )
    AND (
      p_include_walkin = TRUE 
      OR a.type != 'walkin_reserved'
    )
  ORDER BY a.start_time;

END;
$$;
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

-- =========================================================
-- F-26: WAITLIST AUTO-OFFER TRIGGER (PRODUCTION SAFE)
-- =========================================================


-- =========================================================
-- 1. FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_waitlist_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry RECORD;
BEGIN

  -- Only trigger when status changes to cancelled
  IF NEW.status = 'cancelled' 
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN

    -- Get next waiting patient (FIFO queue)
    SELECT *
    INTO v_entry
    FROM public.waitlist_entries
    WHERE doctor_id = NEW.doctor_id
      AND preferred_date = NEW.slot_date
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT 1;

    -- If someone is in waitlist
    IF v_entry.id IS NOT NULL THEN

      UPDATE public.waitlist_entries
      SET 
        status = 'offered',
        offered_at = NOW(),
        expires_at = NOW() + INTERVAL '15 minutes',
        offered_slot = jsonb_build_object(
          'slot_date', NEW.slot_date,
          'slot_start', NEW.slot_start,
          'slot_end', NEW.slot_end,
          'doctor_id', NEW.doctor_id,
          'facility_id', NEW.facility_id
        )
      WHERE id = v_entry.id;

    END IF;

  END IF;

  RETURN NEW;
END;
$$;


-- =========================================================
-- 2. TRIGGER (SAFE RECREATE)
-- =========================================================

DROP TRIGGER IF EXISTS trg_waitlist_on_cancel 
ON public.appointments;

CREATE TRIGGER trg_waitlist_on_cancel
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.handle_waitlist_on_cancel();


-- =========================================================
-- 3. PERMISSIONS (IMPORTANT)
-- =========================================================

GRANT EXECUTE ON FUNCTION public.handle_waitlist_on_cancel()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.handle_waitlist_on_cancel()
TO service_role;


-- =========================================================
-- 4. DONE ✅
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_waitlist_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry RECORD;
BEGIN

  IF NEW.status = 'cancelled' 
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN

    SELECT *
    INTO v_entry
    FROM public.waitlist_entries
    WHERE doctor_id = NEW.doctor_id
      AND preferred_date = NEW.slot_date
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.waitlist_entries
      SET 
        status = 'offered',
        offered_at = NOW(),
        expires_at = NOW() + INTERVAL '15 minutes',
        offered_slot = jsonb_build_object(
          'slot_date', NEW.slot_date,
          'slot_start', NEW.slot_start,
          'slot_end', NEW.slot_end,
          'doctor_id', NEW.doctor_id,
          'facility_id', NEW.facility_id
        )
      WHERE id = v_entry.id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
-- =========================================================
-- F-26: WAITLIST AUTOMATION (TRIGGERS + QUEUE FLOW)
-- =========================================================


-- =========================================================
-- 1. FUNCTION: ON CANCEL → OFFER FIRST USER
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_waitlist_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry RECORD;
BEGIN

  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN

    SELECT *
    INTO v_entry
    FROM public.waitlist_entries
    WHERE doctor_id = NEW.doctor_id
      AND preferred_date = NEW.slot_date
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.waitlist_entries
      SET
        status = 'offered',
        offered_at = NOW(),
        expires_at = NOW() + INTERVAL '15 minutes',
        offered_slot = jsonb_build_object(
          'slot_date', NEW.slot_date,
          'slot_start', NEW.slot_start,
          'slot_end', NEW.slot_end,
          'doctor_id', NEW.doctor_id,
          'facility_id', NEW.facility_id
        )
      WHERE id = v_entry.id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


-- =========================================================
-- 2. TRIGGER: APPOINTMENT CANCEL
-- =========================================================

DROP TRIGGER IF EXISTS trg_waitlist_on_cancel
ON public.appointments;

CREATE TRIGGER trg_waitlist_on_cancel
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.handle_waitlist_on_cancel();


-- =========================================================
-- 3. FUNCTION: ON EXPIRY → NEXT USER
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_waitlist_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next RECORD;
BEGIN

  IF NEW.status = 'expired'
     AND OLD.status IS DISTINCT FROM 'expired' THEN

    SELECT *
    INTO v_next
    FROM public.waitlist_entries
    WHERE doctor_id = NEW.doctor_id
      AND preferred_date = NEW.preferred_date
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.waitlist_entries
      SET
        status = 'offered',
        offered_at = NOW(),
        expires_at = NOW() + INTERVAL '15 minutes',
        offered_slot = NEW.offered_slot
      WHERE id = v_next.id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


-- =========================================================
-- 4. TRIGGER: WAITLIST EXPIRY
-- =========================================================

DROP TRIGGER IF EXISTS trg_waitlist_expiry
ON public.waitlist_entries;

CREATE TRIGGER trg_waitlist_expiry
AFTER UPDATE ON public.waitlist_entries
FOR EACH ROW
EXECUTE FUNCTION public.handle_waitlist_expiry();


-- =========================================================
-- 5. FUNCTION: AUTO EXPIRE (CRITICAL)
-- =========================================================

CREATE OR REPLACE FUNCTION public.expire_waitlist_entries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.waitlist_entries
  SET status = 'expired'
  WHERE status = 'offered'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;


-- =========================================================
-- 6. OPTIONAL: CRON JOB (if pg_cron enabled)
-- =========================================================

-- Uncomment ONLY if pg_cron is enabled
-- SELECT cron.schedule(
--   'expire-waitlist-every-minute',
--   '* * * * *',
--   $$SELECT public.expire_waitlist_entries();$$
-- );


-- =========================================================
-- 7. PERMISSIONS
-- =========================================================

GRANT EXECUTE ON FUNCTION public.handle_waitlist_on_cancel()
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_waitlist_expiry()
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.expire_waitlist_entries()
TO authenticated, service_role;


-- =========================================================
-- DONE ✅ F-26 AUTOMATION COMPLETE
-- =========================================================

-- =========================================================
-- F-26: NOTIFY WAITLIST (TRIGGER → EDGE FUNCTION)
-- =========================================================


-- =========================================================
-- 1. ENABLE EXTENSION
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_net;


-- =========================================================
-- 2. FUNCTION: CALL EDGE FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.notify_waitlist_edge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

  -- Only when status becomes 'offered'
  IF NEW.status = 'offered'
     AND OLD.status IS DISTINCT FROM 'offered' THEN

    PERFORM net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-waitlist',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object(
        'waitlist_id', NEW.id
      )
    );

  END IF;

  RETURN NEW;
END;
$$;


-- =========================================================
-- 3. TRIGGER
-- =========================================================

DROP TRIGGER IF EXISTS trg_notify_waitlist
ON public.waitlist_entries;

CREATE TRIGGER trg_notify_waitlist
AFTER UPDATE ON public.waitlist_entries
FOR EACH ROW
EXECUTE FUNCTION public.notify_waitlist_edge();


-- =========================================================
-- 4. PERMISSIONS
-- =========================================================

GRANT EXECUTE ON FUNCTION public.notify_waitlist_edge()
TO authenticated, service_role;


-- =========================================================
-- DONE ✅
-- =========================================================
-- Fix: otp_records.user_id FK was referencing public.profiles(id)
-- which breaks when a profile hasn't been created yet (e.g. trigger failure).
-- OTP only needs the auth user to exist — change FK to auth.users(id).

ALTER TABLE public.otp_records
  DROP CONSTRAINT otp_records_user_id_fkey;

ALTER TABLE public.otp_records
  ADD CONSTRAINT otp_records_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
-- ============================================================
-- F-28 MULTI-LOCATION BOOKING (COMPLETE + SAFE MIGRATION)
-- ============================================================

-- ============================================================
-- 1. ENABLE POSTGIS (SAFE)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'postgis'
  ) THEN
    CREATE EXTENSION postgis;
  END IF;
END $$;


-- ============================================================
-- 2. ADD GEO LOCATION COLUMN TO BRANCHES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'branches'
    AND column_name = 'location'
  ) THEN
    ALTER TABLE public.branches
    ADD COLUMN location geography(Point, 4326);
  END IF;
END $$;


-- ============================================================
-- 3. ADD SPATIAL INDEX (PERFORMANCE 🔥)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'branches'
    AND indexname = 'idx_branches_location'
  ) THEN
    CREATE INDEX idx_branches_location
    ON public.branches
    USING gist(location);
  END IF;
END $$;


-- ============================================================
-- 4. CREATE NEARBY SEARCH RPC (CORE FEATURE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.nearby_branches(
  user_lat float,
  user_lng float,
  radius_meters int DEFAULT 5000
)
RETURNS SETOF public.branches
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.branches
  WHERE location IS NOT NULL
  AND ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
    radius_meters
  );
$$;


-- ============================================================
-- 5. ADVANCED: DISTANCE + SORT (PRODUCTION READY)
-- ============================================================
CREATE OR REPLACE FUNCTION public.nearby_branches_with_distance(
  user_lat float,
  user_lng float,
  radius_meters int DEFAULT 5000
)
RETURNS TABLE (
  id uuid,
  facility_id uuid,
  name text,
  address jsonb,
  phone text,
  working_hours jsonb[],
  is_main boolean,
  created_at timestamptz,
  location geography,
  distance_meters float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    b.*,
    ST_Distance(
      b.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) AS distance_meters
  FROM public.branches b
  WHERE b.location IS NOT NULL
  AND ST_DWithin(
    b.location,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC;
$$;


-- ============================================================
-- 6. OPTIONAL: GET BRANCHES BY FACILITY (OPTIMIZED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_facility_branches(
  facility_uuid uuid
)
RETURNS SETOF public.branches
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.branches
  WHERE facility_id = facility_uuid
  ORDER BY is_main DESC, created_at DESC;
$$;


-- ============================================================
-- 7. SAFE GRANTS
-- ============================================================
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.nearby_branches(float, float, int) TO anon;
  GRANT EXECUTE ON FUNCTION public.nearby_branches(float, float, int) TO authenticated;

  GRANT EXECUTE ON FUNCTION public.nearby_branches_with_distance(float, float, int) TO anon;
  GRANT EXECUTE ON FUNCTION public.nearby_branches_with_distance(float, float, int) TO authenticated;

  GRANT EXECUTE ON FUNCTION public.get_facility_branches(uuid) TO anon;
  GRANT EXECUTE ON FUNCTION public.get_facility_branches(uuid) TO authenticated;

EXCEPTION
  WHEN undefined_function THEN
    NULL;
END $$;


-- ============================================================
-- 8. OPTIONAL: HELPER FUNCTION TO INSERT BRANCH WITH GEO
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_branch_with_location(
  facility_uuid uuid,
  branch_name text,
  lat float,
  lng float,
  address jsonb DEFAULT '{}'::jsonb,
  phone text DEFAULT NULL
)
RETURNS public.branches
LANGUAGE plpgsql
AS $$
DECLARE
  new_branch public.branches;
BEGIN
  INSERT INTO public.branches (
    facility_id,
    name,
    address,
    phone,
    location
  )
  VALUES (
    facility_uuid,
    branch_name,
    address,
    phone,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  )
  RETURNING * INTO new_branch;

  RETURN new_branch;
END;
$$;


-- ============================================================
-- 9. COMMENTS (DOCUMENTATION)
-- ============================================================
COMMENT ON COLUMN public.branches.location IS
'Geographic coordinates for branch (PostGIS Point: lng, lat) used for nearby search';

COMMENT ON FUNCTION public.nearby_branches IS
'Returns branches within radius using PostGIS ST_DWithin';

COMMENT ON FUNCTION public.nearby_branches_with_distance IS
'Returns branches sorted by distance from user';

-- ============================================================
-- DONE ✅ F-28 FULLY IMPLEMENTED
-- ============================================================
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
-- ================================================================
-- HAMS — ONBOARDING RLS + RPCs (PRODUCTION FINAL)
-- ================================================================


-- ================================================================
-- 1. ENABLE RLS
-- ================================================================

ALTER TABLE public.facility_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_admin_limit ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- 2. FACILITY ADMINS RLS
-- ================================================================

DROP POLICY IF EXISTS fa_super_admin ON public.facility_admins;
DROP POLICY IF EXISTS fa_self_read ON public.facility_admins;
DROP POLICY IF EXISTS fa_doctor_read ON public.facility_admins;

CREATE POLICY fa_super_admin
ON public.facility_admins
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY fa_self_read
ON public.facility_admins
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY fa_doctor_read
ON public.facility_admins
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = facility_admins.facility_id
      AND d.is_active = TRUE
  )
);

GRANT SELECT ON public.facility_admins TO authenticated;
GRANT ALL ON public.facility_admins TO service_role;


-- ================================================================
-- 3. FACILITY ADMIN LIMIT RLS
-- ================================================================

DROP POLICY IF EXISTS fal_super_admin ON public.facility_admin_limit;
DROP POLICY IF EXISTS fal_admin_read ON public.facility_admin_limit;

CREATE POLICY fal_super_admin
ON public.facility_admin_limit
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY fal_admin_read
ON public.facility_admin_limit
FOR SELECT TO authenticated
USING (
  facility_id IN (
    SELECT facility_id FROM public.facility_admins
    WHERE user_id = auth.uid() AND revoked_at IS NULL
  )
);

GRANT SELECT ON public.facility_admin_limit TO authenticated;
GRANT ALL ON public.facility_admin_limit TO service_role;


-- ================================================================
-- 4. INVITATIONS RLS
-- ================================================================

DROP POLICY IF EXISTS inv_super_admin ON public.invitations;
DROP POLICY IF EXISTS inv_facility_admin ON public.invitations;

CREATE POLICY inv_super_admin
ON public.invitations
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY inv_facility_admin
ON public.invitations
FOR ALL TO authenticated
USING (
  facility_id IN (
    SELECT facility_id FROM public.facility_admins
    WHERE user_id = auth.uid() AND revoked_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;


-- ================================================================
-- 5. DOCTOR ONBOARDING RLS
-- ================================================================

DROP POLICY IF EXISTS do_super_admin ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_facility_admin ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_doctor_self ON public.doctor_onboarding;
DROP POLICY IF EXISTS do_doctor_self_update ON public.doctor_onboarding;

CREATE POLICY do_super_admin
ON public.doctor_onboarding
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY do_facility_admin
ON public.doctor_onboarding
FOR ALL TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors
    WHERE facility_id IN (
      SELECT facility_id FROM public.facility_admins
      WHERE user_id = auth.uid() AND revoked_at IS NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

CREATE POLICY do_doctor_self
ON public.doctor_onboarding
FOR SELECT TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
);

CREATE POLICY do_doctor_self_update
ON public.doctor_onboarding
FOR UPDATE TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
);

GRANT SELECT, UPDATE ON public.doctor_onboarding TO authenticated;
GRANT ALL ON public.doctor_onboarding TO service_role;


-- ================================================================
-- 6. DOCTOR DOCUMENTS RLS
-- ================================================================

DROP POLICY IF EXISTS dd_super_admin ON public.doctor_documents;
DROP POLICY IF EXISTS dd_facility_admin ON public.doctor_documents;
DROP POLICY IF EXISTS dd_doctor_read ON public.doctor_documents;

CREATE POLICY dd_super_admin
ON public.doctor_documents
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY dd_facility_admin
ON public.doctor_documents
FOR ALL TO authenticated
USING (
  doctor_id IN (
    SELECT d.id FROM public.doctors d
    WHERE d.facility_id IN (
      SELECT facility_id FROM public.facility_admins
      WHERE user_id = auth.uid() AND revoked_at IS NULL
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'facility_admin'
  )
);

CREATE POLICY dd_doctor_read
ON public.doctor_documents
FOR SELECT TO authenticated
USING (
  doctor_id IN (
    SELECT id FROM public.doctors WHERE user_id = auth.uid()
  )
  AND deleted_at IS NULL
);

GRANT SELECT ON public.doctor_documents TO authenticated;
GRANT ALL ON public.doctor_documents TO service_role;


-- ================================================================
-- 7. RPC: INVITE FACILITY ADMIN (PRODUCTION SAFE)
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_facility_admin(
  p_facility_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_current INTEGER;
  v_max INTEGER;
  v_invite_id UUID;
BEGIN
  -- Role check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'super_admin' THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_facility_id::TEXT));

  -- Admin count
  SELECT COUNT(*) INTO v_current
  FROM public.facility_admins
  WHERE facility_id = p_facility_id AND revoked_at IS NULL;

  SELECT COALESCE(max_admins,1) INTO v_max
  FROM public.facility_admin_limit
  WHERE facility_id = p_facility_id;

  IF v_current >= v_max THEN
    RETURN QUERY SELECT NULL, 'admin_limit_reached';
    RETURN;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE facility_id = p_facility_id
      AND email = lower(trim(p_email))
      AND invite_type = 'facility_admin'
      AND status = 'pending'
      AND expires_at > NOW()
  ) THEN
    RETURN QUERY SELECT NULL, 'invite_already_pending';
    RETURN;
  END IF;

  -- Insert
  INSERT INTO public.invitations (
    invite_type, email, invited_name, facility_id, invited_by, token_hash
  )
  VALUES (
    'facility_admin', lower(trim(p_email)), p_name, p_facility_id, auth.uid(), p_token_hash
  )
  RETURNING id INTO v_invite_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), 'super_admin', 'facility_admin_invited', 'invitation', v_invite_id);

  RETURN QUERY SELECT v_invite_id, NULL;
END;
$$;


-- ================================================================
-- 8. RPC: ACCEPT INVITE (SECURE)
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  -- Email validation
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- Role update
  UPDATE public.profiles SET role = 'facility_admin' WHERE id = v_uid;

  -- Mapping
  INSERT INTO public.facility_admins (
    facility_id, user_id, assigned_by
  )
  VALUES (
    v_inv.facility_id, v_uid, v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  -- Mark accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (v_uid, 'facility_admin', 'invite_accepted', 'invitation', v_inv.id);

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;
-- ================================================================
-- 🔥 FIX MIGRATION (AFTER PRODUCTION FINAL)
-- ================================================================


-- ================================================================
-- 1. 🔐 FIX TOKEN SECURITY (CRITICAL)
-- ================================================================

REVOKE SELECT ON public.invitations FROM authenticated;

-- Keep access only via RPC (service_role bypasses anyway)


-- ================================================================
-- 2. ✅ ADD PERMISSIONS SUPPORT (FOR FUTURE)
-- ================================================================

ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS permissions JSONB;


-- ================================================================
-- 3. 🛡 FIX ACCEPT RPC PERMISSIONS LOGIC
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- ✅ FIXED: permissions from invite or default
  INSERT INTO public.facility_admins (
    facility_id, user_id, permissions, assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  UPDATE public.profiles SET role = 'facility_admin' WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 4. ➕ ADD DOCTOR INVITE RPC
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_doctor(
  p_doctor_id UUID,
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.invitations(
    invite_type, email, doctor_id, facility_id, invited_by, token_hash
  )
  SELECT
    'doctor',
    lower(trim(p_email)),
    d.id,
    d.facility_id,
    auth.uid(),
    p_token_hash
  FROM public.doctors d
  WHERE d.id = p_doctor_id
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, NULL;
END;
$$;


-- ================================================================
-- 5. ➕ ADD ACCEPT DOCTOR INVITE
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_doctor_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'doctor'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  UPDATE public.doctors
  SET user_id = auth.uid(),
      is_active = TRUE
  WHERE id = v_inv.doctor_id;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 6. 🔒 MAKE AUDIT LOGS IMMUTABLE
-- ================================================================

CREATE RULE audit_logs_no_update AS
ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;

CREATE RULE audit_logs_no_delete AS
ON DELETE TO public.audit_logs DO INSTEAD NOTHING;


-- ================================================================
-- 7. ⚡ ADD MISSING INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS ix_inv_token
ON public.invitations (token_hash);

CREATE INDEX IF NOT EXISTS ix_doctor_onboarding_status
ON public.doctor_onboarding (status);
-- ================================================================
-- ✅ FINAL 100% ARCHITECTURE FIX (NON-BREAKING)
-- ================================================================


-- ================================================================
-- 1. ADD MISSING CONSTRAINT (DOCTOR INVITE SAFETY)
-- ================================================================

ALTER TABLE public.invitations
DROP CONSTRAINT IF EXISTS inv_doctor_requires_facility;

ALTER TABLE public.invitations
ADD CONSTRAINT inv_doctor_requires_facility
CHECK (invite_type != 'doctor' OR doctor_id IS NOT NULL);


-- ================================================================
-- 2. FINAL INVITE FACILITY ADMIN RPC (WITH PERMISSIONS)
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_facility_admin(
  p_facility_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_token_hash TEXT,
  p_permissions JSONB DEFAULT NULL
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_current INTEGER;
  v_max INTEGER;
  v_invite_id UUID;
BEGIN
  -- Role check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role != 'super_admin' THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  -- Advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_facility_id::TEXT));

  -- Admin count
  SELECT COUNT(*) INTO v_current
  FROM public.facility_admins
  WHERE facility_id = p_facility_id AND revoked_at IS NULL;

  SELECT COALESCE(max_admins,1) INTO v_max
  FROM public.facility_admin_limit
  WHERE facility_id = p_facility_id;

  IF v_current >= v_max THEN
    RETURN QUERY SELECT NULL, 'admin_limit_reached';
    RETURN;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE facility_id = p_facility_id
      AND email = lower(trim(p_email))
      AND invite_type = 'facility_admin'
      AND status = 'pending'
      AND expires_at > NOW()
  ) THEN
    RETURN QUERY SELECT NULL, 'invite_already_pending';
    RETURN;
  END IF;

  -- Insert with permissions
  INSERT INTO public.invitations (
    invite_type, email, invited_name, facility_id, invited_by, token_hash, permissions
  )
  VALUES (
    'facility_admin',
    lower(trim(p_email)),
    p_name,
    p_facility_id,
    auth.uid(),
    p_token_hash,
    p_permissions
  )
  RETURNING id INTO v_invite_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), 'super_admin', 'facility_approved', 'invitation', v_invite_id);

  RETURN QUERY SELECT v_invite_id, NULL;
END;
$$;


-- ================================================================
-- 3. FINAL ACCEPT FACILITY ADMIN RPC (FIXED PERMISSIONS)
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- Insert with correct permissions
  INSERT INTO public.facility_admins (
    facility_id, user_id, permissions, assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  UPDATE public.profiles SET role = 'facility_admin' WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (v_uid, 'facility_admin', 'profile_update', 'invitation', v_inv.id);

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;


-- ================================================================
-- 4. SECURE CREATE DOCTOR RPC (FULL VALIDATION)
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_doctor_record(
  p_facility_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_specialty TEXT,
  p_qualifications TEXT[],
  p_fees JSONB,
  p_license_number TEXT,
  p_license_expiry DATE
)
RETURNS TABLE(doctor_id UUID, onboarding_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_fa RECORD;
  v_doc UUID;
  v_on UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('facility_admin','super_admin') THEN
    RETURN QUERY SELECT NULL, NULL, 'unauthorized';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = p_facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.doctors (
    facility_id, full_name, specialty, qualifications, fees, is_active
  )
  VALUES (
    p_facility_id, p_full_name, p_specialty, p_qualifications, p_fees, FALSE
  )
  RETURNING id INTO v_doc;

  INSERT INTO public.doctor_onboarding (
    doctor_id, status, license_number, license_expiry, initiated_by, step_basic_info
  )
  VALUES (
    v_doc, 'invited', p_license_number, p_license_expiry, auth.uid(), TRUE
  )
  RETURNING id INTO v_on;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), v_role, 'doctor_created', 'doctor', v_doc);

  RETURN QUERY SELECT v_doc, v_on, NULL;
END;
$$;


-- ================================================================
-- 5. SECURE INVITE DOCTOR RPC
-- ================================================================

CREATE OR REPLACE FUNCTION public.invite_doctor(
  p_doctor_id UUID,
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_doc RECORD;
  v_fa RECORD;
  v_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('facility_admin','super_admin') THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  SELECT * INTO v_doc FROM public.doctors WHERE id = p_doctor_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL, 'doctor_not_found';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = v_doc.facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.invitations(
    invite_type, email, doctor_id, facility_id, invited_by, token_hash
  )
  VALUES (
    'doctor',
    lower(trim(p_email)),
    p_doctor_id,
    v_doc.facility_id,
    auth.uid(),
    p_token_hash
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (auth.uid(), v_role, 'doctor_invited', 'invitation', v_id);

  RETURN QUERY SELECT v_id, NULL;
END;
$$;
create or replace function public.invite_facility_admin(
  p_account_id uuid,
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (
  invite_id uuid,
  error text
)
language plpgsql
as $$
begin

  insert into invitations (
    account_id,
    email,
    invited_by,
    facility_id,
    token_hash,
    role,
    status,
    name
  )
  values (
    p_account_id,        -- ✅ FIXED
    p_email,
    auth.uid(),
    p_facility_id,
    p_token_hash,
    'facility_admin',
    'pending',
    p_name
  );

  return query
  select id, null from invitations
  where email = p_email
  order by created_at desc
  limit 1;

end;
$$;
create or replace function public.invite_facility_admin(
  p_account_id uuid,
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (
  invite_id uuid,
  error text
)
language plpgsql
as $$
begin

  insert into invitations (
    account_id,
    email,
    invited_by,
    facility_id,
    token_hash,
    role,
    status,
    invited_name   -- ✅ FIXED
  )
  values (
    p_account_id,
    p_email,
    auth.uid(),
    p_facility_id,
    p_token_hash,
    'facility_admin',
    'pending',
    p_name         -- ✅ goes into invited_name
  );

  return query
  select id, null from invitations
  where email = p_email
  order by created_at desc
  limit 1;

end;
$$;
-- ================================
-- 1. CREATE INVITATIONS TABLE
-- ================================
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),

  invite_type text not null, -- e.g. 'facility_admin'
  email text not null,
  invited_name text,

  facility_id uuid not null,

  invited_by uuid not null, -- auth.uid()
  token_hash text not null,

  status text default 'pending',

  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '48 hours'
);


-- ================================
-- 2. CREATE RPC FUNCTION
-- ================================
create or replace function public.invite_facility_admin(
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (
  invite_id uuid,
  error text
)
language plpgsql
as $$
begin

  -- Insert invite
  insert into public.invitations (
    invite_type,
    email,
    invited_name,
    facility_id,
    invited_by,
    token_hash
  )
  values (
    'facility_admin',
    lower(trim(p_email)),
    p_name,
    p_facility_id,
    auth.uid(),
    p_token_hash
  );

  -- Return created invite
  return query
  select id, null
  from public.invitations
  where email = lower(trim(p_email))
  order by created_at desc
  limit 1;

end;
$$;


-- ================================
-- 3. GRANT PERMISSIONS
-- ================================
grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to authenticated;

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to service_role;
-- =========================================
-- 🔥 STEP 0: DROP OLD STUFF COMPLETELY (FIXED)
-- =========================================

drop table if exists public.invitations cascade;

-- ✅ DROP ALL overloaded versions explicitly
drop function if exists public.invite_facility_admin(uuid, text, text, text) cascade;
drop function if exists public.invite_facility_admin(uuid, text, text, text, jsonb) cascade;


-- =========================================
-- ✅ STEP 1: ENUMS (SAFE)
-- =========================================

do $$ begin
  create type public.invite_type as enum ('facility_admin', 'doctor', 'technician');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
exception when duplicate_object then null; end $$;


-- =========================================
-- ✅ STEP 2: CLEAN INVITATIONS TABLE
-- =========================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),

  invite_type public.invite_type not null,
  status public.invite_status not null default 'pending',

  email text not null,
  invited_name text,

  facility_id uuid not null references public.facilities(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete cascade,

  invited_by uuid not null references public.profiles(id),

  token_hash text not null unique,

  expires_at timestamptz default now() + interval '48 hours',

  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),

  created_at timestamptz default now()
);


-- =========================================
-- ✅ STEP 3: INDEXES
-- =========================================

create unique index uq_inv_pending
on public.invitations (facility_id, invite_type, email)
where status = 'pending';


-- =========================================
-- ✅ STEP 4: RPC (FINAL CLEAN VERSION)
-- =========================================

create or replace function public.invite_facility_admin(
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (invite_id uuid, error text)
language plpgsql
security definer
as $$
declare
  v_invite_id uuid;
begin

  insert into public.invitations (
    invite_type,
    email,
    invited_name,
    facility_id,
    invited_by,
    token_hash
  )
  values (
    'facility_admin',
    lower(trim(p_email)),
    p_name,
    p_facility_id,
    auth.uid(),
    p_token_hash
  )
  returning id into v_invite_id;

  return query select v_invite_id, null;

end;
$$;


-- =========================================
-- ✅ STEP 5: PERMISSIONS
-- =========================================

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to authenticated;

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to service_role;


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

-- Ensure authenticated users can execute invite acceptance RPCs.
-- These RPCs are SECURITY DEFINER and still enforce auth.uid() / email checks internally.
 
GRANT USAGE ON SCHEMA public TO authenticated;
 
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;

-- Repair migration for invite acceptance drift.
-- Ensures invitations.permissions exists and accept_facility_admin_invite
-- does not fail with: record "v_inv" has no field "permissions".
 
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS permissions JSONB;
 
CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash AND invite_type = 'facility_admin'
  FOR UPDATE;
 
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;
 
  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;
 
  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE id = v_inv.id;
 
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;
 
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = v_uid
      AND lower(email) = lower(v_inv.email)
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;
 
  INSERT INTO public.facility_admins (
    facility_id,
    user_id,
    permissions,
    assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;
 
  UPDATE public.profiles
  SET role = 'facility_admin'
  WHERE id = v_uid;
 
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;
 
  RETURN QUERY SELECT TRUE, NULL;
END;
$$;
 
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO service_role;
 

 -- Allow authenticated app users to execute doctor creation RPC.
-- Required because /api/facilities/[id]/doctors calls create_doctor_record
-- using request user context (not service-role context).
 
GRANT USAGE ON SCHEMA public TO authenticated;
 
GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  TEXT,
  DATE
) TO authenticated;
 
GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  TEXT,
  DATE
) TO service_role;
 
 -- Fix enum/type mismatch when writing audit logs from onboarding RPCs.
-- Error addressed:
-- column "actor_role" is of type public.user_role but expression is of type text

CREATE OR REPLACE FUNCTION public.create_doctor_record(
  p_facility_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_specialty TEXT,
  p_qualifications TEXT[],
  p_fees JSONB,
  p_license_number TEXT,
  p_license_expiry DATE
)
RETURNS TABLE(doctor_id UUID, onboarding_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_fa RECORD;
  v_doc UUID;
  v_on UUID;
  v_audit_action public.audit_action;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('facility_admin', 'super_admin') THEN
    RETURN QUERY SELECT NULL, NULL, 'unauthorized';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = p_facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.doctors (
    facility_id, full_name, specialty, qualifications, fees, is_active
  )
  VALUES (
    p_facility_id, p_full_name, p_specialty, p_qualifications, p_fees, FALSE
  )
  RETURNING id INTO v_doc;

  INSERT INTO public.doctor_onboarding (
    doctor_id, status, license_number, license_expiry, initiated_by, step_basic_info
  )
  VALUES (
    v_doc, 'invited', p_license_number, p_license_expiry, auth.uid(), TRUE
  )
  RETURNING id INTO v_on;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'doctor_created'
    ) THEN 'doctor_created'::public.audit_action
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'profile_update'
    ) THEN 'profile_update'::public.audit_action
    ELSE NULL
  END INTO v_audit_action;

  IF v_audit_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (auth.uid(), v_role, v_audit_action, 'doctor', v_doc);
  END IF;

  RETURN QUERY SELECT v_doc, v_on, NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_doctor(
  p_doctor_id UUID,
  p_email TEXT,
  p_token_hash TEXT
)
RETURNS TABLE(invite_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_doc RECORD;
  v_fa RECORD;
  v_id UUID;
  v_audit_action public.audit_action;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('facility_admin', 'super_admin') THEN
    RETURN QUERY SELECT NULL, 'unauthorized';
    RETURN;
  END IF;

  SELECT * INTO v_doc FROM public.doctors WHERE id = p_doctor_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL, 'doctor_not_found';
    RETURN;
  END IF;

  IF v_role = 'facility_admin' THEN
    SELECT * INTO v_fa
    FROM public.facility_admins
    WHERE user_id = auth.uid()
      AND facility_id = v_doc.facility_id
      AND revoked_at IS NULL;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL, 'not_admin_of_facility';
      RETURN;
    END IF;

    IF NOT (v_fa.permissions->>'onboard_doctors')::BOOLEAN THEN
      RETURN QUERY SELECT NULL, 'missing_permission';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.invitations(
    invite_type, email, doctor_id, facility_id, invited_by, token_hash
  )
  VALUES (
    'doctor',
    lower(trim(p_email)),
    p_doctor_id,
    v_doc.facility_id,
    auth.uid(),
    p_token_hash
  )
  RETURNING id INTO v_id;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'doctor_invited'
    ) THEN 'doctor_invited'::public.audit_action
    WHEN EXISTS (
      SELECT 1
      FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action' AND e.enumlabel = 'profile_update'
    ) THEN 'profile_update'::public.audit_action
    ELSE NULL
  END INTO v_audit_action;

  IF v_audit_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (auth.uid(), v_role, v_audit_action, 'invitation', v_id);
  END IF;

  RETURN QUERY SELECT v_id, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID, TEXT, TEXT, TEXT, TEXT[], JSONB, TEXT, DATE
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.invite_doctor(
  UUID, TEXT, TEXT
) TO authenticated;

-- Ensure invite_type enum includes technician in drifted environments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typname = 'invite_type'
  ) THEN
    ALTER TYPE public.invite_type ADD VALUE IF NOT EXISTS 'technician';
  ELSE
    CREATE TYPE public.invite_type AS ENUM ('facility_admin', 'doctor', 'technician');
  END IF;
END
$$;

-- Ensure invitations.invite_type uses the enum type (handles old text schema drift).
DO $$
DECLARE
  v_udt_name TEXT;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'invitations'
    AND c.column_name = 'invite_type';

  IF v_udt_name IS NULL THEN
    ALTER TABLE public.invitations
      ADD COLUMN invite_type public.invite_type;
  ELSIF v_udt_name <> 'invite_type' THEN
    ALTER TABLE public.invitations
      ALTER COLUMN invite_type TYPE public.invite_type
      USING invite_type::public.invite_type;
  END IF;
END
$$;


-- =====================================================
-- FIX 1: Ensure ALL users exist in profiles
-- =====================================================

INSERT INTO public.profiles (id, role, full_name)
SELECT 
  u.id,
  'patient',
  COALESCE(u.email, 'User')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- =====================================================
-- FIX 2: Make CURRENT USER super_admin
-- =====================================================

UPDATE public.profiles
SET role = 'super_admin'
WHERE id = auth.uid();


-- =====================================================
-- FIX 3: Ensure patient_profiles exist
-- =====================================================

INSERT INTO public.patient_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.patient_profiles pp ON pp.user_id = p.id
WHERE pp.user_id IS NULL;


-- =====================================================
-- FIX 4: (IMPORTANT) Add explicit INSERT policy
-- =====================================================

DROP POLICY IF EXISTS "facilities_insert_super_admin" ON public.facilities;

CREATE POLICY "facilities_insert_super_admin"
ON public.facilities
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
  )
);


-- =====================================================
-- VERIFY
-- =====================================================

SELECT id, role FROM public.profiles WHERE id = auth.uid();


-- ================================================================
-- BUG-7: Wire Audit Log Triggers
-- ================================================================
-- Ensures key system events are automatically recorded in audit_logs.
-- Covers: invitation lifecycle, facility admin changes, doctor
-- onboarding status changes, and review moderation actions.
-- ================================================================
 
-- Allow service_role to INSERT into audit_logs (used by triggers)
GRANT INSERT ON public.audit_logs TO service_role;
GRANT INSERT ON public.audit_logs TO postgres;
 
-- ================================================================
-- HELPER: Generic audit insert function
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_log(
  p_actor_user_id UUID,
  p_actor_role    TEXT,
  p_action        TEXT,
  p_resource_type TEXT,
  p_resource_id   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (p_actor_user_id, p_actor_role, p_action, p_resource_type, p_resource_id);
END;
$$;
 
GRANT EXECUTE ON FUNCTION public.hams_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION public.hams_audit_log TO postgres;
 
 
-- ================================================================
-- TRIGGER 1: Invitation status changes
-- Fires when an invitation is accepted, revoked, or expires.
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'accepted' THEN 'invitation_accepted'
    WHEN 'revoked'  THEN 'invitation_revoked'
    WHEN 'expired'  THEN 'invitation_expired'
    ELSE 'invitation_status_changed'
  END;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    NEW.invited_by,
    NEW.invite_type,
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_invitation_change ON public.invitations;
CREATE TRIGGER audit_invitation_change
AFTER UPDATE ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_invitation_change();
 
 
-- ================================================================
-- TRIGGER 2: Doctor onboarding status changes
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_onboarding_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  SELECT
    d.user_id,
    'doctor',
    'doctor_onboarding_' || NEW.status,
    'doctor_onboarding',
    NEW.id
  FROM public.doctors d
  WHERE d.id = NEW.doctor_id;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_doctor_onboarding ON public.doctor_onboarding;
CREATE TRIGGER audit_doctor_onboarding
AFTER UPDATE ON public.doctor_onboarding
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_doctor_onboarding_change();
 
 
-- ================================================================
-- TRIGGER 3: Facility admin revocation
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_facility_admin_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when revoked_at transitions from NULL to a timestamp
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      NEW.revoked_by,
      'super_admin',
      'facility_admin_revoked',
      'facility_admin',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_facility_admin_revoke ON public.facility_admins;
CREATE TRIGGER audit_facility_admin_revoke
AFTER UPDATE ON public.facility_admins
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_facility_admin_revoke();
 
 
-- ================================================================
-- TRIGGER 4: Review moderation (flag / restore)
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_review_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect visibility toggle (flag = hidden, restore = visible)
  IF OLD.is_visible IS DISTINCT FROM NEW.is_visible THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      auth.uid(),
      'facility_admin',
      CASE WHEN NEW.is_visible THEN 'review_restored' ELSE 'review_flagged' END,
      'review',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
DROP TRIGGER IF EXISTS audit_review_moderation ON public.reviews;
CREATE TRIGGER audit_review_moderation
AFTER UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_review_moderation();


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
 

 -- ================================================================
-- SECURITY FIX: Prevent role injection via signup metadata
-- ================================================================
-- The previous trigger read `role` from raw_user_meta_data, which
-- allowed any user to self-assign 'doctor', 'facility_admin', or
-- 'super_admin' by passing { role: "doctor" } in the signup payload.
--
-- New rule: self-signup ALWAYS assigns 'patient'. The only way to
-- become a non-patient is via the invitation accept flow, which uses
-- the service-role client to update profiles.role after verifying a
-- valid HMAC-signed invitation token.
-- ================================================================
 
CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always assign 'patient' on self-signup.
  -- Role elevation happens ONLY via /api/invitations/accept (service role).
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    'patient',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
 
  -- Every new user gets a patient_profiles row (harmless for non-patients).
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
 
  RETURN NEW;
END;
$$;
 
-- Recreate the trigger (function already replaced above, trigger stays)
DROP TRIGGER IF EXISTS on_auth_user_created_hams ON auth.users;
 
CREATE TRIGGER on_auth_user_created_hams
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hams_handle_new_user();
 
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.hams_handle_new_user() TO authenticated;


-- ================================================================
-- FIX: Audit invitation trigger — cast invite_type to user_role
-- ================================================================
-- actor_role column is user_role enum; NEW.invite_type is invite_type
-- enum. Cast via TEXT so 'facility_admin', 'doctor', 'technician'
-- are accepted (all exist in both enums).
-- ================================================================
 
CREATE OR REPLACE FUNCTION public.hams_audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'accepted' THEN 'invitation_accepted'
    WHEN 'revoked'  THEN 'invitation_revoked'
    WHEN 'expired'  THEN 'invitation_expired'
    ELSE 'invitation_status_changed'
  END;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    NEW.invited_by,
    NEW.invite_type::TEXT::public.user_role,   -- ✅ cast invite_type → TEXT → user_role
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;


-- ================================================================
-- FIX: Add missing audit_action enum values + rewrite triggers
-- ================================================================
-- The audit_action enum didn't include invitation/onboarding/admin
-- revocation values used by the triggers. This migration:
--   1. Adds the missing enum values
--   2. Rewrites all 4 trigger functions with correct enum casts
-- ================================================================
 
-- ── 1. Extend audit_action enum ──────────────────────────────────
 
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_accepted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_revoked';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_expired';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_pending';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_in_progress';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_onboarding_completed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_admin_revoked';
 
 
-- ── 2. TRIGGER 1: Invitation status changes ───────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_invitation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'accepted' THEN 'invitation_accepted'::public.audit_action
    WHEN 'revoked'  THEN 'invitation_revoked'::public.audit_action
    WHEN 'expired'  THEN 'invitation_expired'::public.audit_action
    ELSE NULL
  END;
 
  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    NEW.invited_by,
    NEW.invite_type::TEXT::public.user_role,
    v_action,
    'invitation',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
 
-- ── 3. TRIGGER 2: Doctor onboarding status changes ────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_onboarding_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
  v_user_id UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
 
  v_action := CASE NEW.status
    WHEN 'pending'     THEN 'doctor_onboarding_pending'::public.audit_action
    WHEN 'in_progress' THEN 'doctor_onboarding_in_progress'::public.audit_action
    WHEN 'completed'   THEN 'doctor_onboarding_completed'::public.audit_action
    ELSE NULL
  END;
 
  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;
 
  SELECT user_id INTO v_user_id FROM public.doctors WHERE id = NEW.doctor_id;
 
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    v_user_id,
    'doctor'::public.user_role,
    v_action,
    'doctor_onboarding',
    NEW.id
  );
 
  RETURN NEW;
END;
$$;
 
 
-- ── 4. TRIGGER 3: Facility admin revocation ───────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_facility_admin_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      NEW.revoked_by,
      'super_admin'::public.user_role,
      'facility_admin_revoked'::public.audit_action,
      'facility_admin',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 
 
-- ── 5. TRIGGER 4: Review moderation ──────────────────────────────
 
CREATE OR REPLACE FUNCTION public.hams_audit_review_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_visible IS DISTINCT FROM NEW.is_visible THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      auth.uid(),
      'facility_admin'::public.user_role,
      CASE WHEN NEW.is_visible
        THEN 'review_restored'::public.audit_action
        ELSE 'review_flagged'::public.audit_action
      END,
      'review',
      NEW.id
    );
  END IF;
 
  RETURN NEW;
END;
$$;
 


 -- Add custom_type column to facilities table.
-- Used when facility type = 'other' to store a user-defined description.
-- ENUM column stays strict; free text lives in a separate nullable column.

ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS custom_type TEXT;


-- Add emergency_reason column to appointments (nullable text)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS emergency_reason TEXT;

-- RPC: create_emergency_appointment
-- Called from /api/appointments/emergency by a patient.
-- Creates a pending emergency appointment without a real slot.
-- Slot (date/time) is assigned later by facility_admin via approve-emergency endpoint.
-- Emergency appointments are exempt from uq_appointment_slot (WHERE is_emergency = FALSE).

-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS public.create_emergency_appointment(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_emergency_appointment(
  p_patient_id  UUID,
  p_doctor_id   UUID,
  p_facility_id UUID,
  p_reason      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  INSERT INTO public.appointments (
    patient_id,
    doctor_id,
    facility_id,
    slot_date,
    slot_start,
    slot_end,
    type,
    status,
    is_emergency,
    emergency_reason
  ) VALUES (
    p_patient_id,
    p_doctor_id,
    p_facility_id,
    CURRENT_DATE,
    '00:00',
    '00:30',
    'in_person',
    'pending',
    TRUE,
    p_reason
  )
  RETURNING id INTO v_appointment_id;

  RETURN json_build_object('success', TRUE, 'appointment_id', v_appointment_id);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_emergency_appointment(UUID, UUID, UUID, TEXT)
  TO authenticated;


-- Enforce that invitations always inherit facility_id from the inviter.
-- Prevents facility_id spoofing on INSERT or UPDATE to invitations table.
-- Supports facility_admin, doctor, and technician as inviters.

-- 🔹 1. Create function to enforce facility_id from inviter

CREATE OR REPLACE FUNCTION enforce_invitation_facility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_facility_id uuid;
BEGIN
  -- Get facility_id from facility_admins (inviter)
  SELECT fa.facility_id
  INTO inviter_facility_id
  FROM facility_admins fa
  WHERE fa.user_id = NEW.invited_by
    AND fa.revoked_at IS NULL
  LIMIT 1;

  -- If inviter is not facility_admin, fallback to doctors
  IF inviter_facility_id IS NULL THEN
    SELECT d.facility_id
    INTO inviter_facility_id
    FROM doctors d
    WHERE d.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- Optional: technician support
  IF inviter_facility_id IS NULL THEN
    SELECT t.facility_id
    INTO inviter_facility_id
    FROM technicians t
    WHERE t.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- 🚨 FINAL ENFORCEMENT
  IF inviter_facility_id IS NULL THEN
    RAISE EXCEPTION 'Inviter does not belong to any facility';
  END IF;

  NEW.facility_id := inviter_facility_id;

  RETURN NEW;
END;
$$;


-- 🔹 2. Attach trigger to invitations table

DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON invitations;

CREATE TRIGGER trg_enforce_invitation_facility
BEFORE INSERT OR UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION enforce_invitation_facility();


-- Fix enforce_invitation_facility trigger:
-- 1. SET search_path = public so bare table names resolve
-- 2. super_admin bypasses facility lookup — trusts facility_id already set in the INSERT
-- 3. Explicit public. schema prefix on all table references as double-safety

CREATE OR REPLACE FUNCTION public.enforce_invitation_facility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_facility_id uuid;
  inviter_role        text;
BEGIN
  -- Resolve inviter role
  SELECT role INTO inviter_role
  FROM public.profiles
  WHERE id = NEW.invited_by;

  -- super_admin: facility_id is set explicitly by caller — trust it
  IF inviter_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- facility_admin
  SELECT fa.facility_id INTO inviter_facility_id
  FROM public.facility_admins fa
  WHERE fa.user_id = NEW.invited_by
    AND fa.revoked_at IS NULL
  LIMIT 1;

  -- fallback: doctor
  IF inviter_facility_id IS NULL THEN
    SELECT d.facility_id INTO inviter_facility_id
    FROM public.doctors d
    WHERE d.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  -- fallback: technician
  IF inviter_facility_id IS NULL THEN
    SELECT t.facility_id INTO inviter_facility_id
    FROM public.technicians t
    WHERE t.user_id = NEW.invited_by
    LIMIT 1;
  END IF;

  IF inviter_facility_id IS NULL THEN
    RAISE EXCEPTION 'Inviter (%) does not belong to any facility', NEW.invited_by;
  END IF;

  NEW.facility_id := inviter_facility_id;
  RETURN NEW;
END;
$$;


-- Discard the trigger-based approach for facility enforcement.
-- The correct fix is in the RPC + API accept flow (see next migrations).

DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON public.invitations;
DROP FUNCTION IF EXISTS public.enforce_invitation_facility();


-- Add facility_id to profiles table.
-- Single source of truth for which facility this user belongs to.
-- Populated during invite acceptance (doctor, technician, facility_admin flows).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_profiles_facility_id
  ON public.profiles (facility_id)
  WHERE facility_id IS NOT NULL;



-- Fix accept_doctor_invite RPC.
-- Previously only SET user_id + is_active on the doctor record.
-- Now also enforces facility_id = invitations.facility_id so the doctor
-- is always assigned to the invited facility, never a stale/wrong one.
-- Also syncs profiles.facility_id + profiles.role = 'doctor'.

CREATE OR REPLACE FUNCTION public.accept_doctor_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
    AND invite_type = 'doctor'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- Link auth user to the pre-created doctor record.
  -- ALWAYS enforce facility_id from the invitation — never trust the old value.
  UPDATE public.doctors
  SET
    user_id     = v_uid,
    facility_id = v_inv.facility_id,
    is_active   = TRUE
  WHERE id = v_inv.doctor_id;

  -- Update profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'doctor',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  -- Mark invitation accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;


-- Fix accept_facility_admin_invite RPC.
-- Already uses v_inv.facility_id correctly for facility_admins insert.
-- Adding: sync profiles.facility_id so the profile table is consistent.

CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
    AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- Insert facility_admins row using invitation's facility_id
  INSERT INTO public.facility_admins (
    facility_id,
    user_id,
    permissions,
    assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  -- Update profile: role + facility_id (single source of truth)
  UPDATE public.profiles
  SET
    role        = 'facility_admin',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  -- Mark invitation accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;



-- ============================================================
-- FACILITY ID CONSISTENCY — FULL FIX
-- ============================================================
-- Problem: doctors/technicians end up with wrong facility_id
-- after invite acceptance because the old accept_doctor_invite
-- RPC never updated facility_id on the doctor record.
-- Also: the trigger added in 000001–000003 blocks super_admin
-- invite creation since super_admin is not in facility_admins.
-- ============================================================

-- ── 1. Drop the trigger (approach discarded) ────────────────
DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON public.invitations;
DROP FUNCTION IF EXISTS public.enforce_invitation_facility();

-- ── 2. Add facility_id to profiles (single source of truth) ─
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_id UUID
    REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_profiles_facility_id
  ON public.profiles (facility_id)
  WHERE facility_id IS NOT NULL;

-- ── 3. Fix accept_doctor_invite ─────────────────────────────
-- Old version only SET user_id + is_active, never touched
-- facility_id → doctor kept whatever was on the pre-created
-- record, which could differ from the invitation.
CREATE OR REPLACE FUNCTION public.accept_doctor_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
    AND invite_type = 'doctor'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  -- ALWAYS enforce facility_id from invitation — single source of truth
  UPDATE public.doctors
  SET
    user_id     = v_uid,
    facility_id = v_inv.facility_id,
    is_active   = TRUE
  WHERE id = v_inv.doctor_id;

  -- Sync profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'doctor',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_doctor_invite(TEXT) TO authenticated;

-- ── 4. Fix accept_facility_admin_invite ─────────────────────
-- Add facility_id sync to profiles (was missing)
CREATE OR REPLACE FUNCTION public.accept_facility_admin_invite(
  p_token_hash TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
    AND invite_type = 'facility_admin'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'invalid_token';
    RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, 'invite_not_pending';
    RETURN;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN QUERY SELECT FALSE, 'invite_expired';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email = v_inv.email
  ) THEN
    RETURN QUERY SELECT FALSE, 'email_mismatch';
    RETURN;
  END IF;

  INSERT INTO public.facility_admins (
    facility_id, user_id, permissions, assigned_by
  )
  VALUES (
    v_inv.facility_id,
    v_uid,
    COALESCE(
      v_inv.permissions,
      '{
        "onboard_doctors": true,
        "manage_appointments": true,
        "view_reports": true,
        "edit_clinic_profile": false,
        "access_billing": false
      }'::JSONB
    ),
    v_inv.invited_by
  )
  ON CONFLICT (facility_id, user_id) DO NOTHING;

  -- Sync profile: role + facility_id
  UPDATE public.profiles
  SET
    role        = 'facility_admin',
    facility_id = v_inv.facility_id
  WHERE id = v_uid;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_facility_admin_invite(TEXT) TO authenticated;

-- ── 5. DATA REPAIR ───────────────────────────────────────────
-- Fix doctors whose facility_id differs from the invitation
-- they accepted. Uses the most recent accepted doctor invite
-- for each doctor_id as the source of truth.
UPDATE public.doctors d
SET facility_id = i.facility_id
FROM public.invitations i
WHERE i.doctor_id     = d.id
  AND i.invite_type   = 'doctor'
  AND i.status        = 'accepted'
  AND d.facility_id  != i.facility_id
  AND i.accepted_at = (
    SELECT MAX(i2.accepted_at)
    FROM public.invitations i2
    WHERE i2.doctor_id = d.id
      AND i2.status    = 'accepted'
  );

-- Sync profiles.facility_id for doctors from their doctor record
UPDATE public.profiles p
SET facility_id = d.facility_id
FROM public.doctors d
WHERE d.user_id     = p.id
  AND p.role        = 'doctor'
  AND (p.facility_id IS NULL OR p.facility_id != d.facility_id);

-- Sync profiles.facility_id for technicians from their technician record
UPDATE public.profiles p
SET facility_id = t.facility_id
FROM public.technicians t
WHERE t.user_id     = p.id
  AND p.role        = 'technician'
  AND (p.facility_id IS NULL OR p.facility_id != t.facility_id);

-- Sync profiles.facility_id for facility_admins from facility_admins table
UPDATE public.profiles p
SET facility_id = fa.facility_id
FROM public.facility_admins fa
WHERE fa.user_id       = p.id
  AND fa.revoked_at    IS NULL
  AND p.role           = 'facility_admin'
  AND (p.facility_id IS NULL OR p.facility_id != fa.facility_id);


create or replace function public.get_earnings_dashboard(
  p_facility_id uuid,
  p_period text
)
returns json
language plpgsql
security definer
as $$
declare result json;
begin
  select json_build_object(

    -- 📈 Revenue over time
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, p.created_at) as period,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor OR 🏥 Facility breakdown
    'breakdown',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (

        -- 🔥 CASE 1: Facility Admin → Doctor breakdown
        select 
          d.full_name as name,
          sum(p.amount) as total
        from public.payments p
        join public.appointments a on a.id = p.appointment_id
        join public.doctors d on d.id = a.doctor_id
        where 
          p_facility_id is not null
          and p.facility_id = p_facility_id
          and p.status = 'paid'
        group by d.full_name

        union all

        -- 🔥 CASE 2: Super Admin → Facility breakdown
        select 
          f.name as name,
          sum(p.amount) as total
        from public.payments p
        join public.facilities f on f.id = p.facility_id
        where 
          p_facility_id is null
          and p.status = 'paid'
        group by f.name

      ) t
    ),

    -- 💳 Payment methods
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          p.payment_method,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by p.payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(p.amount), 0),
        'count', count(*)
      )
      from public.payments p
      where 
        (p.facility_id = p_facility_id OR p_facility_id is null)
        and p.status = 'paid'
    )

  ) into result;

  return result;
end;
$$;


-- =========================================================
-- F-30 Earnings Dashboard (Facility + Super Admin)
-- =========================================================

create or replace function public.get_earnings_dashboard(
  p_facility_id uuid,
  p_period text
)
returns json
language plpgsql
security definer
as $$
declare result json;
begin
  select json_build_object(

    -- 📈 Revenue over time
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, created_at) as period,
          sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor breakdown
    'doctors',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select doctor_id, sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by doctor_id
      ) t
    ),

    -- 💳 Payment method split
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select payment_method, sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(amount), 0),
        'count', count(*)
      )
      from public.payments
      where 
        (facility_id = p_facility_id OR p_facility_id is null)
        and status = 'paid'
    )

  ) into result;

  return result;
end;
$$;

grant execute on function public.get_earnings_dashboard(uuid, text)
to authenticated, service_role;


create or replace function public.get_earnings_dashboard(
  p_facility_id uuid,
  p_period text
)
returns json
language plpgsql
security definer
as $$
declare result json;
begin
  select json_build_object(

    -- 📈 Revenue
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, p.created_at) as period,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor breakdown (FIXED JOIN)
    'doctors',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          a.doctor_id,
          sum(p.amount) as total
        from public.payments p
        join public.appointments a 
          on a.id = p.appointment_id
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
          and a.doctor_id is not null
        group by a.doctor_id
      ) t
    ),

    -- 💳 Payment methods
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          p.payment_method, 
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by p.payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(p.amount), 0),
        'count', count(*)
      )
      from public.payments p
      where 
        (p.facility_id = p_facility_id OR p_facility_id is null)
        and p.status = 'paid'
    )

  ) into result;

  return result;
end;
$$;

create or replace function public.get_earnings_dashboard(
  p_facility_id uuid,
  p_period text
)
returns json
language plpgsql
security definer
as $$
declare result json;
begin
  select json_build_object(

    -- 📈 Revenue over time
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, p.created_at) as period,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor OR 🏥 Facility breakdown
    'breakdown',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (

        -- 🔥 CASE 1: Facility Admin → Doctor breakdown
        select 
          d.full_name as name,
          sum(p.amount) as total
        from public.payments p
        join public.appointments a on a.id = p.appointment_id
        join public.doctors d on d.id = a.doctor_id
        where 
          p_facility_id is not null
          and p.facility_id = p_facility_id
          and p.status = 'paid'
        group by d.full_name

        union all

        -- 🔥 CASE 2: Super Admin → Facility breakdown
        select 
          f.name as name,
          sum(p.amount) as total
        from public.payments p
        join public.facilities f on f.id = p.facility_id
        where 
          p_facility_id is null
          and p.status = 'paid'
        group by f.name

      ) t
    ),

    -- 💳 Payment methods
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          p.payment_method,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by p.payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(p.amount), 0),
        'count', count(*)
      )
      from public.payments p
      where 
        (p.facility_id = p_facility_id OR p_facility_id is null)
        and p.status = 'paid'
    )

  ) into result;

  return result;
end;
$$;


CREATE OR REPLACE FUNCTION get_monthly_report_summary(
  p_facility_id UUID,
  p_month INT,
  p_year INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end   DATE := v_start + INTERVAL '1 month';
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total',      COUNT(*),
    'confirmed',  COUNT(*) FILTER (WHERE status = 'confirmed'),
    'cancelled',  COUNT(*) FILTER (WHERE status = 'cancelled'),
    'pending',    COUNT(*) FILTER (WHERE status = 'pending'),
    'completed',  COUNT(*) FILTER (WHERE status = 'completed'),
    'emergency',  COUNT(*) FILTER (WHERE is_emergency = true)
  )
  INTO v_result
  FROM appointments
  WHERE facility_id = p_facility_id
    AND slot_date >= v_start
    AND slot_date < v_end;

  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_monthly_report_summary(UUID, INT, INT) TO service_role;


-- F-52: Lab Results Delivery
-- Creates the 'lab-results' storage bucket, storage RLS policies,
-- and a DB trigger that invokes the notify-lab-result Edge Function.

-- ============================================================
-- 1. Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-results', 'lab-results', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Storage RLS — technician / facility_admin / super_admin can upload
-- ============================================================
CREATE POLICY "lab_results_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lab-results'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('technician', 'facility_admin', 'super_admin')
  )
);

-- ============================================================
-- 3. Storage RLS — read access
--    • facility staff  → all files in bucket
--    • doctors         → all files (row-level enforced in API)
--    • patients        → only their own path: results/{patient_profile_id}/...
-- ============================================================
CREATE POLICY "lab_results_read_storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lab-results'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('technician', 'facility_admin', 'super_admin', 'doctor')
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles pp
      WHERE pp.user_id = auth.uid()
        AND storage.objects.name LIKE 'results/' || pp.id || '/%'
    )
  )
);

-- ============================================================
-- 4. Trigger function — calls Edge Function notify-lab-result
--    Uses pg_net (available on all Supabase projects).
--    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
--    as database settings by Supabase automatically.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_notify_lab_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  text;
  _key  text;
BEGIN
  _url := current_setting('app.settings.supabase_url',  true);
  _key := current_setting('app.settings.service_role_key', true);

  -- Fallback to env vars set by Supabase runtime
  IF _url IS NULL OR _url = '' THEN
    _url := current_setting('supabase.supabase_url', true);
  END IF;
  IF _key IS NULL OR _key = '' THEN
    _key := current_setting('supabase.service_role_key', true);
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/notify-lab-result',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := jsonb_build_object('lab_result_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Attach trigger to lab_results
-- ============================================================
DROP TRIGGER IF EXISTS on_lab_result_inserted ON public.lab_results;

CREATE TRIGGER on_lab_result_inserted
AFTER INSERT ON public.lab_results
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notify_lab_result();


-- F-52 fix: drop the net.http_post trigger (requires DB URL setting not available locally).
-- Notifications are now inserted directly from the Next.js API route using service role.

DROP TRIGGER IF EXISTS on_lab_result_inserted ON public.lab_results;
DROP FUNCTION IF EXISTS public.trigger_notify_lab_result();


-- ✅ ANNOUNCEMENTS TABLE
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  title text not null,
  message text not null,
  channels text[] default '{}',
  target_audience text default 'all',
  sent_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ✅ NEW NOTIFICATIONS TABLE (DO NOT TOUCH OLD ONE)
create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  facility_id uuid,
  title text,
  message text,
  type text default 'announcement',
  read boolean default false,
  created_at timestamptz default now()
);

-- ✅ MUTED FACILITIES
alter table profiles
add column if not exists muted_facilities uuid[] default '{}';

create table if not exists in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  facility_id uuid,
  title text,
  body text,
  type text default 'announcement',
  is_read boolean default false,
  created_at timestamptz default now()
);

-- performance
create index if not exists idx_notifications_user on in_app_notifications(user_id);

-- ================================================================
-- Fix: ensure all audit_logs columns exist
-- Migration 20260402145418 defined audit_logs with only 7 columns
-- (no actor_ip, before, after, metadata). These ADD COLUMN IF NOT EXISTS
-- statements are safe to run on any DB state — no-op if column exists.
-- ================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_ip  INET,
  ADD COLUMN IF NOT EXISTS before    JSONB,
  ADD COLUMN IF NOT EXISTS after     JSONB,
  ADD COLUMN IF NOT EXISTS metadata  JSONB NOT NULL DEFAULT '{}';

-- Ensure service_role INSERT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
    AND policyname = 'audit_logs_service_insert'
  ) THEN
    CREATE POLICY "audit_logs_service_insert"
    ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END;
$$;

-- Replace any partial SELECT policy with one that covers both super_admin and facility_admin
DROP POLICY IF EXISTS "audit_logs_super_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_read"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'facility_admin')
  )
);

-- ================================================================
-- Audit Triggers: Application-Level Sensitive Events
-- ================================================================
-- Covers: profile registration, appointments, patient profiles,
-- doctor profiles, patient documents, payments, refunds,
-- moderation requests (review flagging).
--
-- All triggers are SECURITY DEFINER and run as postgres, so they
-- bypass RLS and always write audit records regardless of which
-- role initiated the DB operation.
-- ================================================================


-- ================================================================
-- TRIGGER 1: Profile created → register event
-- Fires when a new row is inserted into profiles (any signup path).
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_profile_register()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, after
  ) VALUES (
    NEW.id,
    NEW.role::public.user_role,
    'register'::public.audit_action,
    'profile',
    NEW.id,
    jsonb_build_object('role', NEW.role)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profile_register ON public.profiles;
CREATE TRIGGER audit_profile_register
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_profile_register();


-- ================================================================
-- TRIGGER 2: Appointment created or status changed
-- INSERT  → appointment_create
-- UPDATE where status changes to 'cancelled' → appointment_cancel
-- UPDATE where status changes to anything else → appointment_update
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action      public.audit_action;
  v_patient_uid UUID;
  v_actor_id    UUID;
  v_actor_role  public.user_role;
BEGIN
  -- Resolve the patient's auth user_id
  SELECT user_id INTO v_patient_uid
  FROM public.patient_profiles
  WHERE id = NEW.patient_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id, after
    ) VALUES (
      v_patient_uid,
      'patient'::public.user_role,
      'appointment_create'::public.audit_action,
      'appointment',
      NEW.id,
      jsonb_build_object(
        'status',      NEW.status,
        'slot_date',   NEW.slot_date,
        'slot_start',  NEW.slot_start,
        'doctor_id',   NEW.doctor_id,
        'facility_id', NEW.facility_id
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log when status actually changed
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;

    -- Determine who performed the cancellation/update
    IF NEW.cancelled_by IS NOT NULL AND OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by THEN
      v_actor_id := NEW.cancelled_by;
      SELECT role INTO v_actor_role FROM public.profiles WHERE id = NEW.cancelled_by;
    ELSE
      v_actor_id   := v_patient_uid;
      v_actor_role := 'patient'::public.user_role;
    END IF;

    v_action := CASE NEW.status::TEXT
      WHEN 'cancelled' THEN 'appointment_cancel'::public.audit_action
      ELSE 'appointment_update'::public.audit_action
    END;

    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id, before, after
    ) VALUES (
      v_actor_id,
      v_actor_role,
      v_action,
      'appointment',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status',               NEW.status,
        'cancellation_reason',  NEW.cancellation_reason
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_appointment ON public.appointments;
CREATE TRIGGER audit_appointment
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_appointment();


-- ================================================================
-- TRIGGER 3: Patient profile updated → profile_update
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_patient_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, before, after
  ) VALUES (
    NEW.user_id,
    'patient'::public.user_role,
    'profile_update'::public.audit_action,
    'patient_profile',
    NEW.id,
    jsonb_build_object(
      'date_of_birth', OLD.date_of_birth,
      'gender',        OLD.gender,
      'blood_group',   OLD.blood_group
    ),
    jsonb_build_object(
      'date_of_birth', NEW.date_of_birth,
      'gender',        NEW.gender,
      'blood_group',   NEW.blood_group
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patient_profile ON public.patient_profiles;
CREATE TRIGGER audit_patient_profile
AFTER UPDATE ON public.patient_profiles
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_patient_profile();


-- ================================================================
-- TRIGGER 4: Doctor profile updated → profile_update
-- Only fires when user_id is set (linked to an auth user).
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, before, after
  ) VALUES (
    NEW.user_id,
    'doctor'::public.user_role,
    'profile_update'::public.audit_action,
    'doctor_profile',
    NEW.id,
    jsonb_build_object(
      'specialty', OLD.specialty,
      'bio',       OLD.bio,
      'fees',      OLD.fees,
      'status',    OLD.status
    ),
    jsonb_build_object(
      'specialty', NEW.specialty,
      'bio',       NEW.bio,
      'fees',      NEW.fees,
      'status',    NEW.status
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_doctor_profile ON public.doctors;
CREATE TRIGGER audit_doctor_profile
AFTER UPDATE ON public.doctors
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_doctor_profile();


-- ================================================================
-- TRIGGER 5: Patient document uploaded or soft-deleted
-- INSERT                           → document_upload
-- UPDATE where deleted_at set      → document_delete
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_patient_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.patient_profiles
  WHERE id = NEW.patient_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id, after
    ) VALUES (
      v_user_id,
      'patient'::public.user_role,
      'document_upload'::public.audit_action,
      'patient_document',
      NEW.id,
      jsonb_build_object(
        'name',            NEW.name,
        'type',            NEW.type,
        'file_size_bytes', NEW.file_size_bytes
      )
    );

  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_user_id, actor_role, action, resource_type, resource_id, before
    ) VALUES (
      v_user_id,
      'patient'::public.user_role,
      'document_delete'::public.audit_action,
      'patient_document',
      NEW.id,
      jsonb_build_object('name', NEW.name, 'file_url', NEW.file_url)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patient_document ON public.patient_documents;
CREATE TRIGGER audit_patient_document
AFTER INSERT OR UPDATE ON public.patient_documents
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_patient_document();


-- ================================================================
-- TRIGGER 6: Payment marked as paid → payment_processed
-- payments.patient_id → patient_profiles.id → profiles.id
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status::TEXT <> 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT pp.user_id INTO v_user_id
  FROM public.patient_profiles pp
  WHERE pp.id = NEW.patient_id;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, before, after
  ) VALUES (
    v_user_id,
    'patient'::public.user_role,
    'payment_processed'::public.audit_action,
    'payment',
    NEW.id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object(
      'status',   NEW.status,
      'amount',   NEW.amount,
      'currency', NEW.currency
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_payment ON public.payments;
CREATE TRIGGER audit_payment
AFTER UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_payment();


-- ================================================================
-- TRIGGER 7: Refund row created → refund_initiated
-- Navigates: refunds.payment_id → payments.patient_id → patient_profiles.user_id
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT pp.user_id INTO v_user_id
  FROM public.payments p
  JOIN public.patient_profiles pp ON pp.id = p.patient_id
  WHERE p.id = NEW.payment_id;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, after
  ) VALUES (
    v_user_id,
    'patient'::public.user_role,
    'refund_initiated'::public.audit_action,
    'refund',
    NEW.id,
    jsonb_build_object(
      'amount', NEW.amount,
      'reason', NEW.reason,
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_refund ON public.refunds;
CREATE TRIGGER audit_refund
AFTER INSERT ON public.refunds
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_refund();


-- ================================================================
-- TRIGGER 8: Moderation request created → review_flagged
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_moderation_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.flagged_by;

  INSERT INTO public.audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id, after
  ) VALUES (
    NEW.flagged_by,
    v_role,
    'review_flagged'::public.audit_action,
    'review',
    NEW.review_id,
    jsonb_build_object('reason', NEW.reason)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_moderation_request ON public.moderation_requests;
CREATE TRIGGER audit_moderation_request
AFTER INSERT ON public.moderation_requests
FOR EACH ROW
EXECUTE FUNCTION public.hams_audit_moderation_request();


-- ================================================================
-- COMPREHENSIVE AUDIT TRIGGERS — ALL DATA-WRITE EVENTS
-- Run this entirely in Supabase SQL Editor
-- Part of hybrid audit approach: triggers cover DB writes,
-- API logging covers auth/read/external events
-- ================================================================
-- Every function uses EXCEPTION WHEN OTHERS → never blocks main op
-- ================================================================


-- ================================================================
-- 1. profiles INSERT → register
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_profile_register()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
  VALUES (
    NEW.id,
    NEW.role::public.user_role,
    'register'::public.audit_action,
    'profile',
    NEW.id,
    jsonb_build_object('role', NEW.role)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_profile_register failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profile_register ON public.profiles;
CREATE TRIGGER audit_profile_register
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_profile_register();


-- ================================================================
-- 2. profiles UPDATE → user_suspended, user_reactivated,
--    2fa_enabled, 2fa_disabled, account_deletion_requested
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_profile_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action public.audit_action;
BEGIN
  -- account status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'suspended' THEN
      v_action := 'user_suspended'::public.audit_action;
    ELSIF OLD.status = 'suspended' AND NEW.status = 'active' THEN
      v_action := 'user_reactivated'::public.audit_action;
    END IF;

    IF v_action IS NOT NULL THEN
      INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
      VALUES (
        COALESCE(auth.uid(), NEW.id),
        NEW.role::public.user_role,
        v_action,
        'profile',
        NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;
  END IF;

  -- 2FA toggle
  IF OLD.two_factor_enabled IS DISTINCT FROM NEW.two_factor_enabled THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (
      NEW.id,
      NEW.role::public.user_role,
      CASE WHEN NEW.two_factor_enabled THEN '2fa_enabled' ELSE '2fa_disabled' END::public.audit_action,
      'profile',
      NEW.id
    );
  END IF;

  -- account deletion requested
  IF OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
    VALUES (
      NEW.id,
      NEW.role::public.user_role,
      'account_deletion_requested'::public.audit_action,
      'profile',
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_profile_change failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profile_change ON public.profiles;
CREATE TRIGGER audit_profile_change
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_profile_change();


-- ================================================================
-- 3. appointments INSERT/UPDATE → appointment_create/cancel/update
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action      public.audit_action;
  v_patient_uid UUID;
  v_actor_id    UUID;
  v_actor_role  public.user_role;
BEGIN
  SELECT user_id INTO v_patient_uid
  FROM public.patient_profiles WHERE id = NEW.patient_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
    VALUES (
      v_patient_uid,
      'patient'::public.user_role,
      'appointment_create'::public.audit_action,
      'appointment',
      NEW.id,
      jsonb_build_object(
        'status', NEW.status, 'slot_date', NEW.slot_date,
        'slot_start', NEW.slot_start, 'doctor_id', NEW.doctor_id,
        'facility_id', NEW.facility_id
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

    IF NEW.cancelled_by IS NOT NULL AND OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by THEN
      v_actor_id := NEW.cancelled_by;
      SELECT role INTO v_actor_role FROM public.profiles WHERE id = NEW.cancelled_by;
    ELSE
      v_actor_id   := v_patient_uid;
      v_actor_role := 'patient'::public.user_role;
    END IF;

    v_action := CASE NEW.status::TEXT
      WHEN 'cancelled' THEN 'appointment_cancel'::public.audit_action
      ELSE 'appointment_update'::public.audit_action
    END;

    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
    VALUES (
      v_actor_id, v_actor_role, v_action, 'appointment', NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'cancellation_reason', NEW.cancellation_reason)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_appointment failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_appointment ON public.appointments;
CREATE TRIGGER audit_appointment
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_appointment();


-- ================================================================
-- 4. patient_profiles UPDATE → profile_update
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_patient_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
  VALUES (
    NEW.user_id,
    'patient'::public.user_role,
    'profile_update'::public.audit_action,
    'patient_profile',
    NEW.id,
    jsonb_build_object('date_of_birth', OLD.date_of_birth, 'gender', OLD.gender, 'blood_group', OLD.blood_group),
    jsonb_build_object('date_of_birth', NEW.date_of_birth, 'gender', NEW.gender, 'blood_group', NEW.blood_group)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_patient_profile failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patient_profile ON public.patient_profiles;
CREATE TRIGGER audit_patient_profile
AFTER UPDATE ON public.patient_profiles
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_patient_profile();


-- ================================================================
-- 5. doctors UPDATE → profile_update
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_doctor_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
  VALUES (
    NEW.user_id,
    'doctor'::public.user_role,
    'profile_update'::public.audit_action,
    'doctor_profile',
    NEW.id,
    jsonb_build_object('specialty', OLD.specialty, 'bio', OLD.bio, 'fees', OLD.fees),
    jsonb_build_object('specialty', NEW.specialty, 'bio', NEW.bio, 'fees', NEW.fees)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_doctor_profile failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_doctor_profile ON public.doctors;
CREATE TRIGGER audit_doctor_profile
AFTER UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_doctor_profile();


-- ================================================================
-- 6. patient_documents INSERT/UPDATE → document_upload / document_delete
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_patient_document()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM public.patient_profiles WHERE id = NEW.patient_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
    VALUES (
      v_user_id, 'patient'::public.user_role,
      'document_upload'::public.audit_action, 'patient_document', NEW.id,
      jsonb_build_object('name', NEW.name, 'type', NEW.type, 'file_size_bytes', NEW.file_size_bytes)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before)
    VALUES (
      v_user_id, 'patient'::public.user_role,
      'document_delete'::public.audit_action, 'patient_document', NEW.id,
      jsonb_build_object('name', NEW.name, 'file_url', NEW.file_url)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_patient_document failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patient_document ON public.patient_documents;
CREATE TRIGGER audit_patient_document
AFTER INSERT OR UPDATE ON public.patient_documents
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_patient_document();


-- ================================================================
-- 7. payments UPDATE → payment_processed
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status::TEXT <> 'paid' THEN RETURN NEW; END IF;

  SELECT pp.user_id INTO v_user_id
  FROM public.patient_profiles pp WHERE pp.id = NEW.patient_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
  VALUES (
    v_user_id, 'patient'::public.user_role,
    'payment_processed'::public.audit_action, 'payment', NEW.id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'currency', NEW.currency)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_payment failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_payment ON public.payments;
CREATE TRIGGER audit_payment
AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_payment();


-- ================================================================
-- 8. refunds INSERT → refund_initiated
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_refund()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT pp.user_id INTO v_user_id
  FROM public.payments p
  JOIN public.patient_profiles pp ON pp.id = p.patient_id
  WHERE p.id = NEW.payment_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
  VALUES (
    v_user_id, 'patient'::public.user_role,
    'refund_initiated'::public.audit_action, 'refund', NEW.id,
    jsonb_build_object('amount', NEW.amount, 'reason', NEW.reason, 'status', NEW.status)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_refund failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_refund ON public.refunds;
CREATE TRIGGER audit_refund
AFTER INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_refund();


-- ================================================================
-- 9. refunds UPDATE → refund_processed
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_refund_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status::TEXT NOT IN ('processed', 'completed') THEN RETURN NEW; END IF;

  SELECT pp.user_id INTO v_user_id
  FROM public.payments p
  JOIN public.patient_profiles pp ON pp.id = p.patient_id
  WHERE p.id = NEW.payment_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
  VALUES (
    v_user_id, 'patient'::public.user_role,
    'refund_processed'::public.audit_action, 'refund', NEW.id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status, 'amount', NEW.amount)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_refund_status failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_refund_status ON public.refunds;
CREATE TRIGGER audit_refund_status
AFTER UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_refund_status();


-- ================================================================
-- 10. prescriptions INSERT → prescription_created
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_prescription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor_user_id UUID;
BEGIN
  SELECT user_id INTO v_doctor_user_id FROM public.doctors WHERE id = NEW.doctor_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
  VALUES (
    v_doctor_user_id, 'doctor'::public.user_role,
    'prescription_created'::public.audit_action, 'prescription', NEW.id,
    jsonb_build_object('appointment_id', NEW.appointment_id, 'patient_id', NEW.patient_id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_prescription failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_prescription ON public.prescriptions;
CREATE TRIGGER audit_prescription
AFTER INSERT ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_prescription();


-- ================================================================
-- 11. lab_results INSERT → lab_result_uploaded
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_lab_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.uploaded_by;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
  VALUES (
    NEW.uploaded_by, v_role,
    'lab_result_uploaded'::public.audit_action, 'lab_result', NEW.id,
    jsonb_build_object(
      'test_name', NEW.test_name,
      'patient_id', NEW.patient_id,
      'facility_id', NEW.facility_id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_lab_result failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_lab_result ON public.lab_results;
CREATE TRIGGER audit_lab_result
AFTER INSERT ON public.lab_results
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_lab_result();


-- ================================================================
-- 12. data_export_requests INSERT → data_export_requested
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_data_export()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (
    NEW.user_id, v_role,
    'data_export_requested'::public.audit_action, 'data_export', NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_data_export failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_data_export ON public.data_export_requests;
CREATE TRIGGER audit_data_export
AFTER INSERT ON public.data_export_requests
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_data_export();


-- ================================================================
-- 13. facilities UPDATE → facility_approved / facility_suspended
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_facility_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action public.audit_action;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_action := CASE NEW.status
    WHEN 'active'     THEN 'facility_approved'::public.audit_action
    WHEN 'suspended'  THEN 'facility_suspended'::public.audit_action
    ELSE NULL
  END;

  IF v_action IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, before, after)
  VALUES (
    auth.uid(), 'super_admin'::public.user_role,
    v_action, 'facility', NEW.id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_facility_status failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_facility_status ON public.facilities;
CREATE TRIGGER audit_facility_status
AFTER UPDATE ON public.facilities
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_facility_status();


-- ================================================================
-- 14. moderation_requests INSERT → review_flagged
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_moderation_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.flagged_by;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id, after)
  VALUES (
    NEW.flagged_by, v_role,
    'review_flagged'::public.audit_action, 'review', NEW.review_id,
    jsonb_build_object('reason', NEW.reason)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_moderation_request failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_moderation_request ON public.moderation_requests;
CREATE TRIGGER audit_moderation_request
AFTER INSERT ON public.moderation_requests
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_moderation_request();


-- ================================================================
-- 15. reviews UPDATE → review_removed / review_restored
--     (replaces previous hams_audit_review_moderation)
-- ================================================================
CREATE OR REPLACE FUNCTION public.hams_audit_review_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_visible IS NOT DISTINCT FROM NEW.is_visible THEN RETURN NEW; END IF;

  INSERT INTO public.audit_logs (actor_user_id, actor_role, action, resource_type, resource_id)
  VALUES (
    auth.uid(), 'facility_admin'::public.user_role,
    CASE WHEN NEW.is_visible
      THEN 'review_restored'::public.audit_action
      ELSE 'review_removed'::public.audit_action
    END,
    'review', NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[AuditTrigger] audit_review_moderation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_review_moderation ON public.reviews;
CREATE TRIGGER audit_review_moderation
AFTER UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.hams_audit_review_moderation();


CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  IF v_role NOT IN ('patient') THEN
    v_role := 'patient'; -- 🔒 enforce patient only
  END IF;

  -- 🔥 FORCE BYPASS RLS
  PERFORM set_config('role', 'service_role', true);

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  -- 🔒 Enforce patient-only for Google users
  IF v_role NOT IN ('patient') THEN
    v_role := 'patient';
  END IF;

  -- ✅ Insert profile
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ✅ Insert patient profile
  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  -- 🔒 Force patient only
  IF v_role NOT IN ('patient') THEN
    v_role := 'patient';
  END IF;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    phone,
    email,
    phone_verified,
    two_factor_enabled,
    language,
    theme_preference,
    notification_prefs,
    consent_flags,
    push_tokens,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_role,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    false,                 -- phone_verified
    false,                 -- two_factor_enabled
    'en',                  -- language
    'light',               -- theme_preference
    '{}'::jsonb,           -- notification_prefs
    '{}'::jsonb,           -- consent_flags
    ARRAY[]::text[],       -- push_tokens
    'active',              -- status
    NOW(),                 -- created_at
    NOW()                  -- updated_at
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_summary(
  p_facility_id UUID,
  p_period TEXT DEFAULT 'month'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_result JSON;
BEGIN
  -- ✅ Period logic
  v_since := CASE p_period
    WHEN 'week' THEN NOW() - INTERVAL '7 days'
    WHEN 'year' THEN NOW() - INTERVAL '365 days'
    ELSE NOW() - INTERVAL '30 days'
  END;

  SELECT json_build_object(

    -- 🔹 1. Busiest Hours (FIXED)
    'busiest_hours', (
      SELECT COALESCE(json_agg(t ORDER BY t.hour), '[]'::json)
      FROM (
        SELECT
          EXTRACT(HOUR FROM slot_start)::INT AS hour,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND created_at >= v_since
        GROUP BY hour
        ORDER BY hour
      ) t
    ),

    -- 🔹 2. Monthly Trend (FIXED consistency)
    'monthly_trend', (
      SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', slot_date), 'YYYY-MM') AS month,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND slot_date >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY month
        ORDER BY month
      ) t
    ),

    -- 🔹 3. Top Doctors (FIXED status filter)
    'top_doctors', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          d.full_name AS name,
          COUNT(a.id)::INT AS total
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.status IN ('confirmed', 'completed', 'no_show')
          AND a.created_at >= v_since
        GROUP BY d.full_name
        ORDER BY total DESC
        LIMIT 5
      ) t
    ),

    -- 🔹 4. No-show Rate (FIXED denominator)
    'no_show_rate', (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE status = 'no_show')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')), 0)
          * 100,
          1
        )
      END
      FROM appointments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND created_at >= v_since
    ),

    -- 🔹 5. Demographics (KEEPING your schema)
    'demographics', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(pp.gender::TEXT, 'unknown') AS gender,
          COUNT(DISTINCT a.patient_id)::INT AS total
        FROM appointments a
        JOIN patient_profiles pp ON pp.id = a.patient_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.created_at >= v_since
        GROUP BY gender
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ✅ Permission
GRANT EXECUTE ON FUNCTION public.analytics_summary(UUID, TEXT)
TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.analytics_summary(
  p_facility_id UUID,
  p_period TEXT DEFAULT 'month'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_result JSON;
BEGIN
  -- ✅ Period logic
  v_since := CASE p_period
    WHEN 'week' THEN NOW() - INTERVAL '7 days'
    WHEN 'year' THEN NOW() - INTERVAL '365 days'
    ELSE NOW() - INTERVAL '30 days'
  END;

  SELECT json_build_object(

    -- 🔹 1. Busiest Hours (FIXED)
    'busiest_hours', (
      SELECT COALESCE(json_agg(t ORDER BY t.hour), '[]'::json)
      FROM (
        SELECT
          EXTRACT(HOUR FROM slot_start)::INT AS hour,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND created_at >= v_since
        GROUP BY hour
        ORDER BY hour
      ) t
    ),

    -- 🔹 2. Monthly Trend (FIXED consistency)
    'monthly_trend', (
      SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', slot_date), 'YYYY-MM') AS month,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND slot_date >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY month
        ORDER BY month
      ) t
    ),

    -- 🔹 3. Top Doctors (FIXED status filter)
    'top_doctors', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          d.full_name AS name,
          COUNT(a.id)::INT AS total
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.status IN ('confirmed', 'completed', 'no_show')
          AND a.created_at >= v_since
        GROUP BY d.full_name
        ORDER BY total DESC
        LIMIT 5
      ) t
    ),

    -- 🔹 4. No-show Rate (FIXED denominator)
    'no_show_rate', (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE status = 'no_show')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')), 0)
          * 100,
          1
        )
      END
      FROM appointments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND created_at >= v_since
    ),

    -- 🔹 5. Demographics (KEEPING your schema)
    'demographics', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(pp.gender::TEXT, 'unknown') AS gender,
          COUNT(DISTINCT a.patient_id)::INT AS total
        FROM appointments a
        JOIN patient_profiles pp ON pp.id = a.patient_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.created_at >= v_since
        GROUP BY gender
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ✅ Permission
GRANT EXECUTE ON FUNCTION public.analytics_summary(UUID, TEXT)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_metrics(
  p_facility_id UUID,
  p_doctor_id   UUID DEFAULT NULL,
  p_period      TEXT DEFAULT 'month'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  TIMESTAMPTZ;
  v_result JSON;
BEGIN
  v_since := CASE p_period
    WHEN 'week'  THEN NOW() - INTERVAL '7 days'
    WHEN 'year'  THEN NOW() - INTERVAL '365 days'
    ELSE              NOW() - INTERVAL '30 days'
  END;

  SELECT json_build_object(

    'doctors', (
      SELECT COALESCE(json_agg(t ORDER BY t.total_completed DESC), '[]'::json)
      FROM (
        SELECT
          d.id        AS doctor_id,
          d.full_name AS doctor_name,

          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::INT
            AS total_completed,

          COALESCE(
            ROUND(
              EXTRACT(EPOCH FROM AVG(
                CASE
                  WHEN a.type = 'online'
                    AND a.call_started_at IS NOT NULL
                    AND a.call_ended_at   IS NOT NULL
                  THEN a.call_ended_at - a.call_started_at
                END
              )) / 60,
            1),
          0) AS avg_duration_minutes,

          CASE
            WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('completed','no_show')) = 0 THEN 0
            ELSE ROUND(
              COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'no_show')::NUMERIC
              / NULLIF(COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('completed','no_show')), 0)
              * 100, 1
            )
          END AS no_show_rate,

          COALESCE((
            SELECT SUM(p2.amount)
            FROM   payments p2
            JOIN   appointments a2 ON a2.id = p2.appointment_id
            WHERE  a2.doctor_id = d.id
              AND  p2.status = 'paid'
              AND  (p_facility_id IS NULL OR a2.facility_id = p_facility_id)
              AND  a2.created_at >= v_since
          ), 0) AS revenue,

          ROUND(AVG(r.rating)::NUMERIC, 2) AS avg_rating

        FROM doctors d
        LEFT JOIN appointments a
          ON  a.doctor_id = d.id
          AND (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.created_at >= v_since
        LEFT JOIN reviews r
          ON  r.target_id   = d.id
          AND r.target_type = 'doctor'
          AND r.is_visible  = TRUE
        WHERE (p_facility_id IS NULL OR d.facility_id = p_facility_id)
          AND (p_doctor_id   IS NULL OR d.id = p_doctor_id)
          AND d.is_active = TRUE
        GROUP BY d.id, d.full_name
      ) t
    ),

    'rating_trend', (
      SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM') AS month,
          ROUND(AVG(r.rating)::NUMERIC, 2) AS rating
        FROM reviews r
        JOIN doctors d ON d.id = r.target_id
        WHERE r.target_type = 'doctor'
          AND r.is_visible  = TRUE
          AND (p_facility_id IS NULL OR d.facility_id = p_facility_id)
          AND (p_doctor_id   IS NULL OR d.id = p_doctor_id)
          AND r.created_at  >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY month
        ORDER BY month
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_metrics(UUID, UUID, TEXT)
  TO authenticated, service_role;

