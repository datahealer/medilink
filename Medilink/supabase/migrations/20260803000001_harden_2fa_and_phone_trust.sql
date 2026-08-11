-- Phase 5 — close the two self-assertable security flags on profiles
--
-- ============================================================================
-- FINDING 1 (HIGH) — two_factor_enabled is an MFA bypass to patient records
-- ============================================================================
-- I previously reported this column as "not a 2FA bypass" on the grounds that
-- real AAL2 enforcement reads auth.mfa_factors through
-- getAuthenticatorAssuranceLevel(). That was wrong, and this is the correction.
-- It is true of middleware.ts and getAal2UserOrThrow, but it is NOT true of the
-- database. 20260424053136 added:
--
--   CREATE FUNCTION public.aal2_or_no_2fa() ... SECURITY DEFINER AS $$
--     SELECT CASE
--       WHEN p.role = 'patient' THEN true
--       WHEN (auth.jwt() ->> 'aal') = 'aal2' THEN true
--       WHEN NOT COALESCE(p.two_factor_enabled, false) THEN true   -- <-- here
--       ELSE false
--     END FROM public.profiles p WHERE p.id = auth.uid();
--   $$;
--
-- and wired it into the RLS policies on patient_profiles, medical_histories
-- and appointments (and, via 20260702000000, the reschedule/cancel RPCs).
--
-- So the security decision reads a column the subject of the decision can
-- write. The attack needs only a stolen staff password:
--
--   1. Sign in directly against Supabase Auth. No HAMS UI, no Next.js
--      middleware — PostgREST is a separate public endpoint. Session is AAL1.
--   2. PATCH /rest/v1/profiles?id=eq.<self>  {"two_factor_enabled": false}
--      profiles_update_own permits it (row-scoped) and no column grant or
--      trigger covered this column.
--   3. aal2_or_no_2fa() now returns true, and RLS on medical_histories,
--      patient_profiles and appointments admits the AAL1 session.
--
-- Result: TOTP is bypassed and patient medical records are readable with a
-- password alone. Middleware never runs, so none of the application-layer
-- checks are reached.
--
-- FIX (two independent layers, neither of which touches MediLink):
--   1a. aal2_or_no_2fa() stops reading the column and derives enrolment from
--       auth.mfa_factors, which no client role can write. This alone closes the
--       bypass; even if the column is wrong, the RLS decision is right.
--   1b. A BEFORE UPDATE trigger keeps the column honest, so middleware and the
--       UI are not lied to either.
--
-- ============================================================================
-- FINDING 2 (MEDIUM) — phone_verified is self-assertable
-- ============================================================================
-- A patient can PATCH phone_verified = true and skip the gate at
-- appointments/book:84-89. No PHI exposure and no privilege escalation, but it
-- puts unreachable phone numbers into clinic records.
--
-- It cannot simply be revoked: MediLink's backend/src/app/api/auth/verify-otp
-- writes it under the END USER's session (createApiSupabaseClient), so a revoke
-- breaks MediLink's OTP flow the moment it is applied. This migration therefore
-- ships the trusted replacement (verify_phone_otp) WITHOUT revoking anything.
-- The revoke is staged in a separate migration to be applied only once MediLink
-- has adopted the RPC. See the ROLLOUT section at the bottom.
--
-- ============================================================================
-- FINDING 3 (HIGH, reported not fixed here) — OTPs are stored in plaintext
-- ============================================================================
-- HAMS send-otp/route.ts:52-55 stores the code as-is with a "TODO: hash OTP"
-- comment, and verify-otp compares `record.hash !== code` directly. MediLink,
-- against the SAME shared otp_records table, uses bcrypt.compare(). Two
-- consequences: live OTPs sit in plaintext in a shared production table, and
-- the two apps cannot verify each other's codes at all — a bcrypt digest never
-- equals a 6-digit string, and bcrypt.compare on a plaintext row fails.
-- verify_phone_otp below accepts both formats so it works whichever app issued
-- the code; the HAMS send-otp path is fixed in application code alongside this.
--
-- ============================================================================
-- WHY NO REPOSITORY BREAKS
-- ============================================================================
-- Write ordering was checked in both codebases, not assumed:
--   HAMS     2fa/verify:69-71   mfa.verify() succeeds -> writes true
--            2fa/disable:59-73  unenroll() all factors -> writes false
--   MediLink 2fa/verify:52,71   mfa.verify() succeeds -> writes true
--            2fa/disable:61,73  unenroll() all factors -> writes false
-- In every case the underlying fact in auth.mfa_factors is already true at the
-- moment of the write, so the trigger in 1b passes and all four routes keep
-- working with no change to either repository.
--
-- ROLLBACK
--   -- 1a: restore the old body (reopens the bypass)
--   CREATE OR REPLACE FUNCTION public.aal2_or_no_2fa() RETURNS boolean
--     LANGUAGE sql STABLE SECURITY DEFINER AS $x$
--     SELECT CASE WHEN p.role='patient' THEN true
--                 WHEN (auth.jwt()->>'aal')='aal2' THEN true
--                 WHEN NOT COALESCE(p.two_factor_enabled,false) THEN true
--                 ELSE false END
--     FROM public.profiles p WHERE p.id = auth.uid(); $x$;
--   -- 1b:
--   DROP TRIGGER trg_profiles_2fa_flag ON public.profiles;
--   DROP FUNCTION public.enforce_profiles_2fa_flag();
--   -- 2:
--   DROP FUNCTION public.verify_phone_otp(text, text);

-- ---------------------------------------------------------------------------
-- 0. Fail loudly HERE if the migration role cannot read auth.mfa_factors.
--
-- Both functions below are SECURITY DEFINER and run as their owner, so they
-- inherit whatever access the role applying this migration has. If that role
-- cannot see auth.mfa_factors, aal2_or_no_2fa() would start raising at runtime
-- instead of returning a boolean — and because it sits inside the USING clause
-- of the RLS policies on patient_profiles, medical_histories and appointments,
-- that would fail CLOSED and lock every patient out of their own records.
--
-- A migration-time abort is vastly preferable to discovering that in
-- production, so this check runs before anything is created.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM 1 FROM auth.mfa_factors LIMIT 1;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE EXCEPTION
    'Cannot read auth.mfa_factors as %. Aborting: aal2_or_no_2fa() would fail closed and lock patients out of medical_histories, patient_profiles and appointments. Apply this migration as a role with SELECT on auth.mfa_factors (e.g. postgres via the Studio SQL editor).',
    current_user;
END $$;

-- ---------------------------------------------------------------------------
-- 1a. Derive 2FA enrolment from auth.mfa_factors, never from the profile flag.
--
-- Still SECURITY DEFINER (it must read auth.mfa_factors, which authenticated
-- cannot). Still STABLE. Same signature and return type, so every policy and
-- RPC that already calls it picks the new body up with no further change.
--
-- 'verified' is the status Supabase sets once a TOTP factor has been confirmed
-- with a valid code; an abandoned 'unverified' enrolment must NOT count as 2FA,
-- or a user who started enrolment and stopped would lock themselves out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aal2_or_no_2fa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT CASE
    -- Patients are never subject to AAL2.
    WHEN p.role = 'patient' THEN true

    -- Session has already cleared TOTP.
    WHEN (auth.jwt() ->> 'aal') = 'aal2' THEN true

    -- No verified TOTP factor exists, so there is nothing to step up to.
    -- Read from auth.mfa_factors — the authoritative record, unwritable by
    -- any client role — instead of profiles.two_factor_enabled, which the
    -- subject of this check can PATCH.
    WHEN NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = p.id
        AND f.status  = 'verified'
    ) THEN true

    -- Enrolled but session is AAL1 -> block.
    ELSE false
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

COMMENT ON FUNCTION public.aal2_or_no_2fa() IS
  'RLS helper for AAL2 enforcement on patient_profiles, medical_histories and '
  'appointments. Derives 2FA enrolment from auth.mfa_factors. Must never read '
  'profiles.two_factor_enabled: that column is client-writable, and trusting it '
  'allowed an AAL1 session to disable its own 2FA requirement and read patient '
  'records with a password alone.';

-- ---------------------------------------------------------------------------
-- 1b. Keep the mirror column honest.
--
-- SECURITY INVOKER (the default) so current_user is the REAL caller — the same
-- technique 20260622000001 uses. Service-role writes and SECURITY DEFINER RPCs
-- running as their owner pass through untouched.
--
-- The rule is agreement with auth.mfa_factors, not a blanket denial, which is
-- what lets both repositories keep writing the column from their existing
-- routes: by the time either one writes, the factor state already matches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profiles_2fa_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_has_verified_factor BOOLEAN;
BEGIN
  IF NEW.two_factor_enabled IS NOT DISTINCT FROM OLD.two_factor_enabled THEN
    RETURN NEW;
  END IF;

  -- Only constrain direct client sessions.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = NEW.id
      AND f.status  = 'verified'
  ) INTO v_has_verified_factor;

  IF NEW.two_factor_enabled AND NOT v_has_verified_factor THEN
    RAISE EXCEPTION
      'Cannot mark 2FA enabled: no verified authenticator is enrolled.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT NEW.two_factor_enabled AND v_has_verified_factor THEN
    RAISE EXCEPTION
      'Cannot mark 2FA disabled while a verified authenticator is still enrolled. Unenroll the factor first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_profiles_2fa_flag() IS
  'Requires profiles.two_factor_enabled to agree with auth.mfa_factors when '
  'written by a client session. Deliberately a consistency rule rather than a '
  'denial, so the existing HAMS and MediLink 2fa/verify and 2fa/disable routes '
  'keep working unchanged — both write the column only after the factor state '
  'has already changed.';

DROP TRIGGER IF EXISTS trg_profiles_2fa_flag ON public.profiles;
CREATE TRIGGER trg_profiles_2fa_flag
  BEFORE UPDATE OF two_factor_enabled ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profiles_2fa_flag();

-- ---------------------------------------------------------------------------
-- 2. Trusted phone-OTP verification.
--
-- Additive. Nothing is forced to use it by this migration; it exists so that
-- both applications can stop writing phone_verified from a client session, at
-- which point the staged revoke below becomes safe.
--
-- Does the whole compare-and-set in one place the caller cannot influence:
-- checks expiry, enforces the attempt cap, compares the code, and only then
-- sets phone/phone_verified and consumes the record. A caller can no longer
-- assert the outcome — it can only supply a code.
--
-- Accepts both storage formats because the two apps disagree today (Finding 3):
-- a bcrypt digest is verified with crypt(), anything else by equality. The
-- bcrypt branch is guarded on pgcrypto actually being present so this function
-- cannot fail closed on a project where it is not installed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_phone_otp(
  p_code  TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_rec      public.otp_records%ROWTYPE;
  v_phone    TEXT;
  v_ok       BOOLEAN := false;
  v_bcrypt   BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE_FORMAT');
  END IF;

  SELECT * INTO v_rec FROM public.otp_records WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_OTP');
  END IF;

  IF v_rec.expires_at < NOW() THEN
    DELETE FROM public.otp_records WHERE user_id = v_uid;
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED');
  END IF;

  IF v_rec.attempts >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  -- Resolve the number to stamp: caller-supplied, else the one already on file.
  SELECT COALESCE(p_phone, pr.phone) INTO v_phone
  FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PHONE');
  END IF;

  v_bcrypt := v_rec.hash LIKE '$2%$%';

  IF v_bcrypt THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'crypt' AND n.nspname IN ('extensions', 'public')
    ) THEN
      EXECUTE 'SELECT extensions.crypt($1, $2) = $2'
        INTO v_ok USING p_code, v_rec.hash;
    ELSE
      -- pgcrypto absent and the stored value is a digest we cannot check.
      -- Fail closed and say so, rather than silently accepting.
      RETURN jsonb_build_object('success', false, 'error', 'HASH_UNSUPPORTED');
    END IF;
  ELSE
    v_ok := (v_rec.hash = p_code);
  END IF;

  IF NOT v_ok THEN
    UPDATE public.otp_records
       SET attempts = attempts + 1
     WHERE user_id = v_uid;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'attempts_remaining', GREATEST(0, 5 - (v_rec.attempts + 1))
    );
  END IF;

  UPDATE public.profiles
     SET phone = v_phone, phone_verified = true
   WHERE id = v_uid;

  DELETE FROM public.otp_records WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'phone', v_phone);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_phone_otp(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_phone_otp(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.verify_phone_otp(TEXT, TEXT) IS
  'Verifies a phone OTP and sets profiles.phone_verified atomically, so a client '
  'supplies a code rather than asserting the result. Accepts bcrypt and legacy '
  'plaintext otp_records.hash values because HAMS and MediLink currently store '
  'them differently. Once both apps call this, phone_verified can be revoked '
  'from authenticated — see 20260803000002.';

-- ============================================================================
-- ROLLOUT
-- ============================================================================
-- Safe to apply now. Nothing in either repository has to change first:
--   * 1a changes only the body of an existing function; every caller is a
--     policy or RPC that already invokes it.
--   * 1b passes for all four existing 2FA routes (ordering verified above).
--   * 2 is a new function nobody calls yet.
--
-- Then, in order:
--   1. HAMS verify-otp switches to verify_phone_otp (shipped with this commit).
--   2. MediLink verify-otp switches to the same RPC — one-line change, patch
--      supplied in the phase report. Their bcrypt path is preserved by the
--      crypt() branch above.
--   3. Only then apply 20260803000002, which revokes phone_verified from
--      authenticated. Applying it before step 2 WILL break MediLink OTP.
