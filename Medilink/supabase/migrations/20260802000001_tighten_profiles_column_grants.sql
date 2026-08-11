-- Phase 5 — narrow the remaining authenticated-writable columns on profiles
--
-- CONTEXT
-- -------
-- 20260801000002 closed the role/facility_id/status escalation by dropping the
-- table-level UPDATE and re-granting per column. That re-grant deliberately
-- handed back EVERY other column, because the priority was closing the P0
-- without risking a MediLink regression. This migration does the follow-up
-- work: each remaining column was traced through both codebases and is either
-- kept (it has a real authenticated-session writer) or revoked (it does not).
--
-- There is also a pre-existing defence already in place that the Phase 0 audit
-- did not account for: 20260622000001 installed a BEFORE UPDATE trigger,
-- enforce_profiles_privileged_columns(), which rejects client writes to
-- role, status, facility_id, muted_facilities, deletion_requested_at,
-- auth_masked, export_request_count, last_export_at, consent_version and
-- consent_ip by checking current_user IN ('authenticated','anon'). It is in the
-- applied migration history and no later migration drops or disables it. The
-- columns below that it already covers are therefore being revoked as a second,
-- independent layer, not as a first line of defence.
--
-- HOW EACH COLUMN WAS DECIDED
-- ---------------------------
-- Evidence: HAMS browser code never UPDATEs profiles at all (only reads).
-- MediLink client code writes exactly three columns — full_name and phone via
-- shared/src/api/profile.ts::updateMyProfile (explicit allow-list), and
-- notification_prefs via shared/src/api/notifications.ts::updatePreferences.
-- MediLink's backend routes verify-otp and 2fa/{verify,disable} write
-- phone_verified and two_factor_enabled using createApiSupabaseClient, i.e.
-- under the end user's own session, not a service key.
--
-- KEPT — genuine authenticated-session writers exist:
--   full_name           MediLink updateMyProfile
--   phone               MediLink updateMyProfile
--   notification_prefs  MediLink updatePreferences
--   language            user preference, no security meaning, plausible client write
--   theme_preference    same
--   push_tokens         own device tokens, RLS-scoped to own row, no security meaning
--   phone_verified      see KNOWN-OPEN below
--   two_factor_enabled  see KNOWN-OPEN below
--
-- REVOKED — no authenticated-session writer in either repository:
--   email                  written only by service-role upserts in the five
--                          invite routes. Client-writable today, and the invite
--                          resend path resolves an auth user id FROM this column
--                          (doctors/[id]/invite line 156-161) before calling
--                          auth.admin.updateUserById on it. profiles_email_ci_unique
--                          (20260429000002) blocks taking an address that already
--                          has a profile row, which stops the outright hijack, but
--                          squatting an address before it is invited still turns
--                          into a hard 409 "Email already exists" for the admin,
--                          and profiles.email silently diverging from
--                          auth.users.email breaks the identity assumption these
--                          five routes and checkEmailAvailable.ts all rely on.
--   full_name_ar_status    CHECK-constrained to machine_unverified/admin_entered/
--                          verified. Zero writers anywhere today. A user can
--                          currently stamp their own name 'verified', which makes
--                          the Phase 5.3 verification workflow meaningless before
--                          it ships. This is the reason 5.3 needs it locked.
--   full_name_ar          same field, authoring side. MediLink only ever reads it.
--   consented_at          HAMS users/me/consent writes it with the SERVICE client
--                         (route line 37-46). GDPR evidence must not be
--                         self-editable.
--   consent_flags         same route, same service client. No MediLink writer.
--   consent_ip            already trigger-guarded; second layer
--   consent_version       already trigger-guarded; second layer
--   auth_masked           written only by the purge-user-auth Edge Function
--                         (service role); already trigger-guarded
--   export_request_count  already trigger-guarded; second layer
--   last_export_at        already trigger-guarded; second layer
--   deletion_requested_at written by users/me/account and cancel-deletion with
--                         the service client; already trigger-guarded
--   muted_facilities      read by the broadcast-announcement Edge Function;
--                         already trigger-guarded
--   id                    primary key. RLS WITH CHECK (id = auth.uid()) already
--                         makes a change impossible; revoked for tidiness.
--   created_at            system column
--   updated_at            system column; no client sends it. A BEFORE trigger
--                         setting NEW.updated_at is unaffected — column privileges
--                         are checked against the columns named in the statement,
--                         not against what a trigger assigns.
--
-- KNOWN-OPEN, DELIBERATELY NOT FIXED HERE
-- ---------------------------------------
-- phone_verified and two_factor_enabled stay writable. Both are self-asserted
-- security flags and both SHOULD be server-owned, but the only writers are
-- HAMS's and MediLink's verify-otp / 2fa routes, and all four run under the end
-- user's session. Revoking either column breaks MediLink's OTP and 2FA flows
-- immediately. That is a coordinated two-repository change (move the writes to
-- a SECURITY DEFINER RPC or the service key on both sides, then revoke), not
-- something to slip into a HAMS privilege migration.
--
-- Residual risk, stated plainly:
--   phone_verified      a patient can self-assert a verified phone and skip the
--                       gate in appointments/book (line 84-89). Data-quality and
--                       reachability problem; not privilege escalation.
--   two_factor_enabled  actual AAL2 enforcement reads auth.mfa_factors via
--                       supabase.auth.mfa.getAuthenticatorAssuranceLevel(), in
--                       both middleware.ts:85 and getAal2UserOrThrow — NOT this
--                       column. Setting it true therefore does not bypass 2FA. It
--                       only silences the super_admin enrolment redirect at
--                       middleware.ts:78, i.e. a super_admin can defer their own
--                       mandatory enrolment. Requires already being super_admin.
-- 20260622000001 flagged this same pair as a follow-up for the same reason.
--
-- MEDILINK COMPATIBILITY
--   full_name, phone, notification_prefs, phone_verified and two_factor_enabled
--   — every column MediLink writes — remain granted. Nothing MediLink does is
--   affected. service_role is untouched, so all HAMS server writes continue.
--
-- ROLLBACK
--   GRANT UPDATE (<column>) ON public.profiles TO authenticated;
--   for whichever column needs restoring. Per-column, so a mistake here is
--   recoverable one column at a time without reopening anything else.
--
-- VERIFY AFTER PUSHING — expect exactly these 8 rows and nothing else
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee='authenticated'
--   ORDER BY column_name;
--   -- full_name, language, notification_prefs, phone, phone_verified,
--   -- push_tokens, theme_preference, two_factor_enabled

REVOKE UPDATE (
  auth_masked,
  consent_flags,
  consent_ip,
  consent_version,
  consented_at,
  created_at,
  deletion_requested_at,
  email,
  export_request_count,
  full_name_ar,
  full_name_ar_status,
  id,
  last_export_at,
  muted_facilities,
  updated_at
) ON public.profiles FROM authenticated;

-- anon holds nothing after 20260801000002 and must stay that way; it can never
-- satisfy `id = auth.uid()` under profiles_update_own regardless.
REVOKE UPDATE ON public.profiles FROM anon;

COMMENT ON COLUMN public.profiles.full_name_ar_status IS
  'machine_unverified | admin_entered | verified. Server-owned: UPDATE is revoked '
  'from authenticated so a user cannot certify their own Arabic name. Written by '
  'clinic staff through the Phase 5.3 admin routes, which use the service client.';

COMMENT ON COLUMN public.profiles.email IS
  'Mirror of auth.users.email, maintained by the service-role invite routes. '
  'UPDATE revoked from authenticated: five invite routes and checkEmailAvailable '
  'resolve an auth user id from this column, so a client-writable value would let '
  'a user squat or misdirect an invited address.';
