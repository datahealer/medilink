-- Trigger: after a doctor inserts an appointment note, call the
-- generate-health-insights edge function to produce a patient summary.

CREATE OR REPLACE FUNCTION public.trigger_generate_health_insights()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/generate-health-insights',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object(
      'appointment_note_id', NEW.id,
      'appointment_id',      NEW.appointment_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_appointment_note_inserted
  AFTER INSERT ON public.appointment_notes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_generate_health_insights();
