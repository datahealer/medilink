-- Feature F4 · Guest Mode — anon EXECUTE on read-only availability RPCs
-- Ref: docs/MOBILE_FEATURE_IMPLEMENTATION_PLAN.md → Guest Mode §6 + R1 (resolves C2).
--
-- RLS AUDIT RESULT (verified in supabase/migrations/20260319071603_hams_complete_schema.sql):
-- the discovery TABLES already permit anonymous reads —
--   doctors_public_read     (is_active = TRUE)   + GRANT SELECT ... TO anon
--   facilities_public_read  (status = 'active')  + GRANT SELECT ... TO anon
--   reviews_public_read     (is_visible = TRUE)  + GRANT SELECT ... TO anon
--   specialties_public_read (true)
-- so a signed-out guest can already read doctors/clinics/reviews/specialties. No new
-- table policy is required.
--
-- The ONLY gap is EXECUTE on the read-only availability functions: guest search calls
-- `doctors_available_today` (and the slots picker uses `get_available_slots`), both of
-- which were granted to `authenticated` only. Per R1 we grant anon EXECUTE strictly to
-- these two READ-ONLY functions.
--
-- SECURITY: booking / reservation / payment RPCs are deliberately NOT granted to anon —
-- book_appointment_atomic, reschedule_appointment_atomic, cancel_appointment_safe,
-- release_unpaid_hold, checkin_my_appointment stay authenticated-only (defense in depth:
-- they also self-check auth.uid()). Additive & reversible (REVOKE).
--
-- ⚠️ Before enabling guest live reads in production, run the mandatory staging RLS test
-- (Guest Mode §14): anon CAN execute these two RPCs and read discovery tables, and anon
-- is DENIED on every patient table and on book_appointment_atomic.

GRANT EXECUTE ON FUNCTION public.doctors_available_today(DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, BOOLEAN) TO anon;
