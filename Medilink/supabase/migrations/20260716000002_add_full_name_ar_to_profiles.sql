-- Feature F1 (Batch 2, extension) — Arabic PATIENT name
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Feature 1 §1a (same architecture
-- as doctors/facilities, applied to the account profile).
--
-- Additive & reversible. Adds an OPTIONAL Arabic name + verification-status flag to
-- `profiles` (the account identity; `profiles.full_name` is the English name). The
-- app shows the Arabic value ONLY when status is 'verified' or 'admin_entered' (else
-- English fallback); 'machine_unverified' and NULL never display. The app NEVER
-- machine-translates — it only reads verified values (HAMS-owned authoring/review).
--
-- `profiles` is the shared HAMS account table (all roles); this column is additive
-- and defaults NULL for every existing row → no behavioral change. RLS inherits the
-- existing profiles policies; no policy change required.
--
-- After applying: run `npm run db:types`, then remove the temporary overlay in
-- shared/src/types/index.ts.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_ar text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_ar_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_full_name_ar_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_full_name_ar_status_check
      CHECK (full_name_ar_status IS NULL
             OR full_name_ar_status IN ('machine_unverified', 'admin_entered', 'verified'));
  END IF;
END $$;
