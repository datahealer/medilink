-- =============================================================================
-- profiles.phone_verified — make it server-asserted only
-- =============================================================================
-- Completes the rollout staged by 20260803000001 (see its ROLLOUT section). That migration
-- shipped the trusted replacement but deliberately revoked nothing, because MediLink's
-- `POST /api/auth/verify-otp` wrote `phone_verified` under the END USER's session, so a
-- revoke would have broken it the moment it applied.
--
-- Those three routes (`send-otp`, `resend-otp`, `verify-otp`) had zero callers, never
-- delivered an SMS, and are deleted in this same change set. Step 2 of the documented
-- rollout is therefore satisfied and the revoke is now safe.
--
-- ── WHAT WAS WRONG ──
--
-- `authenticated` held UPDATE on the column, so any patient could
--     PATCH /rest/v1/profiles  { "phone_verified": true }
-- and assert a verified phone without ever receiving a code. Consequences:
--   • a clinic reading phone_verified = true trusts a number nobody confirmed;
--   • the duplicate pre-flight in backend/src/lib/twilio/phoneLink.ts filters on
--     `.eq("phone_verified", true)`, so a forged row lets one account block the real
--     owner from linking their own number.
--
-- ── WHY A TRIGGER AND NOT ONLY A REVOKE ──
--
-- A revoke alone would break a rule we must KEEP: `shared/src/api/profile.ts` clears
-- `phone_verified` in the same UPDATE as a phone change, so verification cannot outlive
-- the number it attests. PostgREST rejects the whole statement when the payload names a
-- column the role cannot write — even to set it FALSE — so that clear would start failing.
--
-- Moving the rule into a BEFORE UPDATE trigger is strictly stronger than leaving it in the
-- client: the clear now happens for EVERY writer, including a direct PostgREST call that
-- omits the column entirely. The client no longer has to remember, and no longer can lie.
--
-- ── TRUST BOUNDARY ──
--
-- `POST /api/auth/phone/check` sets phone AND phone_verified = true in one statement under
-- the SERVICE ROLE, after Twilio Verify returns `approved` and the Admin API link succeeds.
-- That path must keep working, so the trigger exempts service_role — and only service_role.
-- Everything else may set the flag FALSE (or leave it alone) but never TRUE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_phone_verified_trust()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- auth.role() is the role in the request JWT. It is NULL for a direct superuser/owner
  -- connection (migrations, psql), which we also treat as trusted — a migration must be
  -- able to backfill. Anything presenting an `authenticated` or `anon` JWT is untrusted.
  v_trusted BOOLEAN := coalesce(auth.role(), 'service_role') = 'service_role';
BEGIN
  -- RULE 1 — changing the number always invalidates the attestation.
  -- Skipped for service_role because /api/auth/phone/check legitimately sets both in one
  -- statement: the number changed AND it was just verified.
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NOT v_trusted THEN
    NEW.phone_verified := FALSE;
  END IF;

  -- RULE 2 — only the server may assert TRUE.
  -- Silently coerced rather than raised: a patient editing their profile has done nothing
  -- wrong from their point of view, and an exception would surface as an opaque save
  -- failure. Downgrading to FALSE is the honest outcome and is never lossy — a genuinely
  -- verified number is re-asserted by /api/auth/phone/check under the service role.
  IF NEW.phone_verified IS TRUE AND OLD.phone_verified IS DISTINCT FROM TRUE AND NOT v_trusted THEN
    NEW.phone_verified := OLD.phone_verified;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_phone_verified_trust() IS
  'Keeps profiles.phone_verified honest: any non-service_role write that changes phone '
  'clears it, and only service_role may set it TRUE. Paired with the column REVOKE below.';

DROP TRIGGER IF EXISTS trg_profiles_phone_verified_trust ON public.profiles;
CREATE TRIGGER trg_profiles_phone_verified_trust
BEFORE UPDATE OF phone, phone_verified ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_phone_verified_trust();

-- ---------------------------------------------------------------------------
-- Column grant — defence in depth.
--
-- Follows the convention established by 20260802000001: revoke the specific column from
-- `authenticated` rather than rewriting any policy. The trigger above already makes a
-- forged TRUE impossible; this makes the column unmentionable in a client payload at all,
-- so the attempt fails at the grant layer before any row is touched.
--
-- NOTE for application code: after this migration a client UPDATE must NOT include
-- `phone_verified` in its payload, or PostgREST rejects the entire statement. The clear on
-- phone-change is now the trigger's job — see the matching change in shared/src/api/profile.ts.
-- ---------------------------------------------------------------------------
REVOKE UPDATE (phone_verified) ON public.profiles FROM authenticated;
REVOKE UPDATE (phone_verified) ON public.profiles FROM anon;

-- service_role must retain it: /api/auth/phone/check writes the mirror.
GRANT UPDATE (phone_verified) ON public.profiles TO service_role;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_profiles_phone_verified_trust ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_phone_verified_trust();
--   GRANT UPDATE (phone_verified) ON public.profiles TO authenticated;
--   -- and restore the client-side clear in shared/src/api/profile.ts
-- =============================================================================
