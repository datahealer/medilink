-- Facility Messages (Design Doc p32): per-patient read tracking for facility announcements.
--
-- The patient "Facility Messages" inbox is a read-only feed of administrative updates from
-- clinics. Its content source is the existing public.announcements table (facility broadcasts).
-- This migration adds ONLY a per-patient read-marker table so the inbox can show unread state.
-- It is fully additive: no changes to announcements, in_app_notifications, or any shared table,
-- so the HAMS/provider apps are unaffected.

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  announcement_id UUID        NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, announcement_id)
);

CREATE INDEX IF NOT EXISTS ix_announcement_reads_patient ON public.announcement_reads (patient_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Patients read/insert only their own read-markers (scoped by patient_profiles.id, matching the
-- payments/reviews/lab_results patient-read convention).
CREATE POLICY "announcement_reads_patient_select" ON public.announcement_reads FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

CREATE POLICY "announcement_reads_patient_insert" ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

CREATE POLICY "announcement_reads_service" ON public.announcement_reads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
