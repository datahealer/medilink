-- Feature F1 (Batch 2) — Arabic doctor & clinic names (Option A: per-table columns)
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Feature 1 §6 (Option A) + §1a.
--
-- Additive & reversible. Adds an OPTIONAL Arabic name + a verification-status flag
-- to `doctors` and `facilities`. The app displays the Arabic value ONLY when the
-- status is 'verified' or 'admin_entered' (otherwise it falls back to the English
-- name); 'machine_unverified' drafts and NULLs never display to patients (§1a).
--
-- HAMS owns Arabic-name capture at onboarding, the optional transliteration draft,
-- and the review queue that promotes values to 'verified'. The MediLink app NEVER
-- generates or machine-translates names — it only reads HAMS-provided verified
-- Arabic. This migration adds the storage + a status flag; no workflow logic here.
--
-- Existing rows are unaffected (all NULL on add). RLS inherits the existing
-- doctors/facilities read policies; new columns are covered by them — no policy
-- change required.
--
-- After applying against the linked project:
--   1. run `npm run db:types` to regenerate shared/src/types/supabase.ts, then
--   2. delete the temporary Arabic-name overlay in shared/src/types/index.ts.

ALTER TABLE public.doctors    ADD COLUMN IF NOT EXISTS full_name_ar text;
ALTER TABLE public.doctors    ADD COLUMN IF NOT EXISTS full_name_ar_status text;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS name_ar text;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS name_ar_status text;

-- Verification-status guard (NULL allowed). Guarded adds so re-applying is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctors_full_name_ar_status_check'
      AND conrelid = 'public.doctors'::regclass
  ) THEN
    ALTER TABLE public.doctors
      ADD CONSTRAINT doctors_full_name_ar_status_check
      CHECK (full_name_ar_status IS NULL
             OR full_name_ar_status IN ('machine_unverified', 'admin_entered', 'verified'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facilities_name_ar_status_check'
      AND conrelid = 'public.facilities'::regclass
  ) THEN
    ALTER TABLE public.facilities
      ADD CONSTRAINT facilities_name_ar_status_check
      CHECK (name_ar_status IS NULL
             OR name_ar_status IN ('machine_unverified', 'admin_entered', 'verified'));
  END IF;
END $$;
