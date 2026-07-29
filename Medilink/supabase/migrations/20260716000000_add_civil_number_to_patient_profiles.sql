-- Feature F2 — Civil Number (patient national ID)
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Feature 2 (§6 Migration 1).
--
-- Additive & reversible. Adds an OPTIONAL Oman civil number (8 digits) to
-- patient_profiles. Nullable; a digit-format CHECK guards new/updated values.
-- NO uniqueness in v1 (deferred hardening — a partial unique index may be added
-- later, once existing/HAMS data is verified clean, per the plan §6 Migration 2).
-- Existing rows are unaffected (all NULL on add). RLS is inherited from
-- patient_profiles (patient self-update); no policy change required.
--
-- After applying against the linked project:
--   1. run `npm run db:types` to regenerate shared/src/types/supabase.ts, then
--   2. delete the temporary `civil_number` overlay in shared/src/types/index.ts.

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS civil_number text;

-- Digit-format guard (8 digits) — NULL allowed (field is optional). Guarded add so
-- re-applying the migration is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_profiles_civil_number_format'
      AND conrelid = 'public.patient_profiles'::regclass
  ) THEN
    ALTER TABLE public.patient_profiles
      ADD CONSTRAINT patient_profiles_civil_number_format
      CHECK (civil_number IS NULL OR civil_number ~ '^[0-9]{8}$');
  END IF;
END $$;
