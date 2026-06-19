-- =========================================================
-- F25: RPC PERMISSIONS (EXECUTE ACCESS)
-- =========================================================

-- Allow authenticated users to call get_available_slots
GRANT EXECUTE ON FUNCTION public.get_available_slots(
  UUID,
  DATE,
  BOOLEAN
) TO authenticated;


-- Allow authenticated users to call book_appointment_atomic
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(
  UUID,
  UUID,
  UUID,
  DATE,
  TIME,
  TEXT,
  BOOLEAN
) TO authenticated;


-- OPTIONAL: Allow anon (only if needed for public access)
-- GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN) TO anon;


-- =========================================================
-- DONE ✅
-- =========================================================