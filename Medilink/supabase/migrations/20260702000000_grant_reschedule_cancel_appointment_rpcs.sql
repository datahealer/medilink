-- Fix: grant EXECUTE on the F-20 patient appointment RPCs that were never granted.
--
-- ROOT CAUSE
--   `reschedule_appointment_atomic` (called by @medilink/shared
--   api.appointments.rescheduleAppointment) and `cancel_appointment_safe`
--   (called by api.appointments.cancelAppointment) were introduced during the
--   F-20 work (20260422102911 → 20260501000003). Unlike their sibling
--   `book_appointment_atomic` — which received a dedicated grant migration
--   (20260430000005) — these two never got a `GRANT EXECUTE`. In this project the
--   `authenticated` role only receives function EXECUTE via explicit grants
--   (there is no `ALTER DEFAULT PRIVILEGES`/blanket grant), so the reschedule RPC
--   returned:  42501  "permission denied for function reschedule_appointment_atomic".
--
-- WHY THIS IS SAFE (no privilege escalation / no RLS bypass)
--   Both functions are SECURITY INVOKER and write to public.appointments, which is
--   protected by the `appointments_patient_update` RLS policy:
--       USING (patient_id IN (SELECT id FROM public.patient_profiles
--                             WHERE user_id = auth.uid()) AND public.aal2_or_no_2fa())
--   EXECUTE only lets the caller invoke the wrapper; the UPDATE inside still runs as
--   the caller and is constrained by RLS to their OWN appointments. This mirrors the
--   existing book_appointment_atomic grant exactly. Grants are idempotent.
--
-- Signatures match the currently-deployed definitions (20260501000003).

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(UUID, UUID, DATE, TIME, TIME, BOOLEAN)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_safe(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated, service_role;
