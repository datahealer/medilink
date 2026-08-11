-- Phase 5.2 — notify the patient when their queue state changes
--
-- WHAT EXISTS ALREADY (audited before writing anything)
--   MediLink owns a complete push stack and HAMS must not duplicate it:
--     mobile/src/services/push.ts        registers Expo tokens into device_tokens
--     mobile/src/hooks/usePushNotifications.ts
--     backend/src/lib/notifications/sendPush.ts   Expo batching, invalid-token
--                                        cleanup, profiles.notification_prefs opt-in
--     backend/src/app/api/notifications/push/route.ts
--   That dispatcher is invoked from APPLICATION code (e.g. notifyPaymentSuccess),
--   never from a database trigger.
--
--   HAMS meanwhile has `device_tokens` in the schema and ZERO references to it
--   in src/ — it has never sent a push. A patient whose MediLink app is
--   backgrounded currently learns nothing when they are called.
--
-- WHAT THIS MIGRATION DOES — AND DELIBERATELY DOES NOT DO
--   DOES: write an in_app_notifications row, inside the same transaction as the
--   queue transition, whenever a patient's queue state meaningfully changes.
--   That row is the reliable source of truth: MediLink already reads
--   in_app_notifications, already subscribes to it over realtime
--   (20260427000001), and already renders it bilingually.
--
--   DOES NOT: send a push itself. Building a second Expo sender in HAMS is
--   exactly the duplication to avoid, and the transport needs credentials and a
--   MediLink backend URL that are not available here. See "PUSH TRANSPORT"
--   below — that half is reported BLOCKED, not faked.
--
-- WHY A TRIGGER RATHER THAN API CODE
--   Queue transitions happen through four different paths today
--   (queue-items/[id]/call, and the new queue_skip / queue_recall /
--   queue_no_show RPCs). A trigger guarantees one notification rule for all of
--   them, including any future path, and cannot be forgotten at a call site.
--
-- SAFETY — a notification must never break a clinic operation
--   The function body is wrapped in EXCEPTION WHEN OTHERS -> RAISE WARNING,
--   RETURN NEW. If anything at all goes wrong (missing patient, constraint,
--   permissions) the queue transition still commits. This mirrors the existing
--   hams_audit_* triggers, which use the same guard for the same reason.
--
-- BILINGUAL
--   Writes title_ar / body_ar alongside title / body. Those columns exist live,
--   added by MediLink's own migration 20260729000000_notification_bilingual_
--   content.sql — which is NOT in the HAMS migration history (see the drift
--   note in the Phase 5 report). The INSERT is written so that it still works
--   if the columns are absent, by checking the catalog first.
--
--   The Arabic strings here are fixed UI phrases — "You have been called",
--   "Please proceed to the doctor" — not translations of any clinical content
--   or personal name. No name, doctor, diagnosis or free text is translated.
--
-- WHICH EVENTS
--   called    -> "You have been called" (the one that actually matters)
--   skipped   -> "We missed you" — tells the patient to return to reception
--                rather than silently losing their place
--   recalled  -> waiting again after skipped
--   no_show / done are NOT notified: done is visible in the app already, and a
--   no_show push would arrive after the fact and only cause confusion.
--
-- MEDILINK COMPATIBILITY
--   Additive only. No table, column, enum, RPC or policy is changed. It inserts
--   into a table MediLink already reads with a shape MediLink already renders.
--   `data` carries appointment_id and queue_item_id so the app can deep-link,
--   matching the convention used by the existing notification writers.
--
-- ROLLBACK
--   DROP TRIGGER queue_items_notify_patient ON public.queue_items;
--   DROP FUNCTION public.hams_notify_queue_event();
--   Nothing else is touched; existing notification rows are unaffected.

CREATE OR REPLACE FUNCTION public.hams_notify_queue_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   UUID;
  v_title     TEXT;
  v_body      TEXT;
  v_title_ar  TEXT;
  v_body_ar   TEXT;
  v_has_ar    BOOLEAN;
BEGIN
  -- Only meaningful transitions.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Resolve the MediLink account behind this queue entry. Walk-ins have no
  -- patient_id and therefore no app to notify — skip silently.
  SELECT pp.user_id
  INTO v_user_id
  FROM appointments a
  JOIN patient_profiles pp ON pp.id = a.patient_id
  WHERE a.id = NEW.appointment_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'called' THEN
    v_title    := 'It''s your turn';
    v_body     := 'You have been called. Please proceed to the doctor.';
    v_title_ar := 'حان دورك';
    v_body_ar  := 'تم استدعاؤك. يرجى التوجه إلى الطبيب.';

  ELSIF NEW.status = 'skipped' THEN
    v_title    := 'We missed you';
    v_body     := 'You were called but not found. Please see the reception desk.';
    v_title_ar := 'لم نتمكن من الوصول إليك';
    v_body_ar  := 'تم استدعاؤك ولم نجدك. يرجى مراجعة مكتب الاستقبال.';

  ELSIF NEW.status = 'waiting' AND OLD.status = 'skipped' THEN
    v_title    := 'You are back in the queue';
    v_body     := 'Reception has returned you to the queue. Please wait to be called.';
    v_title_ar := 'تمت إعادتك إلى قائمة الانتظار';
    v_body_ar  := 'أعادك مكتب الاستقبال إلى قائمة الانتظار. يرجى انتظار استدعائك.';

  ELSE
    -- done / no_show / expired and any future state: no notification.
    RETURN NEW;
  END IF;

  -- title_ar/body_ar arrived via a MediLink-side migration that is not in this
  -- repo's history, so do not assume they exist.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'in_app_notifications'
      AND column_name  = 'title_ar'
  ) INTO v_has_ar;

  IF v_has_ar THEN
    INSERT INTO public.in_app_notifications (user_id, type, title, body, title_ar, body_ar, data)
    VALUES (
      v_user_id, 'info', v_title, v_body, v_title_ar, v_body_ar,
      jsonb_build_object(
        'appointment_id', NEW.appointment_id,
        'queue_item_id',  NEW.id,
        'queue_status',   NEW.status,
        'kind',           'queue_update'
      )
    );
  ELSE
    INSERT INTO public.in_app_notifications (user_id, type, title, body, data)
    VALUES (
      v_user_id, 'info', v_title, v_body,
      jsonb_build_object(
        'appointment_id', NEW.appointment_id,
        'queue_item_id',  NEW.id,
        'queue_status',   NEW.status,
        'kind',           'queue_update'
      )
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- A notification must NEVER block a clinic operation. Same guard the
  -- hams_audit_* triggers use.
  RAISE WARNING '[hams_notify_queue_event] queue_item % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_items_notify_patient ON public.queue_items;
CREATE TRIGGER queue_items_notify_patient
AFTER UPDATE ON public.queue_items
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.hams_notify_queue_event();

COMMENT ON FUNCTION public.hams_notify_queue_event() IS
  'Writes an in_app_notifications row when a patient''s queue state changes '
  '(called / skipped / recalled). Source of truth for the MediLink queue '
  'notification; push transport is separate and is dispatched by MediLink''s '
  'existing sendPushToUser. Exception-guarded so it can never fail a queue '
  'transition.';
