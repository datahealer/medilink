-- ============================================================================
-- P0 SECURITY FIX — block privilege escalation via direct profiles UPDATE.
--
-- PROBLEM (confirmed live):
--   The policy `profiles_update_own` allows an authenticated user to UPDATE
--   their own row with only `USING (id = auth.uid()) WITH CHECK (id = auth.uid())`.
--   PostgreSQL RLS cannot compare OLD vs NEW column values, so a patient could
--   `PATCH /rest/v1/profiles?id=eq.<self>` and set role='facility_admin'
--   (verified: HTTP 200, role changed), or change status / facility_id, etc.
--
-- FIX STRATEGY:
--   Keep the existing RLS UNCHANGED (owner may still update their own row).
--   Add a BEFORE UPDATE trigger that enforces COLUMN-LEVEL protection, which RLS
--   cannot do. The trigger distinguishes the caller by `current_user`:
--     * 'authenticated' / 'anon'  -> a direct PostgREST/client write  -> GUARDED
--     * 'service_role'            -> trusted backend (service-role key) -> allowed
--     * function owner (e.g. 'postgres') inside a SECURITY DEFINER RPC -> allowed
--   This is why role-elevation RPCs (accept_doctor_invite / accept_facility_admin_invite,
--   which are SECURITY DEFINER and run as their owner) and the server's service-role
--   writes (set-password, account deletion status changes) keep working unchanged.
--   The trigger function is SECURITY INVOKER (default) so `current_user` reflects
--   the REAL executor, not the trigger's owner.
--
-- SCOPE:
--   Protects (client can NEVER change these on their own row):
--     role, status, facility_id, muted_facilities, deletion_requested_at,
--     auth_masked, export_request_count, last_export_at, consent_version, consent_ip
--   These have NO legitimate authenticated-session writer in the codebase
--   (role via SECURITY DEFINER RPCs; status/deletion via service-role; the rest unused
--    by the client), so guarding them breaks nothing.
--
--   NOT protected here (intentionally — see note): phone_verified, two_factor_enabled.
--   These ARE written under the authenticated user session by legitimate routes
--   (verify-otp sets phone_verified; 2fa/verify & 2fa/disable set two_factor_enabled).
--   Locking them at the DB layer would break OTP + 2FA. To protect them too, first
--   move those three writes to service-role (or a dedicated SECURITY DEFINER RPC),
--   then add them to the protected list below. Tracked as a follow-up.
--
-- Safe personal fields remain freely editable by the owner (existing RLS), e.g.:
--   full_name, phone, language, theme_preference, notification_prefs,
--   consent_flags, push_tokens.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Guard function (SECURITY INVOKER so current_user = the real caller).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profiles_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only constrain direct client sessions. Trusted server paths
  -- (service_role key, and SECURITY DEFINER RPCs running as their owner) pass through.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role                  IS DISTINCT FROM OLD.role
    OR NEW.status                IS DISTINCT FROM OLD.status
    OR NEW.facility_id           IS DISTINCT FROM OLD.facility_id
    OR NEW.muted_facilities      IS DISTINCT FROM OLD.muted_facilities
    OR NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at
    OR NEW.auth_masked           IS DISTINCT FROM OLD.auth_masked
    OR NEW.export_request_count  IS DISTINCT FROM OLD.export_request_count
    OR NEW.last_export_at        IS DISTINCT FROM OLD.last_export_at
    OR NEW.consent_version       IS DISTINCT FROM OLD.consent_version
    OR NEW.consent_ip            IS DISTINCT FROM OLD.consent_ip
    THEN
      RAISE EXCEPTION
        'Updating privileged profile columns (role/status/facility_id/etc.) is not permitted.'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_profiles_privileged_columns() IS
  'P0 guard: blocks authenticated/anon clients from changing privileged columns on public.profiles. Service-role and SECURITY DEFINER RPCs (run as owner) bypass.';

-- ---------------------------------------------------------------------------
-- 2. Attach BEFORE UPDATE trigger.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_profiles_privileged_columns ON public.profiles;

CREATE TRIGGER trg_profiles_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profiles_privileged_columns();

-- NOTE: The existing RLS policy `profiles_update_own` is intentionally left in place.
--       RLS still scopes writes to the owner; this trigger adds the column-level rule.

-- ============================================================================
-- VERIFICATION (manual — run as the patient test account via Supabase REST,
-- using the anon key + the patient access token; NOT psql/service-role):
--
--   userId = 0ca03602-6a33-4718-aa1e-b5e8655b1fe5
--
-- (a) Patient CAN update a safe field — expect 200 and the new value:
--     PATCH /rest/v1/profiles?id=eq.<userId>
--       body: { "full_name": "Test Patient QA" }
--     -> 200, full_name updated. (restore afterwards)
--
-- (b) Patient CANNOT change role — expect 4xx (error 42501), role unchanged:
--     PATCH /rest/v1/profiles?id=eq.<userId>
--       body: { "role": "facility_admin" }
--     -> error: "Updating privileged profile columns ... is not permitted."
--     SELECT role FROM profiles WHERE id = '<userId>';  -- still 'patient'
--
-- (c) Patient CANNOT change status — expect 4xx, status unchanged:
--     PATCH /rest/v1/profiles?id=eq.<userId>
--       body: { "status": "deletion_pending" }
--     -> error (42501). SELECT status ... -- still 'active'
--
-- (d) Patient CANNOT change facility_id — expect 4xx, facility_id unchanged:
--     PATCH /rest/v1/profiles?id=eq.<userId>
--       body: { "facility_id": "599761b0-f236-44a8-a30e-f3295b109c62" }
--     -> error (42501). SELECT facility_id ... -- still NULL
--
-- Server-side equivalence checks (should still SUCCEED, proving no regression):
--   * Invite acceptance (accept_doctor_invite / accept_facility_admin_invite RPC)
--     still sets role — runs SECURITY DEFINER as owner, bypasses the guard.
--   * Account deletion route still sets status='deletion_pending' — uses the
--     service-role key (current_user = 'service_role'), bypasses the guard.
-- ============================================================================
