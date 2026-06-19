CREATE OR REPLACE FUNCTION get_monthly_report_summary(
  p_facility_id UUID,
  p_month INT,
  p_year INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end   DATE := v_start + INTERVAL '1 month';
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total',      COUNT(*),
    'confirmed',  COUNT(*) FILTER (WHERE status = 'confirmed'),
    'cancelled',  COUNT(*) FILTER (WHERE status = 'cancelled'),
    'pending',    COUNT(*) FILTER (WHERE status = 'pending'),
    'completed',  COUNT(*) FILTER (WHERE status = 'completed'),
    'emergency',  COUNT(*) FILTER (WHERE is_emergency = true)
  )
  INTO v_result
  FROM appointments
  WHERE facility_id = p_facility_id
    AND slot_date >= v_start
    AND slot_date < v_end;

  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_monthly_report_summary(UUID, INT, INT) TO service_role;
