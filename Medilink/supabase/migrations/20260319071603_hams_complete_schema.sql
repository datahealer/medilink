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