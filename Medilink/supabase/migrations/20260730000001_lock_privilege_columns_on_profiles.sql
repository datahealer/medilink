-- Phase 5 — P0: stop a signed-in user from granting themselves a role
--
-- THE VULNERABILITY
-- -----------------
-- public.profiles is protected by:
--
--   CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
--     USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--   (20260319071603, replaced verbatim by 20260319104323)
--
-- The policy restricts WHICH ROW you may update but says nothing about WHICH
-- COLUMNS. Any authenticated user can therefore
--
--   PATCH /rest/v1/profiles?id=eq.<their own id>   {"role":"super_admin"}
--
-- straight from the browser or the mobile app, and become a super_admin. The
-- same request can set `facility_id` (choosing which clinic's data to see) and
-- `status` (un-suspending a disabled account).
--
-- This was reported as P0 in the MediLink team's own API_AUDIT_REPORT.md, where
-- they escalated a patient to facility_admin against the live database and then
-- restored the row. Confirmed here against the committed schema.
--
-- It defeats every other control in the system: RLS on appointments,
-- prescriptions and queue_items keys off the caller's role, and the HAMS
-- middleware added in Phase 4 refuses `role = 'patient'` at /dashboard — a
-- patient simply rewrites their role first. `hams_handle_new_user` and
-- /api/auth/signup both force role='patient' on creation, which is exactly why
-- the post-creation write path is the hole.
--
-- THE FIX
-- -------
-- PostgreSQL RLS cannot express a column restriction, and WITH CHECK cannot see
-- the previous row, so this is done with column-level privileges — the native
-- mechanism for exactly this. A REVOKE on specific columns is enforced before
-- RLS is even consulted.
--
-- Only three columns are locked. They are the privilege-bearing ones:
--   role         — who you are in the system
--   facility_id  — whose clinic data you are scoped to
--   status       — whether your account is active or suspended
--
-- Everything a user legitimately edits about themselves stays writable:
-- full_name, phone, language, theme_preference, notification_prefs,
-- consent_flags, avatar/photo, and the 2FA/phone flags.
--
-- WHY THAT COLUMN SET IS SAFE (verified in both repositories)
--   HAMS   — every write to role/facility_id/status goes through the
--            service-role client: invitations/accept, auth/set-password,
--            */invite, facilities/[id]/admins/[uid], facilities/[id]/status.
--            No browser code writes them (grep over src/**/*.tsx: zero hits).
--   MediLink — shared/src/api/profile.ts::updateMyProfile builds its patch from
--            an explicit allow-list and only ever sends full_name and phone to
--            `profiles`. It never references role, facility_id or status.
--
-- service_role keeps its grant, so every legitimate server path is unaffected.
--
-- NOT LOCKED, DELIBERATELY
--   phone_verified — /api/auth/verify-otp updates it with the USER's client,
--     and MediLink's backend carries a copy of that route. Revoking it would
--     break phone verification in both apps. It is a weaker trust flag (a user
--     could self-verify), and the OTP flow is already self-verifiable because
--     the code is stored in plaintext in a row the user can read — tracked
--     separately. Fixing it belongs with the OTP rework, not here.
--   two_factor_enabled — written by /api/auth/2fa/verify and /2fa/disable with
--     the user's own client. Self-service by design.
--
-- ROLLBACK
--   GRANT UPDATE (role, facility_id, status) ON public.profiles TO authenticated;
--   (and to anon, though anon cannot satisfy the RLS policy anyway)
--   Reverting restores the vulnerability; it is here only for completeness.
--
-- Idempotent: REVOKE on an already-revoked privilege is a no-op.

-- `authenticated` is the role every logged-in Supabase client runs as.
REVOKE UPDATE (role)        ON public.profiles FROM authenticated;
REVOKE UPDATE (facility_id) ON public.profiles FROM authenticated;
REVOKE UPDATE (status)      ON public.profiles FROM authenticated;

-- `anon` cannot pass `id = auth.uid()` today, but revoke as defence in depth in
-- case a future policy ever admits it.
REVOKE UPDATE (role)        ON public.profiles FROM anon;
REVOKE UPDATE (facility_id) ON public.profiles FROM anon;
REVOKE UPDATE (status)      ON public.profiles FROM anon;

COMMENT ON COLUMN public.profiles.role IS
  'Privilege-bearing. UPDATE is revoked from authenticated/anon (Phase 5, '
  '20260730000001) — a row-scoped RLS policy alone let users self-assign a '
  'role. Server-side writes use the service-role client.';

COMMENT ON COLUMN public.profiles.facility_id IS
  'Privilege-bearing (clinic scoping). UPDATE revoked from authenticated/anon '
  '— see 20260730000001.';

COMMENT ON COLUMN public.profiles.status IS
  'Privilege-bearing (account suspension). UPDATE revoked from '
  'authenticated/anon — see 20260730000001.';
