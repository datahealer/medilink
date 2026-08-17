-- =============================================================================
-- invoices: make the bucket private and scope reads to the owning patient
-- =============================================================================
-- ⚠️ NOT APPLIED. Prepared for review. Do not `supabase db push` this without
--    running the PRE-APPLY VERIFICATION block below against production first, and
--    without the coordinated code deploy described under "DEPLOY ORDER".
--
-- FIXES AN UNAUTHENTICATED PHI EXPOSURE.
--
-- `supabase/functions/generate-invoice/index.ts` uploads each invoice as
-- `invoices/{payment_id}.pdf` and then calls `getPublicUrl()`, storing the result in
-- `payments.invoice_url`. The generated PDF contains, verbatim (see the `draw(...)` calls
-- in that function):
--
--     Patient : profiles.full_name
--             : profiles.email
--     Doctor  : doctors.full_name
--     Facility: facilities.name, facilities.address
--     Billing : subtotal, 5% tax, total
--
-- That is PHI plus a direct identifier, served from a PUBLIC bucket over an
-- unauthenticated, permanently-valid URL — and then emailed to the patient as a
-- "Download invoice (PDF)" link (backend/src/lib/email/sendInvoice.ts).
--
-- The exposure is not theoretical plumbing: the URL leaves our control the moment the mail
-- is sent. It survives in forwarded mail, mailbox scanning, browser history on a shared
-- device, referrer headers, and support-ticket screenshots. Anyone holding it reads the PHI
-- with no session at all.
--
-- `GET /api/payments/[id]/invoice` shows the shape of the bug most clearly: that route
-- authenticates the caller AND filters `.eq("patient_id", user.id)` — a correct
-- authorization gate — and then 302s to a URL that requires no authorization. The gate is
-- decorative today.
--
-- The object name is a v4 UUID and so is not brute-forceable. That is obscurity, not access
-- control, and it is not an acceptable control for PHI.
--
-- ── WHY THIS BUCKET WAS MISSED BEFORE ──
--
-- 20260814010000 fixed exactly this class of defect for `patient-docs`. It could not have
-- caught this one: the `invoices` bucket is not created by any migration in this repository
-- (it was made in the Supabase dashboard), so a migration-only audit sees no bucket and no
-- policy to criticise. The only in-repo evidence is `getPublicUrl()` in the edge function
-- and the comment "Downloads the PDF from its (public) invoice URL" in
-- mobile/src/hooks/queries/useRecords.ts.
--
-- ── SCOPE ──
--
-- Touches ONLY the `invoices` bucket flag and its `storage.objects` policies. No table RLS,
-- no other bucket, no schema change, no data change, and `payments.invoice_url` is NOT
-- rewritten — see "WHY invoice_url IS LEFT ALONE".
-- =============================================================================


-- =============================================================================
-- PRE-APPLY VERIFICATION — run these READ-ONLY first, and read the results.
-- =============================================================================
-- This migration assumes every object in the bucket is named `{payment_id}.pdf` at the
-- bucket root, because that is the only path the worker has ever written. 20260814010000
-- was nearly broken by exactly this assumption (it found 3 legacy `docs/…` objects that a
-- path-only rule would have orphaned), so verify rather than assume.
--
--   -- 1. Is the bucket public today? (expected: true — that is the defect)
--   SELECT id, public FROM storage.buckets WHERE id = 'invoices';
--
--   -- 2. How many objects, and do they ALL match the {uuid}.pdf convention?
--   SELECT count(*) AS total,
--          count(*) FILTER (
--            WHERE name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
--          ) AS canonical
--     FROM storage.objects WHERE bucket_id = 'invoices';
--   -- If canonical <> total, STOP. List the exceptions and extend the policy before
--   -- applying, or those patients lose access to their own invoices:
--   SELECT name FROM storage.objects
--    WHERE bucket_id = 'invoices'
--      AND name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$';
--
--   -- 3. Does every object correspond to a real payment? (orphans become unreadable,
--   --    which is correct, but you want to know the count before, not after.)
--   SELECT count(*) AS orphaned
--     FROM storage.objects o
--    WHERE o.bucket_id = 'invoices'
--      AND NOT EXISTS (
--        SELECT 1 FROM public.payments p WHERE p.id::text = split_part(o.name, '.', 1)
--      );
--
--   -- 4. How many payment rows still carry a legacy public URL? (all of them, expected —
--   --    this is the count that will stop resolving publicly once applied.)
--   SELECT count(*) FROM public.payments
--    WHERE invoice_url LIKE '%/storage/v1/object/public/%';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. CLOSE THE BUCKET
-- -----------------------------------------------------------------------------
-- The single line that ends the unauthenticated exposure. Every existing
-- `/storage/v1/object/public/invoices/...` URL — including every one already sitting in a
-- patient's inbox — stops resolving the moment this commits.
--
-- That link breakage is INTENTIONAL and is the point of the change. The replacement is
-- `GET /api/payments/{id}/invoice`, which authenticates, re-checks ownership, and mints a
-- short-lived signed URL. Old mail links break; the app keeps working. See DEPLOY ORDER —
-- the code that stops handing out public URLs must ship BEFORE this runs.
UPDATE storage.buckets
   SET public = FALSE
 WHERE id = 'invoices';


-- -----------------------------------------------------------------------------
-- 2. LET THE OWNING PATIENT — AND ONLY THEM — READ THEIR OWN INVOICE
-- -----------------------------------------------------------------------------
-- With the bucket private, `service_role` still bypasses RLS, so the backend's signed-URL
-- minting keeps working with no policy at all. This policy exists so the SHARED/RLS TIER
-- also works: mobile and web hold the patient's own Supabase session and can call
-- `createSignedUrl()` directly, exactly as they already do for `patient-docs`. Without it
-- every invoice read would have to round-trip the backend.
--
-- OWNERSHIP DERIVATION. Unlike `patient-docs` — where the uploader's uid is the first path
-- segment — the invoice path carries a PAYMENT id, not a user id. So ownership is resolved
-- by joining `payments`:
--
--     storage object   invoices/{payment_id}.pdf
--     ->  payments.id = {payment_id}
--     ->  payments.patient_id = auth.uid()
--
-- `payments.patient_id` IS the auth uid, not `patient_profiles.id`. Confirmed at the write
-- site: `backend/src/app/api/payments/checkout/route.ts` inserts `patient_id: user.id`, and
-- its comment records the same ("payments.patient_id FK → profiles(id) (the auth uid)").
-- Getting this wrong in either direction silently denies every patient their own invoice,
-- so it is asserted in supabase/tests/invoices_storage_policy_test.sql.
--
-- `split_part(name, '.', 1)` takes the id from `{uuid}.pdf`. The `::uuid` cast is what makes
-- a non-canonical object name fail CLOSED: a name that is not a UUID raises rather than
-- matching, and the surrounding regex guard skips those rows before the cast is reached.
DROP POLICY IF EXISTS "invoices_owner_select" ON storage.objects;

CREATE POLICY "invoices_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  -- Guard before the cast: only consider canonically-named objects, so a stray file can
  -- never raise an error mid-policy (which would fail the whole query, not just that row).
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  AND EXISTS (
    SELECT 1
      FROM public.payments p
     WHERE p.id = split_part(storage.objects.name, '.', 1)::uuid
       AND p.patient_id = auth.uid()
  )
);

COMMENT ON POLICY "invoices_owner_select" ON storage.objects IS
  'A patient may read only the invoice belonging to their own payment. Ownership is '
  'resolved by joining payments on the {payment_id}.pdf object name, because unlike '
  'patient-docs the path carries a payment id rather than a user id. Paired with '
  'storage.buckets.public = false, which is what actually ends the unauthenticated '
  'exposure this migration exists to fix.';


-- -----------------------------------------------------------------------------
-- 3. NO INSERT / UPDATE / DELETE POLICY — DELIBERATELY
-- -----------------------------------------------------------------------------
-- Invoices are written exclusively by the `generate-invoice` edge function under
-- `service_role`, which bypasses RLS. Granting a patient any write verb here would let them
-- alter or destroy a financial record of their own care. With no policy, every write by
-- `authenticated` is denied by default, which is the correct posture — and it is why this
-- migration creates one policy rather than the three that 20260814010000 needed.


-- =============================================================================
-- WHY `payments.invoice_url` IS LEFT ALONE
-- =============================================================================
-- Tempting to rewrite it to a path or NULL it out. Deliberately not done, for two reasons.
--
-- 1. `payments` is a table SHARED with the HAMS staff platform. This repository's policy is
--    additive-only (supabase/README.md); silently changing what a column CONTAINS is a
--    breaking contract change for a consumer whose code is not in this repo. HAMS's own
--    invoice links will stop resolving when the bucket closes — that is unavoidable and is
--    the point — but it must be a coordinated decision, not a side effect of this file.
--
-- 2. The application no longer needs it. `backend/src/lib/payments/invoiceObject.ts` derives
--    the object path from the AUTHENTICATED payment id and never dereferences the stored
--    URL, precisely so that a wrong or tampered `invoice_url` cannot steer which object gets
--    signed. `invoice_url` now means only "an invoice exists" (IS NOT NULL).
--
-- A follow-up migration may normalise the column once HAMS has confirmed. It is not needed
-- to close the exposure.
-- =============================================================================


-- =============================================================================
-- DEPLOY ORDER — this migration is the LAST step, not the first
-- =============================================================================
--   1. Deploy the backend + clients that stop handing out public URLs and use
--      `GET /api/payments/{id}/invoice` instead (this change set).
--   2. Confirm in production that a signed download works for a real paid payment.
--   3. THEN apply this migration.
--
-- Reversing 1 and 3 gives every patient a broken invoice button for the length of the
-- deploy, because the clients would still be pointing at public URLs that no longer resolve.
-- =============================================================================


-- =============================================================================
-- POST-APPLY VERIFICATION (read-only)
-- =============================================================================
--   -- bucket is closed:
--   SELECT public FROM storage.buckets WHERE id = 'invoices';           -- expect false
--
--   -- the old public URL is dead (expect 400/404, NOT 200):
--   --   curl -sI "https://<ref>.supabase.co/storage/v1/object/public/invoices/<payment>.pdf"
--
--   -- as patient A's JWT, exactly A's own invoices are visible and no others:
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'invoices';
--
--   -- and the signed path still works end to end:
--   --   GET /api/payments/{A's payment id}/invoice        -> 302 to a signed URL -> 200 PDF
--   --   GET /api/payments/{B's payment id}/invoice as A   -> 404
-- =============================================================================


-- =============================================================================
-- ROLLBACK (REOPENS THE PHI EXPOSURE — emergency use only, and log why)
-- =============================================================================
--   DROP POLICY IF EXISTS "invoices_owner_select" ON storage.objects;
--   UPDATE storage.buckets SET public = TRUE WHERE id = 'invoices';
-- =============================================================================
