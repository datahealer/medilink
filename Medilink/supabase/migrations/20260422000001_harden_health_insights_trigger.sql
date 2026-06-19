-- Replace current_setting-based trigger with a hardcoded URL.
-- Matches the pattern used by notify_moderation_request (which works).
-- generate-health-insights was deployed with --no-verify-jwt so no auth header needed.

CREATE OR REPLACE FUNCTION public.trigger_generate_health_insights()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://zojrwuvxrkmgnlwyuypg.supabase.co/functions/v1/generate-health-insights',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'appointment_note_id', NEW.id,
      'appointment_id',      NEW.appointment_id
    )
  );
  RETURN NEW;
END;
$$;

-- Re-create the trigger (idempotent)
DROP TRIGGER IF EXISTS on_appointment_note_inserted ON public.appointment_notes;
CREATE TRIGGER on_appointment_note_inserted
  AFTER INSERT ON public.appointment_notes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_generate_health_insights();
