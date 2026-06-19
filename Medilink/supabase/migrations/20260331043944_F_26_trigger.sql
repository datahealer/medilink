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