-- Specialty catalog (Design Doc p18): curated, iconographic specialty grid + filter chips.
--
-- The app needs a stable, ordered catalog with display names + icons for the Specialty Categories
-- grid, the Dashboard "Top Specialties" chips, and the Filters specialty chips. No such catalog
-- existed — only freetext `doctors.specialty TEXT` (largely uncurated), which cannot back a curated
-- UI. This migration adds a small reference table and seeds it with the design's canonical set.
--
-- `icon` stores the app's icon key (resolved by mobile `resolveIconName` in Icon.tsx), so the grid
-- renders identically to the approved design. Fully additive: no existing table is touched.
--
-- NOTE (known gap, unchanged by this migration): tapping a tile passes the specialty NAME to doctor
-- search (`doctors.specialty = name`). Because `doctors.specialty` is uncurated freetext, name-based
-- filtering is imperfect today. The clean fix (a `doctors.specialty_id` FK + backfill) is documented
-- in docs/backend-specs/specialty-categories-backend-spec.md as follow-up. This migration only makes
-- the catalog real; it neither improves nor regresses search relative to the previous mock catalog.

CREATE TABLE IF NOT EXISTS public.specialties (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT    NOT NULL UNIQUE,             -- stable key, e.g. 'cardiology' (mobile Specialty.id)
  name       TEXT    NOT NULL,                    -- display name, e.g. 'Cardiology'
  icon       TEXT,                                -- app icon key (see resolveIconName)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_specialties_active ON public.specialties (is_active, sort_order);

ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;

-- Public catalog: readable by everyone. Writes are seeded via migration and (later) an admin surface;
-- no public write policy is granted, so only the service role can mutate rows for now.
CREATE POLICY "specialties_public_read" ON public.specialties FOR SELECT USING (true);
CREATE POLICY "specialties_service" ON public.specialties FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.specialties TO anon, authenticated;
GRANT ALL ON public.specialties TO service_role;

-- Seed the design's canonical categories (Design Doc p18). Idempotent on slug so re-running is safe.
INSERT INTO public.specialties (slug, name, icon, sort_order) VALUES
  ('general',     'General',     'medkit-outline',   0),
  ('pathology',   'Pathology',   'flask-outline',    1),
  ('radiology',   'Radiology',   'scan-outline',     2),
  ('cardiology',  'Cardiology',  'heart-outline',    3),
  ('dermatology', 'Dermatology', 'sparkles-outline', 4),
  ('pediatrics',  'Pediatrics',  'people-outline',   5),
  ('physio',      'Physio',      'fitness-outline',  6),
  ('skincare',    'Skincare',    'rose-outline',     7),
  ('dentist',     'Dentist',     'happy-outline',    8)
ON CONFLICT (slug) DO NOTHING;
