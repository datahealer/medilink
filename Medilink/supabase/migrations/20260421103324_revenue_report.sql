CREATE OR REPLACE FUNCTION public.revenue_report(
  p_facility_id UUID,
  p_period      TEXT DEFAULT 'month',
  p_year        INT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  TIMESTAMPTZ;
  v_trunc  TEXT;
  v_result JSON;
BEGIN
  v_since := CASE p_period
    WHEN 'week'  THEN NOW() - INTERVAL '7 days'
    WHEN 'year'  THEN NOW() - INTERVAL '365 days'
    ELSE              NOW() - INTERVAL '30 days'
  END;

  -- Bucket size: day for week view, week for month view, month for year view
  v_trunc := CASE p_period
    WHEN 'week'  THEN 'day'
    WHEN 'year'  THEN 'month'
    ELSE              'week'
  END;

  SELECT json_build_object(

    -- 1. Revenue over time with LAG-based growth percent
    'revenue_over_time', (
      SELECT COALESCE(json_agg(t ORDER BY t.period), '[]'::json)
      FROM (
        WITH base AS (
          SELECT
            DATE_TRUNC(v_trunc, p.created_at) AS period,
            SUM(p.amount)                     AS total_revenue
          FROM payments p
          WHERE (p_facility_id IS NULL OR p.facility_id = p_facility_id)
            AND p.status = 'paid'
            AND p.created_at >= v_since
          GROUP BY period
        )
        SELECT
          TO_CHAR(period, 'YYYY-MM-DD')                          AS period,
          COALESCE(total_revenue, 0)                             AS total_revenue,
          COALESCE(LAG(total_revenue) OVER (ORDER BY period), 0) AS previous_period_revenue,
          CASE
            WHEN COALESCE(LAG(total_revenue) OVER (ORDER BY period), 0) = 0 THEN NULL
            ELSE ROUND(
              (total_revenue - LAG(total_revenue) OVER (ORDER BY period))
              / LAG(total_revenue) OVER (ORDER BY period) * 100,
              1
            )
          END AS growth_percent
        FROM base
        ORDER BY period
      ) t
    ),

    -- 2. Payment method split
    'payment_method_split', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(p.payment_method, 'unknown') AS payment_method,
          COALESCE(SUM(p.amount), 0)            AS total
        FROM payments p
        WHERE (p_facility_id IS NULL OR p.facility_id = p_facility_id)
          AND p.status = 'paid'
          AND p.created_at >= v_since
        GROUP BY p.payment_method
      ) t
    ),

    -- 3. Service type split (online vs in_person via appointments join)
    'service_type_split', (
      SELECT COALESCE(json_agg(t ORDER BY t.total DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(a.type::TEXT, 'unknown') AS service_type,
          COALESCE(SUM(p.amount), 0)        AS total
        FROM payments p
        JOIN appointments a ON a.id = p.appointment_id
        WHERE (p_facility_id IS NULL OR p.facility_id = p_facility_id)
          AND p.status = 'paid'
          AND p.created_at >= v_since
        GROUP BY a.type
      ) t
    ),

    -- 4. Summary totals
    'totals', (
      SELECT json_build_object(
        'total_revenue',         COALESCE(SUM(amount), 0),
        'total_transactions',    COUNT(*)::INT,
        'avg_transaction_value', COALESCE(ROUND(AVG(amount)::NUMERIC, 2), 0)
      )
      FROM payments
      WHERE (p_facility_id IS NULL OR facility_id = p_facility_id)
        AND status = 'paid'
        AND created_at >= v_since
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_report(UUID, TEXT, INT)
  TO authenticated, service_role;