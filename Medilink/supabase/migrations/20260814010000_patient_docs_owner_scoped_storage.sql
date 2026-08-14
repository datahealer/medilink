-- =============================================================================
-- patient-docs: scope storage access to the owning patient
-- =============================================================================
-- FIXES A LIVE CROSS-PATIENT PHI EXPOSURE.
--
-- The three policies created by 20260324045518 use `bucket_id = 'patient-docs'` as their
-- ENTIRE predicate, granted `TO authenticated`:
--
--     INSERT  "Allow authenticated upload"   USING/WITH CHECK (bucket_id = 'patient-docs')
--     SELECT  "Allow authenticated read"     USING            (bucket_id = 'patient-docs')
--     DELETE  "Allow delete own files"       USING            (bucket_id = 'patient-docs')
--
-- There is no owner predicate on any of them, so ANY authenticated patient can list the
-- bucket, read a signed URL for ANY object, and DELETE any other patient's files. The
-- DELETE policy's name asserts a restriction it does not implement.
--
-- This is the only bucket in the project without an ownership predicate. `user-exports`
-- (20260422100000) already scopes with `name LIKE 'exports/' || auth.uid()::text || '/%'`,
-- `lab-results` (20260415000001) joins through the patient row, and
-- `facility-profile-photo` (20260427000002) checks facility-admin membership.
--
-- The TABLE `patient_documents` was always correctly protected (policy
-- `patient_documents_own` plus an explicit `.eq("patient_id", …)` in shared/src/api/
-- records.ts). Only the storage objects were exposed — which is why table-focused audits
-- did not catch it. Invoices are affected too: 20260721000001 files paid invoice PDFs into
-- this same bucket, so they carry the same exposure and the same fix.
--
-- ── WHY THE PREDICATE HAS TWO BRANCHES ──
--
-- Measured against production before writing this (read-only), the bucket holds 20 objects
-- in two naming conventions:
--
--   17 objects  `{auth.uid}/{timestamp}-{random}.{ext}`   — the current convention, written
--               by mobile (data/real/index.ts), web (dashboard/profile/page.tsx) and the
--               invoice filer, all of which prefix with the uploader's auth uid.
--               For all 17, storage.objects.owner already equals that prefix.
--
--    3 objects  `docs/…`                                  — legacy, created 2026-03-24, the
--               same day as the original policy migration. They are NOT orphans: 3 live
--               `patient_documents` rows still reference them, and for all 3 the object's
--               `owner` equals the referencing patient's `patient_profiles.user_id`.
--
-- A path-prefix-only rule would therefore have silently orphaned three real patients'
-- documents — visible in the vault list (the table row survives) but failing to open. So
-- SELECT/DELETE accept EITHER proof of ownership:
--
--     owner = auth.uid()                              -- authoritative, set by Storage
--  OR (storage.foldername(name))[1] = auth.uid()::text -- the path convention
--
-- Neither branch can ever reach another patient's object, so the OR does not weaken the
-- boundary; it only avoids breaking the legacy layout.
--
-- INSERT is deliberately PATH-ONLY. `owner` is assigned by Storage during the insert, so a
-- WITH CHECK on it is circular; the meaningful control at write time is refusing to write
-- into somebody else's folder. This also means the web uploader's `?? "anon"` fallback
-- (dashboard/profile/page.tsx) can no longer produce an `anon/…` object — it will be
-- refused, which is the correct outcome for a session whose user cannot be read.
--
-- No UPDATE policy is created. None exists today, so object overwrites are already denied,
-- and both uploaders pass `upsert: false`. Adding one would widen access for no caller.
--
-- ── SCOPE ──
--
-- Touches ONLY the three patient-docs policies. No table RLS, no other bucket, no grants,
-- no schema change, no data change. service_role is unaffected (it bypasses RLS), so the
-- backend's invoice filing and the GDPR purge keep working.
-- =============================================================================

-- Idempotent: DROP IF EXISTS then CREATE, so re-applying cannot fail or duplicate.
-- The old names are dropped by name because they are what 20260324045518 created.
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read"   ON storage.objects;
DROP POLICY IF EXISTS "Allow delete own files"     ON storage.objects;

-- Also drop this migration's own names, so a re-run is clean.
DROP POLICY IF EXISTS "patient_docs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "patient_docs_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "patient_docs_owner_delete" ON storage.objects;

-- ── INSERT — you may only write inside your own folder ──────────────────────────
CREATE POLICY "patient_docs_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'patient-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ── SELECT — you may only read/list your own objects ────────────────────────────
-- Covers `list()` and `createSignedUrl()`, both of which are SELECTs on storage.objects.
CREATE POLICY "patient_docs_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- ── DELETE — you may only delete your own objects ───────────────────────────────
CREATE POLICY "patient_docs_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

COMMENT ON POLICY "patient_docs_owner_select" ON storage.objects IS
  'Patient may read only their own patient-docs objects. Two ownership proofs are accepted '
  'because the bucket holds both the current {auth.uid}/… layout and 3 legacy docs/… objects '
  'whose storage owner is the correct patient. Replaces the unrestricted policy from '
  '20260324045518, which allowed any authenticated user to read every patient document.';

-- =============================================================================
-- POST-APPLY VERIFICATION (run read-only, do NOT include in the migration)
-- =============================================================================
--   -- every live object must still be reachable by exactly one owner:
--   SELECT count(*) FILTER (WHERE owner IS NOT NULL) AS reachable,
--          count(*)                                  AS total
--     FROM storage.objects WHERE bucket_id = 'patient-docs';
--
--   -- as patient A's JWT, this must return ONLY A's rows:
--   SELECT count(*) FROM storage.objects WHERE bucket_id='patient-docs';
--
-- ROLLBACK (reopens the exposure — for emergency use only)
--   DROP POLICY IF EXISTS "patient_docs_owner_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "patient_docs_owner_select" ON storage.objects;
--   DROP POLICY IF EXISTS "patient_docs_owner_delete" ON storage.objects;
--   CREATE POLICY "Allow authenticated upload" ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'patient-docs');
--   CREATE POLICY "Allow authenticated read" ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'patient-docs');
--   CREATE POLICY "Allow delete own files" ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'patient-docs');
-- =============================================================================
