-- ================================================================
-- Fix: ensure all audit_logs columns exist
-- Migration 20260402145418 defined audit_logs with only 7 columns
-- (no actor_ip, before, after, metadata). These ADD COLUMN IF NOT EXISTS
-- statements are safe to run on any DB state — no-op if column exists.
-- ================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_ip  INET,
  ADD COLUMN IF NOT EXISTS before    JSONB,
  ADD COLUMN IF NOT EXISTS after     JSONB,
  ADD COLUMN IF NOT EXISTS metadata  JSONB NOT NULL DEFAULT '{}';

-- Ensure service_role INSERT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
    AND policyname = 'audit_logs_service_insert'
  ) THEN
    CREATE POLICY "audit_logs_service_insert"
    ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END;
$$;

-- Replace any partial SELECT policy with one that covers both super_admin and facility_admin
DROP POLICY IF EXISTS "audit_logs_super_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;

CREATE POLICY "audit_logs_admin_read"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'facility_admin')
  )
);
