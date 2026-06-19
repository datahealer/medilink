-- Enable Supabase Realtime for doctor_availability so slot changes broadcast instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_availability;
