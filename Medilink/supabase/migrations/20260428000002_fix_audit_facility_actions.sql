-- ================================================================
-- F-56 Fix: Facility audit log enum values + drop broken DB trigger
--
-- Problem: hams_audit_facility_status() trigger fires under service_role
-- context where auth.uid() returns NULL → every audit entry has
-- actor_user_id = NULL, making it useless for traceability.
--
-- Fix: Drop the trigger. Both status and verify API routes now call
-- logAudit() directly with the authenticated super_admin's user_id.
-- ================================================================

-- 1. Extend audit_action enum with facility lifecycle events
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_activated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_deactivated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_verified';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'facility_unverified';

-- 2. Drop DB trigger — actor context is unavailable under service_role.
--    The API layer now owns facility audit logging with full actor info.
DROP TRIGGER IF EXISTS audit_facility_status ON public.facilities;
DROP FUNCTION IF EXISTS public.hams_audit_facility_status();
