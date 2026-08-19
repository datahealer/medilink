-- =============================================================================
-- Make the `reports` storage bucket PRIVATE
-- =============================================================================
-- ⚠️ NOT APPLIED. Prepared for review. Touches storage shared by MediLink and HAMS.
--
-- ── THE DEFECT ──
--
-- `storage.buckets` has `public = true` for `reports`, and the bucket holds patient medical
-- records. Measured read-only against production on 2026-08-19:
--
--     objects in `reports`                                    15
--       of which `patients/<uuid>/medical-history.pdf`          5
--       facility patient rosters (`patients-<m>-<y>.pdf`)       3
--       revenue reports (`revenue-<m>-<y>.pdf`)                 2
--       monthly summaries (`<m>-<y>.pdf`)                       5
--
-- A public bucket is served with NO authorization at all. Verified by probing the anonymous
-- endpoint: a private bucket answers `NoSuchBucket`, whereas `reports` answers `NoSuchKey` —
-- i.e. it resolved the bucket and only the key was missing. A real object in another public
-- bucket returned HTTP 200 and its full body to an unauthenticated request. (No object from
-- `reports` was fetched during the audit; the path shape and the bucket flag are sufficient.)
--
-- The medical-history path is fully deterministic — `patients/<patient_id>/medical-history.pdf`,
-- built at generate-patient-report/index.ts:217 — with no timestamp and no random component. So
-- possession of a patient_id was possession of that patient's medical history. patient_ids are
-- not secret: `appointments` currently carries a permissive `USING (true)` SELECT policy for
-- `authenticated`, so any signed-in user can enumerate every `patient_id` in the system. The two
-- defects chained into bulk PHI disclosure.
--
-- ── WHY NO POLICIES ARE CREATED HERE ──
--
-- Flipping `public` to false is the whole fix. Signed URLs are validated by their signature at
-- the storage API, NOT by RLS, so `createSignedUrl()` — which the four report functions now use
-- instead of `getPublicUrl()` — keeps working against a private bucket with zero policies. And
-- zero policies is the correct end state: nothing but the service role should ever read a
-- generated report directly. Adding a permissive `authenticated` SELECT policy would recreate a
-- weaker version of the same hole.
--
-- Contrast with `patient-docs` / `lab-results` / `invoices`, which DO carry owner-scoped policies
-- because patients browse those buckets from the app. Reports are never browsed; they are
-- generated on demand behind an authorizing route and handed over as a 300-second link.
--
-- ── ORDER OF OPERATIONS (matters) ──
--
--   1. Deploy the four Edge Functions FIRST. Until they use createSignedUrl(), flipping this
--      flag makes every freshly generated report URL return NoSuchBucket.
--   2. Then apply this migration.
--   3. Then re-run the read-only verification at the bottom.
--
-- Doing it in the other order breaks report generation for both apps; doing only step 1 leaves
-- the bucket public. Both steps are required.
--
-- ── ALREADY-EXPOSED OBJECTS ──
--
-- The 15 existing objects were world-readable for as long as the bucket has been public. This
-- migration does not delete them — that is production data and a separate, explicit decision.
-- Treat the 5 medical-history PDFs as disclosed: regenerate them (they are rebuilt on demand
-- anyway) and consider whether the incident is notifiable. Deliberately not automated here.
--
-- ── ROLLBACK ──
--
--   UPDATE storage.buckets SET public = true WHERE id = 'reports';
--
-- Rolling back re-opens the disclosure. Prefer fixing forward.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_exists boolean;
  v_public boolean;
BEGIN
  SELECT true, public INTO v_exists, v_public
    FROM storage.buckets WHERE id = 'reports';

  IF v_exists IS NULL THEN
    RAISE EXCEPTION 'reports bucket not found — refusing to continue';
  END IF;

  IF v_public IS FALSE THEN
    RAISE NOTICE 'reports bucket is already private; nothing to do';
  ELSE
    UPDATE storage.buckets SET public = false WHERE id = 'reports';
    RAISE NOTICE 'reports bucket set to private';
  END IF;
END $$;

-- Bound the object size while we are here: every bucket except user-exports currently has no
-- limit at all, which makes an authenticated uploader an unbounded storage cost. 25 MB is far
-- above any generated PDF observed (the largest is under 3 KB).
UPDATE storage.buckets
   SET file_size_limit = 26214400
 WHERE id = 'reports' AND file_size_limit IS NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION AFTER APPLYING (read-only)
-- =============================================================================
--   -- must be exactly one row, public = false:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'reports';
--
--   -- must be 0 — no policy should grant direct read on this bucket:
--   SELECT count(*) FROM pg_policy p
--     JOIN pg_class c ON c.oid = p.polrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'storage' AND c.relname = 'objects'
--      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%reports%';
--
--   -- and from a shell, the anonymous endpoint must now answer NoSuchBucket, not NoSuchKey:
--   --   curl -s "$SUPABASE_URL/storage/v1/object/public/reports/__probe__.pdf"
-- =============================================================================
