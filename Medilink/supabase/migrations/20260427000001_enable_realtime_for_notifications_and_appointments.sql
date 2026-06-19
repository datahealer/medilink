-- Enable Supabase Realtime for in_app_notifications and appointments.
-- Required for:
--   - DashboardLayout bell badge to auto-increment on new notifications
--   - Centre.tsx to receive live inserts
--   - AppointmentNotes.tsx to detect when AI summary is written

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
