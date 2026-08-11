-- Phase 5.3 — make Arabic-name verification actually mean something
--
-- WHY THIS IS NEEDED BEFORE THE FEATURE
-- -------------------------------------
-- 20260716000001 added doctors.full_name_ar / full_name_ar_status and
-- facilities.name_ar / name_ar_status, each CHECK-constrained to
-- machine_unverified | admin_entered | verified. MediLink gates display on that
-- status — mobile/src/utils/localizedName.ts shows the Arabic value only when
-- the status is 'verified' or 'admin_entered', on the stated premise that those
-- two states are human-confirmed by HAMS.
--
-- Nothing enforces that premise. RLS on doctors is:
--
--   CREATE POLICY "doctors_self_update" ON public.doctors FOR UPDATE TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--
-- RLS is row-scoped and cannot restrict columns, so a doctor can PATCH their own
-- doctors row and set full_name_ar to anything with full_name_ar_status =
-- 'verified'. It then renders to every Arabic-locale patient in MediLink as a
-- verified clinician name. facilities.name_ar_status has the same exposure
-- through facilities_admin_write.
--
-- So the verification workflow this phase builds would be decorative: the thing
-- it certifies is writable by the party being certified. These four columns have
-- to be server-owned first.
--
-- WHY A TABLE-LEVEL REVOKE AND A PER-COLUMN RE-GRANT
-- --------------------------------------------------
-- Same trap that made 20260730000001 a silent no-op: a column-level REVOKE does
-- not subtract from a table-level grant, and Supabase bootstraps
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`. The only
-- shape that works is to drop the table-wide UPDATE and grant back the columns
-- that should stay writable.
--
-- The re-grant list is computed from information_schema, so every column except
-- the locked ones keeps exactly the access it has today. A doctor editing their
-- own profile, or an admin editing facility details, is unaffected — only the
-- four Arabic-name columns change hands.
--
-- BLAST RADIUS — TRACED, NOT ASSUMED
--   HAMS      grep for full_name_ar / name_ar across src/ returns ZERO matches
--             outside the generated types. No HAMS code writes these columns
--             today; the Phase 5.3 routes added alongside this migration write
--             them with the service client.
--   MediLink  reads only. shared/src/api/facilities.ts selects name_ar and
--             name_ar_status; mobile/src/data/real/index.ts maps
--             doctor.full_name_ar through to the UI. No writer exists in
--             shared/, mobile/, frontend/ or backend/.
--   service_role is untouched, so every server path keeps working.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It does not touch profiles.full_name_ar — 20260802000001 already revokes
--   that pair. It does not change any RLS policy, CHECK constraint, column or
--   enum. It adds no new state. Purely a privilege change.
--
-- ROLLBACK
--   GRANT UPDATE ON public.doctors    TO authenticated;
--   GRANT UPDATE ON public.facilities TO authenticated;
--   Restores the table-wide grants, and with them the self-certification hole.
--
-- VERIFY AFTER PUSHING
--   -- (a) expect ZERO rows
--   SELECT table_name, grantee, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema='public' AND privilege_type='UPDATE'
--     AND grantee IN ('authenticated','anon')
--     AND ((table_name='doctors'    AND column_name IN ('full_name_ar','full_name_ar_status'))
--       OR (table_name='facilities' AND column_name IN ('name_ar','name_ar_status')));
--
--   -- (b) expect ZERO rows — no table-wide UPDATE left to mask the above
--   SELECT table_name, grantee FROM information_schema.table_privileges
--   WHERE table_schema='public' AND table_name IN ('doctors','facilities')
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon');
--
--   -- (c) sanity: a doctor's ordinary columns are still writable
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='doctors'
--     AND privilege_type='UPDATE' AND grantee='authenticated'
--     AND column_name IN ('bio','consultation_fee','specialty');
--   -- expect all three present

DO $$
DECLARE
  v_targets CONSTANT text[][] := ARRAY[
    ARRAY['doctors',    'full_name_ar,full_name_ar_status'],
    ARRAY['facilities', 'name_ar,name_ar_status']
  ];
  v_table   text;
  v_locked  text[];
  v_columns text;
  i         int;
BEGIN
  FOR i IN 1 .. array_length(v_targets, 1) LOOP
    v_table  := v_targets[i][1];
    v_locked := string_to_array(v_targets[i][2], ',');

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = v_table
      AND NOT (column_name = ANY (v_locked));

    IF v_columns IS NULL THEN
      RAISE EXCEPTION '% has no grantable columns — aborting rather than locking the table', v_table;
    END IF;

    -- Drop the table-wide UPDATE that would otherwise mask any column REVOKE.
    EXECUTE format('REVOKE UPDATE ON public.%I FROM authenticated', v_table);
    EXECUTE format('REVOKE UPDATE ON public.%I FROM anon', v_table);

    -- Clear leftover column grants so the resulting state is deterministic.
    EXECUTE format('REVOKE UPDATE (%s) ON public.%I FROM authenticated', v_columns, v_table);
    EXECUTE format('REVOKE UPDATE (%s) ON public.%I FROM anon', v_columns, v_table);

    -- Grant back everything except the Arabic-name pair, to authenticated only.
    EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated', v_columns, v_table);

    RAISE NOTICE '%: UPDATE re-granted on all columns except %', v_table, v_locked;
  END LOOP;
END $$;

COMMENT ON COLUMN public.doctors.full_name_ar_status IS
  'machine_unverified | admin_entered | verified. Server-owned — UPDATE revoked '
  'from authenticated so a doctor cannot certify their own Arabic name. Written '
  'only by the Phase 5.3 admin routes via the service client. MediLink displays '
  'full_name_ar only when this is admin_entered or verified.';

COMMENT ON COLUMN public.facilities.name_ar_status IS
  'machine_unverified | admin_entered | verified. Server-owned — UPDATE revoked '
  'from authenticated so a facility admin cannot certify their own clinic name. '
  'Written only by the Phase 5.3 admin routes via the service client.';
