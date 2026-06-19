-- Allow walk-in appointment type
ALTER TYPE public.appointment_type ADD VALUE IF NOT EXISTS 'walk_in';

-- Walk-in appointments have no registered patient — make patient_id nullable
ALTER TABLE public.appointments ALTER COLUMN patient_id DROP NOT NULL;

-- Store anonymous patient info directly on walk-in appointment rows
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_phone TEXT;
