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
