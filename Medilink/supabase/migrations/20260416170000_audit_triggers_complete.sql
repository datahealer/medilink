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
