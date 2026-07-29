-- ============================================================================
-- PHASE 2 — Patient row access to queue_items
-- ============================================================================
-- Written after (a) a chronological audit of the 121 local migrations and
-- (b) a live comparison against the linked project zojrwuvxrkmgnlwyuypg.
--
-- IMPORTANT CONTEXT: the remote database is 25 migrations ahead of this repo
-- (2026-06-20 .. 2026-07-26) and those files are not present locally. Their
-- contents could not be retrieved (supabase db pull / db dump both require
-- Docker, which is unavailable on this machine).
--
-- Everything below is therefore written to be ADDITIVE and IDEMPOTENT: it
-- never rewrites an object whose current remote definition is unknown.
-- Specifically, `queue_items_access` is deliberately NOT altered — an
-- ALTER POLICY would silently discard any branch added by one of the 25
-- unseen migrations. Technician access is granted by a separate permissive
-- policy instead; permissive policies OR together, so the effect is the same
-- while nothing existing is overwritten.
--
-- Verified directly against the remote database before writing:
--   * queue_items columns              -> no acknowledgement columns yet
--   * queue_items indexes              -> ix_queue_items_appointment_id absent
--   * public RPC inventory             -> get_my_queue_position absent
--                                      -> _owns_appointment(p_id) ALREADY EXISTS
--   * queue_status enum                -> unchanged (waiting|called|done|expired)
--
-- NOT verifiable without Docker, and therefore called out in the handover:
--   * whether queue_items_staff_only still exists remotely
--   * whether a patient policy already exists under a different name
-- Both are handled defensively below.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Ownership helper — REUSED, NOT RECREATED
-- ---------------------------------------------------------------------------
-- The live database already exposes:
--     public._owns_appointment(p_id UUID) RETURNS boolean
-- An earlier draft of this migration introduced an identical
-- `is_my_appointment()`. That would have been a duplicate RPC, so it was
-- dropped in favour of the existing function.
--
-- ── SCHEMA DRIFT FIXED HERE ─────────────────────────────────────────────────
-- _owns_appointment exists on the linked project but is defined in NO
-- migration in the 146-file history. It was created manually (dashboard/psql).
-- 20260713000001_add_checkin_my_appointment_rpc.sql already recovered its
-- caller the same way and its header notes the dependency on the
-- "already-present public._owns_appointment" — but the helper itself was
-- never committed. A fresh `supabase db reset` therefore produces a database
-- where checkin_my_appointment() compiles but fails at runtime.
--
-- Created below ONLY when absent, so the live definition is never overwritten:
--   * fresh/local environments  -> function is created, deploys become
--                                  reproducible
--   * the linked project        -> untouched no-op
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_owns_appointment'
      AND p.pronargs = 1
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public._owns_appointment(p_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.appointments a
          JOIN public.patient_profiles pp ON pp.id = a.patient_id
          WHERE a.id = p_id
            AND pp.user_id = auth.uid()
        );
      $body$;
    $fn$;

    COMMENT ON FUNCTION public._owns_appointment(UUID) IS
      'Recovered from live schema drift by 20260728000002. True when the '
      'appointment belongs to the calling user''s patient profile.';
  END IF;
END $$;

-- Idempotent regardless of which branch ran above.
GRANT EXECUTE ON FUNCTION public._owns_appointment(UUID) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Retire the orphaned unscoped staff policy
-- ---------------------------------------------------------------------------
-- The base schema created `queue_items_staff_only`
-- (20260319071603_hams_complete_schema.sql:767) with NO facility scoping:
--     USING (profiles.role IN ('facility_admin','doctor','technician','super_admin'))
--
-- Two later migrations meant to replace it —
--     20260422102441_new_staff_role_migration.sql:44
--     20260422103305__f20_f22_production_fixes.sql:75
-- — both run `DROP POLICY IF EXISTS queue_items_access`, a policy that did not
-- exist at the time, and never drop `queue_items_staff_only`.
--
-- In the local history both policies are therefore live, and because
-- permissive policies are OR-ed the unscoped one wins: the facility isolation
-- added in April never took effect. Dropping the orphan is what makes
-- `queue_items_access` real.
--
-- Safe either way: a no-op if one of the 25 remote migrations already did this.
DROP POLICY IF EXISTS queue_items_staff_only ON public.queue_items;


-- ---------------------------------------------------------------------------
-- 3. Technician read access — additive, replaces what the drop removes
-- ---------------------------------------------------------------------------
-- `queue_items_staff_only` was the only grant of queue access to technicians,
-- and src/lib/sidebarConfig.ts:284 still shows them a Queue menu entry.
-- Removing it outright would break a capability that exists in production.
--
-- Granted as its own SELECT-only policy rather than by altering
-- `queue_items_access`, so no unknown remote branch of that policy is lost.
-- Net change for technicians: unscoped read+write -> own-facility read-only.
DROP POLICY IF EXISTS queue_items_technician_read ON public.queue_items;

CREATE POLICY queue_items_technician_read
ON public.queue_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.technicians t
    WHERE t.user_id = auth.uid()
      AND t.facility_id = queue_items.facility_id
      AND t.is_active = TRUE
  )
);


-- ---------------------------------------------------------------------------
-- 4. Patient read access
-- ---------------------------------------------------------------------------
-- Ownership runs through the appointment — the only trustworthy link.
-- queue_items.patient_name is a denormalised display snapshot and the table
-- has no patient_id column.
--
-- Deliberate consequences:
--   * Reception walk-ins have appointments.patient_id = NULL, so no user owns
--     them and they stay invisible to every patient. Correct.
--   * Appointments booked for a family member (for_family_member_id) remain
--     owned by the booking account, so the payer can track them.
--   * SELECT only. No WITH CHECK clause is contributed, so this policy cannot
--     enable any patient write. Patient writes go through
--     acknowledge_queue_call() instead.
DROP POLICY IF EXISTS queue_items_patient_read ON public.queue_items;

CREATE POLICY queue_items_patient_read
ON public.queue_items
FOR SELECT
TO authenticated
USING (public._owns_appointment(appointment_id));

COMMENT ON POLICY queue_items_patient_read ON public.queue_items IS
  'Patients read only queue rows whose appointment belongs to them, via the '
  'pre-existing public._owns_appointment(). SELECT only; patient writes go '
  'through acknowledge_queue_call().';


-- ---------------------------------------------------------------------------
-- 5. Index
-- ---------------------------------------------------------------------------
-- Confirmed against the live database (supabase inspect db index-stats).
-- queue_items currently carries exactly these, none of which are recreated:
--   queue_items_pkey
--   ix_queue_items_facility_id
--   ix_queue_items_status
--   ix_queue_items_facility_status
--   ix_queue_items_facility_position
--   unique_active_queue_position     (partial: waiting|called)
--   unique_appointment_active_queue  (partial: waiting|called, on appointment_id)
--
-- appointment_id is covered only by the PARTIAL unique index above, which
-- excludes completed rows. get_my_queue_position() also reads recently-done
-- rows, so a plain index is genuinely missing.
CREATE INDEX IF NOT EXISTS ix_queue_items_appointment_id
  ON public.queue_items (appointment_id);
