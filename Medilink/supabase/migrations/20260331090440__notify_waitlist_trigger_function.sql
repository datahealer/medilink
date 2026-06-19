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