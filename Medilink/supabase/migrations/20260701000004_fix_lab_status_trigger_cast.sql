-- Fix: recompute_lab_result_status() assigned a bare text CASE result to the
-- lab_results.status column (type public.lab_result_status), which Postgres rejects with
-- "column status is of type lab_result_status but expression is of type text". Cast the CASE
-- expression explicitly. Pure function replacement — no data/schema change.

CREATE OR REPLACE FUNCTION public.recompute_lab_result_status() RETURNS TRIGGER AS $$
DECLARE rid UUID; n INT;
BEGIN
  rid := COALESCE(NEW.lab_result_id, OLD.lab_result_id);
  SELECT COUNT(*) INTO n FROM public.lab_result_analytes WHERE lab_result_id = rid AND flag <> 'normal';
  UPDATE public.lab_results
    SET flagged_count = n,
        status = (CASE WHEN n > 0 THEN 'flagged' ELSE 'normal' END)::public.lab_result_status
    WHERE id = rid;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
