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