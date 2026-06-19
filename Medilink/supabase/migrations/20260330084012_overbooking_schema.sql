ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS uq_appointment_slot;

CREATE UNIQUE INDEX uq_appointment_slot
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in')
AND is_emergency = FALSE;

CREATE INDEX IF NOT EXISTS ix_appointments_slot_lookup
ON public.appointments (doctor_id, slot_date, slot_start)
WHERE status IN ('pending','confirmed','checked_in');