-- Feature: Invoices in the Document Vault
--
-- Add an 'invoice' value to the document_type enum so paid invoices can be filed in
-- patient_documents alongside prescriptions/reports/imaging/insurance/other. The mobile
-- app files a copy of each viewed invoice PDF into the patient-docs bucket + a
-- patient_documents row of this type, so invoices are viewable / downloadable /
-- shareable from the Document Vault as well as Payment History.
--
-- Additive & reversible-in-effect (Postgres can't DROP a single enum value, but nothing
-- depends on it until rows use it). Must be applied BEFORE the app writes type='invoice'
-- rows: run `npm run db:push`. No data backfill required.

ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'invoice';
