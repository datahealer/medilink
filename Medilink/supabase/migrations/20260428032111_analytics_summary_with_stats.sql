-- Adds total_bookings, active_patients, total_revenue to analytics_summary.
-- NULL p_facility_id returns aggregated data across ALL facilities (super_admin).
CREATE OR REPLACE FUNCTION public.analytics_summary(
  p_facility_id UUID,
  p_period TEXT DEFAULT 'month'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_result JSON;
BEGIN
  v_since := CASE p_period
    WHEN 'week' THEN NOW() - INTERVAL '7 days'
    WHEN 'year' THEN NOW() - INTERVAL '365 days'
    ELSE NOW() - INTERVAL '30 days'
  END;
 
  SELECT json_build_object(
 
    -- Stat: Total Bookings in period
    'total_bookings', (
      SELECT COUNT(*)::INT
      FROM appointments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND status IN ('confirmed', 'completed', 'no_show')
        AND created_at >= v_since
    ),
 
    -- Stat: Distinct active patients in period
    'active_patients', (
      SELECT COUNT(DISTINCT patient_id)::INT
      FROM appointments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND created_at >= v_since
    ),
 
    -- Stat: Total paid revenue in period
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0)::NUMERIC
      FROM payments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND status = 'paid'
        AND created_at >= v_since
    ),
 
    -- Busiest Hours
    'busiest_hours', (
      SELECT COALESCE(json_agg(t ORDER BY t.hour), '[]'::json)
      FROM (
        SELECT
          EXTRACT(HOUR FROM slot_start)::INT AS hour,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND created_at >= v_since
        GROUP BY hour
        ORDER BY hour
      ) t
    ),
 
    -- Monthly Trend (last 12 months, period-independent)
    'monthly_trend', (
      SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', slot_date), 'YYYY-MM') AS month,
          COUNT(*)::INT AS total
        FROM appointments
        WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
          AND status IN ('confirmed', 'completed', 'no_show')
          AND slot_date >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY month
        ORDER BY month
      ) t
    ),
 
    -- Top 5 Doctors by appointment count
    'top_doctors', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          d.full_name AS name,
          COUNT(a.id)::INT AS total
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.status IN ('confirmed', 'completed', 'no_show')
          AND a.created_at >= v_since
        GROUP BY d.full_name
        ORDER BY total DESC
        LIMIT 5
      ) t
    ),
 
    -- No-show Rate (%)
    'no_show_rate', (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE status = 'no_show')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed','completed','no_show')), 0)
          * 100,
          1
        )
      END
      FROM appointments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND created_at >= v_since
    ),
 
    -- Patient Demographics (by gender)
    'demographics', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(pp.gender::TEXT, 'unknown') AS gender,
          COUNT(DISTINCT a.patient_id)::INT AS total
        FROM appointments a
        JOIN patient_profiles pp ON pp.id = a.patient_id
        WHERE (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.created_at >= v_since
        GROUP BY gender
      ) t
    )
 
  ) INTO v_result;
 
  RETURN v_result;
END;
$$;
 
GRANT EXECUTE ON FUNCTION public.analytics_summary(UUID, TEXT)
TO authenticated, service_role;