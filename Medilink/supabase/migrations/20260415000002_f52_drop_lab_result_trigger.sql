-- F-52 fix: drop the net.http_post trigger (requires DB URL setting not available locally).
-- Notifications are now inserted directly from the Next.js API route using service role.

DROP TRIGGER IF EXISTS on_lab_result_inserted ON public.lab_results;
DROP FUNCTION IF EXISTS public.trigger_notify_lab_result();
