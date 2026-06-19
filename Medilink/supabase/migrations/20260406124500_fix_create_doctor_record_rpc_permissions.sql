-- Allow authenticated app users to execute doctor creation RPC.
-- Required because /api/facilities/[id]/doctors calls create_doctor_record
-- using request user context (not service-role context).

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  TEXT,
  DATE
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_doctor_record(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT[],
  JSONB,
  TEXT,
  DATE
) TO service_role;
