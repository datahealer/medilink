-- Feature F3 · BP-1 — "Available Today" is slot-based, not status-based
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Booking & Payment §1 (Option 2)
-- and Implementation Phases → Phase BP-1.
--
-- Discovery must reflect whether a doctor has a REAL bookable slot today, ignoring
-- the runtime `doctors.status` (available/with_patient/on_break/unavailable). This
-- set-based RPC returns the ids of doctors that have, for today's weekday, at least
-- one template slot (excluding `walkin_reserved`) NOT already taken by a
-- pending/confirmed/checked_in non-emergency appointment on that date — the exact
-- set-difference logic used by `get_available_slots`, computed once across all
-- doctors (no per-doctor N+1).
--
-- Additive & reversible (function only; no schema/table change). `doctors.status`
-- columns are left untouched (kept for future features).
--
-- NOTE: BP-3 will extend the "taken" predicate to also treat an EXPIRED unpaid
-- `pending` hold as free (once `appointments.hold_expires_at` exists). This BP-1
-- version mirrors the current `get_available_slots` predicate.
--
-- Grants: authenticated (mirrors get_available_slots). Anon EXECUTE for guest
-- browsing is intentionally NOT granted here — that belongs to the Guest Mode
-- feature's RLS audit (plan §Guest §6 / R1), not to BP-1.

CREATE OR REPLACE FUNCTION public.doctors_available_today(p_date DATE)
RETURNS TABLE (doctor_id UUID)
LANGUAGE sql
STABLE
AS $$
  WITH template_slots AS (
    SELECT
      da.doctor_id,
      (slot->>'start')::TIME               AS start_time,
      COALESCE(slot->>'type', 'normal')    AS slot_type
    FROM public.doctor_availability da,
         LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.day_of_week = EXTRACT(DOW FROM p_date)::INT
  )
  SELECT DISTINCT ts.doctor_id
  FROM template_slots ts
  WHERE ts.slot_type <> 'walkin_reserved'
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.doctor_id   = ts.doctor_id
        AND a.slot_date   = p_date
        AND a.slot_start  = ts.start_time
        AND a.status IN ('pending','confirmed','checked_in')
        AND a.is_emergency = FALSE
    );
$$;

GRANT EXECUTE ON FUNCTION public.doctors_available_today(DATE) TO authenticated;
