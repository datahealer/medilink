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