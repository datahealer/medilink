-- Feature F4 · Guest Mode (R1) — make `doctors_available_today` executable by anon
--
-- BACKGROUND
-- Discovery search calls `doctors_available_today(date)` for every result set to flag
-- the "Available today" badge. Guest Mode granted anon EXECUTE on it
-- (20260717000003_guest_anon_availability_grants.sql), but the function is a plain
-- SECURITY INVOKER SQL function whose body reads `public.appointments` — a table anon
-- has NO grant on. So an anonymous (guest) call raises "permission denied for table
-- appointments", which propagated up and BLANKED the guest doctor list.
--
-- FIX
-- Recreate the function as SECURITY DEFINER with a locked search_path. The body is
-- byte-for-byte the current definition (20260717000002_pending_hold_ttl.sql §4b) — the
-- ONLY change is the security model. This is safe because the function:
--   • returns ONLY doctor_id UUIDs (no patient/appointment data is exposed), and
--   • is strictly read-only (no writes).
-- It ALSO corrects a latent bug for authenticated callers: under SECURITY INVOKER the
-- appointments sub-select was filtered by the caller's own RLS, so slots booked by
-- OTHER patients were mis-reported as free. Running as definer sees all rows → correct
-- availability for everyone.
--
-- Additive & reversible: to roll back, re-run the 20260717000002 definition (which
-- omits SECURITY DEFINER). Existing GRANTs (authenticated + anon) survive CREATE OR
-- REPLACE, so no re-grant is needed.
--
-- ⚠️ Requires `npm run db:push`. Before enabling guest live reads in production, run the
-- mandatory staging RLS test (Guest Mode §14): confirm anon CAN execute this RPC and
-- read discovery tables, and is still DENIED on patient tables + booking RPCs.

CREATE OR REPLACE FUNCTION public.doctors_available_today(p_date DATE)
RETURNS TABLE (doctor_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH template_slots AS (
    SELECT
      da.doctor_id,
      (slot->>'start')::TIME               AS start_time,
      COALESCE(slot->>'type', 'normal')    AS slot_type,
      COALESCE(fs.booking_window_days, 7)  AS window_days
    FROM public.doctor_availability da
    JOIN public.doctors d ON d.id = da.doctor_id
    LEFT JOIN public.facility_settings fs ON fs.facility_id = d.facility_id
    CROSS JOIN LATERAL jsonb_array_elements(da.slots) AS slot
    WHERE da.day_of_week = EXTRACT(DOW FROM p_date)::INT
  )
  SELECT DISTINCT ts.doctor_id
  FROM template_slots ts
  WHERE ts.slot_type <> 'walkin_reserved'
    AND p_date >= CURRENT_DATE
    AND p_date <= (CURRENT_DATE + (ts.window_days - 1))
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.doctor_id   = ts.doctor_id
        AND a.slot_date   = p_date
        AND a.slot_start  = ts.start_time
        AND a.is_emergency = FALSE
        AND (
          a.status IN ('confirmed','checked_in')
          OR (a.status = 'pending' AND (a.hold_expires_at IS NULL OR a.hold_expires_at >= now()))
        )
    );
$$;
