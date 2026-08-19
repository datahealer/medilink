-- =============================================================================
-- Remove the blanket appointments SELECT policy, after adding the three scopes it hides
-- =============================================================================
-- ⚠️ NOT APPLIED. Prepared for review. Touches a table shared by MediLink and HAMS.
-- ⚠️ HAS A CODE PREREQUISITE — see "BEFORE APPLYING" below. Applying this alone will break
--    HAMS slot availability display.
--
-- ── THE DEFECT (audit finding C-2) ──
--
-- `public.appointments` carries eleven policies. One of them is:
--
--     "Allow realtime read for authenticated"   SELECT   authenticated   USING (true)
--
-- and the only RESTRICTIVE policy on the table is `account_active_required USING
-- account_is_active()`. A row is visible when ANY permissive policy passes AND ALL restrictive
-- ones pass, so `true` AND `account_is_active()` means: every authenticated user with an active
-- account can read EVERY appointment row. Measured against production 2026-08-19: 218
-- appointments, readable by all 157 patients and every other signed-in user.
--
-- That is cross-tenant PHI — who saw which doctor, when, at which facility, with what reference
-- number and status. MediLink patients and HAMS staff share one Supabase Auth project, so a
-- MediLink patient is an "authenticated user" of HAMS's data.
--
-- It also nullifies the AAL2 gate: `appointments_patient_read` is
-- `... AND aal2_or_no_2fa()`, but the blanket policy grants the same rows without it.
--
-- The policy is in NEITHER repository's migrations — like "Public read doctors" and "Public read
-- facilities" it was created out of band through the dashboard. Its name suggests it was added to
-- make a Supabase Realtime subscription deliver rows, which needs SELECT visibility.
--
-- ── WHY DROPPING IT ALONE IS NOT SAFE ──
--
-- Three legitimate readers depend on it, because no scoped policy covers them:
--
--   facility_admin — `appointments_facility_members` scopes by the `facility_members` table, but
--                    only 29 rows exist there against 114 staff; 113 staff have no row at all.
--                    Measured: of 49 facility_admins, 7 would lose access that the new
--                    facility_admins-scoped policy below restores. The rest hold no live grant,
--                    or administer facilities with no appointments, and are correctly excluded.
--   staff          — role='staff' has NO appointments policy either, and no staff user holds a
--                    facility_members row. Their mapping is `facility_staff` (3 profiles, 3 rows,
--                    1:1, and no row belongs to a non-staff user). They legitimately reach 132 of
--                    218 appointments; without a policy they would reach none.
--   super_admin    — has NO appointments policy whatsoever. Today it reads rows only because of
--                    the blanket policy. One super_admin account exists.
--
-- So this migration ADDS all three scopes first and drops the blanket policy last, in one transaction.
--
-- ── WHAT IS **NOT** AT RISK (each verified, not assumed) ──
--
-- DOUBLE BOOKING — cannot happen. Two partial unique indexes enforce slot uniqueness
-- independently of RLS, because a unique index is a constraint, not a visibility rule:
--     unique_slot_normal    (doctor_id, slot_date, slot_start) WHERE is_emergency = false
--     uq_appointment_slot   (doctor_id, slot_date, slot_start) WHERE status IN (pending,…)
-- `book_appointment_atomic` additionally serialises on
-- `pg_advisory_xact_lock(slot_lock_key(...))` and references `appointments` exactly once — the
-- INSERT. It performs no SELECT-based conflict check to break.
--
-- FUNCTIONS — of 32 functions whose body references `appointments`, 27 are SECURITY DEFINER and
-- bypass RLS entirely. Of the 5 SECURITY INVOKER ones: `get_facility_earnings` is not executable
-- by `authenticated`; `book_appointment_atomic` only inserts (its INSERT…RETURNING row is
-- visible to the patient under `appointments_patient_read`, which passes because
-- `aal2_or_no_2fa()` returns true unconditionally for role='patient'); and
-- `cancel_appointment_safe`, `reschedule_appointment_atomic` and `handle_waitlist_on_cancel`
-- carry no ownership check of their own but were never protected by SELECT anyway — their writes
-- are already constrained by the scoped UPDATE policies (`appointments_patient_update`,
-- `appointments_doctor_update`, `appointments_facility_members`). Narrowing SELECT makes them
-- strictly more correct: a stranger currently sees a row it cannot modify.
--
-- MEDILINK — unaffected. Every `appointments` read in `shared/src/api/appointments.ts` is
-- `.eq("patient_id", <own profile id>)`; availability comes from the SECURITY DEFINER
-- `get_available_slots` / `doctors_available_today`; check-in goes through
-- `checkin_my_appointment`; holds through `release_unpaid_hold`. Realtime subscribes to
-- `queue_items`, not `appointments`.
--
-- ── BEFORE APPLYING — REQUIRED CODE CHANGE IN HAMS ──
--
-- ONE HAMS route reads OTHER patients' appointments through the CALLER's client to work out which
-- slots are taken:
--
--     src/app/api/slots/route.ts    select("slot_start") eq(doctor_id) eq(slot_date) in(status)
--
-- (`facilities/[id]/available-slots/route.ts` is NOT a slot-availability endpoint despite its
-- name: it reads `.eq("patient_id", <own profile id>)`, i.e. the caller's own appointments. It is
-- already correctly scoped and is deliberately left alone.)
--
-- Once SELECT is scoped it returns only the caller's own rows, so every other patient's booking
-- renders as free. Booking still cannot double-book (the unique indexes hold), but a user would
-- pick a slot and the insert would fail.
--
-- Note this endpoint is ALREADY broken for signed-out visitors: `anon` has no SELECT policy on
-- appointments at all, so the occupancy query returns nothing and every slot shows as free. The
-- fix therefore repairs an existing bug as well as removing the RLS dependency.
--
-- The route now reads occupancy with the SERVICE client and a projection of exactly
-- `slot_start` — no patient-identifying column — which is all "this time is taken" requires.
-- `get_available_slots` and `slot_is_occupied` (both SECURITY DEFINER) remain available if a
-- future change prefers a function boundary.
--
-- Apply order: ship the route change, then this migration.
--
-- ── ROLLBACK ──
--
--   CREATE POLICY "Allow realtime read for authenticated" ON public.appointments
--     FOR SELECT TO authenticated USING (true);
--   DROP POLICY appointments_facility_admin_read ON public.appointments;
--   DROP POLICY appointments_staff_read          ON public.appointments;
--   DROP POLICY appointments_super_admin_read    ON public.appointments;
--
-- Rolling back restores the cross-tenant read. Prefer fixing forward.
-- =============================================================================

BEGIN;

-- ── 1. facility_admin: appointments at a facility the caller holds a LIVE grant on ──
--
-- Mirrors the predicate the HTTP routes already use for facility reports
-- (`facility_admins` + `revoked_at IS NULL`), so a revoked administrator loses read access at the
-- same moment they lose everything else. Deliberately NOT `facility_members`, which is the table
-- 113 of 114 staff are missing from.
DROP POLICY IF EXISTS appointments_facility_admin_read ON public.appointments;
CREATE POLICY appointments_facility_admin_read
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    facility_id IN (
      SELECT fa.facility_id
      FROM public.facility_admins fa
      WHERE fa.user_id = auth.uid()
        AND fa.revoked_at IS NULL
    )
  );

-- ── 2. staff: appointments at a facility they are ACTIVE staff of ──
--
-- `facility_staff` is the legitimate mapping for role='staff', established rather than assumed:
--   • 3 staff profiles, 3 facility_staff rows, and all 3 staff have one — a 1:1 match;
--   • 0 facility_staff rows belong to a user who is not role='staff';
--   • no staff user has a facility_members row, so the existing membership policy covers none;
--   • the HAMS staff UI itself derives the facility this way — StaffAppointments.tsx reads
--     facility_staff first and only falls back to facility_admins.
--
-- Without this policy the staff role loses `GET /api/appointments/emergency` (which permits
-- facility_admin, super_admin and staff, and scopes rows via RLS rather than in the query) and
-- the staff appointments dashboard. Measured: staff legitimately reach 132 of 218 appointments.
--
-- `is_active` is the liveness flag on this table, the counterpart of facility_admins.revoked_at.
DROP POLICY IF EXISTS appointments_staff_read ON public.appointments;
CREATE POLICY appointments_staff_read
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    facility_id IN (
      SELECT fs.facility_id
      FROM public.facility_staff fs
      WHERE fs.user_id = auth.uid()
        AND fs.is_active
    )
  );

-- ── 3. super_admin: global read, which is what the role means ──
--
-- Reads `profiles.role` rather than a JWT claim: the role lives in the database and a client
-- cannot patch another user's row into it. This is the only intentionally unscoped policy here.
DROP POLICY IF EXISTS appointments_super_admin_read ON public.appointments;
CREATE POLICY appointments_super_admin_read
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'::user_role
    )
  );

-- ── 4. Only now remove the blanket policy ──
--
-- Guarded: if the policy is already gone this is a no-op rather than an error, so the migration
-- is safe to re-run. The name is quoted because it contains spaces.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'appointments'
      AND p.polname = 'Allow realtime read for authenticated'
  ) THEN
    DROP POLICY "Allow realtime read for authenticated" ON public.appointments;
    RAISE NOTICE 'dropped the blanket appointments SELECT policy';
  ELSE
    RAISE NOTICE 'blanket policy already absent; nothing to drop';
  END IF;
END $$;

-- ── 5. Fail the transaction if any permissive SELECT policy on appointments is still `true` ──
--
-- The whole point of the migration is that no such policy remains. Asserting it here means a
-- future edit that reintroduces one cannot be applied silently alongside this file.
DO $$
DECLARE
  v_open int;
BEGIN
  SELECT count(*) INTO v_open
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'appointments'
    AND p.polpermissive
    AND p.polcmd IN ('r', '*')
    AND COALESCE(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true';

  IF v_open > 0 THEN
    RAISE EXCEPTION
      'refusing to commit: % permissive SELECT/ALL policy(ies) on appointments still use USING (true)',
      v_open;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION AFTER APPLYING (read-only)
-- =============================================================================
--   -- must be 0 — no permissive SELECT/ALL policy may be unconditional:
--   SELECT count(*) FROM pg_policy p
--     JOIN pg_class c ON c.oid = p.polrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname='public' AND c.relname='appointments' AND p.polpermissive
--      AND p.polcmd IN ('r','*')
--      AND COALESCE(pg_get_expr(p.polqual,p.polrelid),'true') = 'true';
--
--   -- must list exactly the scoped readers:
--   --   appointments_patient_read, appointments_doctor_read, appointments_technician_read,
--   --   appointments_facility_members, appointments_facility_admin_read,
--   --   appointments_staff_read, appointments_super_admin_read
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy p
--     JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname='appointments' AND p.polcmd IN ('r','*')
--    ORDER BY polname;
--
--   -- and the two-role isolation harness in supabase/tests/ proves a patient sees only
--   -- their own rows. That file must be run on a NON-PRODUCTION database.
-- =============================================================================
