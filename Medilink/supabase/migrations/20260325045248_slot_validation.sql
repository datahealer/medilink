CREATE OR REPLACE FUNCTION public.validate_slot_overlap(
  new_slots JSONB[],
  existing_slots JSONB[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ns JSONB;
  es JSONB;
BEGIN
  FOR ns IN SELECT * FROM unnest(new_slots)
  LOOP
    FOR es IN SELECT * FROM unnest(existing_slots)
    LOOP
      IF (
        (ns->>'start')::time < (es->>'end')::time AND
        (ns->>'end')::time > (es->>'start')::time
      ) THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN TRUE;
END;
$$;