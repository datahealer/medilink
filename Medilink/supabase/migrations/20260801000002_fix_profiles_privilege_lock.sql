-- Phase 5 — P0 HOTFIX: 20260730000001 did not actually lock anything
--
-- WHAT WENT WRONG
-- ---------------
-- 20260730000001 tried to close the privilege-escalation hole with:
--
--     REVOKE UPDATE (role)        ON public.profiles FROM authenticated;
--     REVOKE UPDATE (facility_id) ON public.profiles FROM authenticated;
--     REVOKE UPDATE (status)      ON public.profiles FROM authenticated;
--
-- Those statements ran without error and changed nothing. In PostgreSQL a
-- column-level REVOKE only removes column-level grants; it does NOT subtract
-- from a TABLE-level grant that already implies the same privilege. Supabase's
-- bootstrap does `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
-- authenticated`, so public.profiles carries a table-wide UPDATE that keeps
-- covering every column, including the three above.
--
-- Confirmed against production after that migration was applied:
--
--   SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
--   WHERE table_name='profiles' AND privilege_type='UPDATE'
--     AND column_name IN ('role','facility_id','status');
--   -- anon/authenticated x role/facility_id/status  -> 6 rows, all still granted
--
-- The vulnerability is therefore still open: any signed-in user can
--   PATCH /rest/v1/profiles?id=eq.<self>  {"role":"super_admin"}
-- because profiles_update_own is row-scoped (id = auth.uid()) and says nothing
-- about columns. That defeats every role check in the system, including the
-- Phase 4 middleware that refuses role='patient' at /dashboard — a patient
-- simply rewrites their role first.
--
-- THE CORRECT SHAPE
-- -----------------
-- Revoke UPDATE at the TABLE level, then grant it back column by column for
-- everything except the three privilege-bearing columns. After this,
-- `authenticated` holds no table-wide UPDATE, so the only columns it can write
-- are the ones explicitly listed.
--
-- The safe column list is built dynamically from information_schema rather than
-- typed out, so it cannot drift from the real table or miss a column that was
-- added since. Any column added to profiles in future will be NOT grantable by
-- default, which is the safer direction.
--
-- anon is revoked outright and given nothing back: it cannot satisfy
-- `id = auth.uid()` under RLS, so it has no legitimate UPDATE on this table at
-- all.
--
-- WHY THESE THREE
--   role         — who you are in the system
--   facility_id  — whose clinic's data you are scoped to
--   status       — whether your account is active or suspended
-- Everything else a user legitimately edits about themselves stays writable:
-- full_name, phone, language, theme_preference, notification_prefs,
-- consent_flags, push_tokens, phone_verified, two_factor_enabled, and the
-- Arabic name fields.
--
-- VERIFIED SAFE IN BOTH REPOSITORIES (unchanged from 20260730000001)
--   HAMS     — every write to role/facility_id/status uses the service-role
--              client (invitations/accept, auth/set-password, */invite,
--              facilities/[id]/admins/[uid], facilities/[id]/status). No
--              browser code writes them.
--   MediLink — shared/src/api/profile.ts::updateMyProfile builds its patch from
--              an explicit allow-list and only ever sends full_name and phone.
--   service_role keeps its own grant and is unaffected.
--
-- VERIFY AFTER PUSHING — do not assume this time
--   -- (a) expect ZERO rows
--   SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon')
--     AND column_name IN ('role','facility_id','status');
--
--   -- (b) expect full_name and phone (and the other safe columns) present
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee='authenticated'
--   ORDER BY column_name;
--
--   -- (c) expect NO table-level UPDATE for authenticated/anon
--   SELECT grantee, privilege_type FROM information_schema.table_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon');
--
-- ROLLBACK
--   GRANT UPDATE ON public.profiles TO authenticated, anon;
--   (restores the table-wide grant — and the vulnerability)

DO $$
DECLARE
  v_locked  CONSTANT text[] := ARRAY['role', 'facility_id', 'status'];
  v_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND NOT (column_name = ANY (v_locked));

  IF v_columns IS NULL THEN
    RAISE EXCEPTION 'profiles has no grantable columns — aborting rather than locking the table';
  END IF;

  -- 1. Drop the table-wide UPDATE that was masking the column REVOKEs.
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM anon';

  -- 2. Clear any leftover column grants so the state is deterministic.
  EXECUTE format('REVOKE UPDATE (%s) ON public.profiles FROM authenticated', v_columns);
  EXECUTE format('REVOKE UPDATE (%s) ON public.profiles FROM anon', v_columns);

  -- 3. Grant back only the safe columns, and only to authenticated.
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_columns);

  RAISE NOTICE 'profiles UPDATE now limited to: %', v_columns;
END $$;

-- Belt and braces: these three must never be writable by a client role, even
-- if a future GRANT ALL re-runs. Harmless no-ops after the block above.
REVOKE UPDATE (role)        ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (facility_id) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (status)      ON public.profiles FROM authenticated, anon;

COMMENT ON COLUMN public.profiles.role IS
  'Privilege-bearing. Table-level UPDATE is revoked from authenticated/anon and '
  're-granted per column excluding this one (20260801000002). The earlier '
  'column-only REVOKE in 20260730000001 was ineffective because a table-level '
  'grant implies column privileges. Server writes use the service-role client.';
