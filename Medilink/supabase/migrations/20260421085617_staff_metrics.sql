CREATE OR REPLACE FUNCTION public.staff_metrics(
  p_facility_id UUID,
  p_doctor_id   UUID DEFAULT NULL,
  p_period      TEXT DEFAULT 'month'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since  TIMESTAMPTZ;
  v_result JSON;
BEGIN
  v_since := CASE p_period
    WHEN 'week'  THEN NOW() - INTERVAL '7 days'
    WHEN 'year'  THEN NOW() - INTERVAL '365 days'
    ELSE              NOW() - INTERVAL '30 days'
  END;

  SELECT json_build_object(

    'doctors', (
      SELECT COALESCE(json_agg(t ORDER BY t.total_completed DESC), '[]'::json)
      FROM (
        SELECT
          d.id        AS doctor_id,
          d.full_name AS doctor_name,

          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::INT
            AS total_completed,

          COALESCE(
            ROUND(
              EXTRACT(EPOCH FROM AVG(
                CASE
                  WHEN a.type = 'online'
                    AND a.call_started_at IS NOT NULL
                    AND a.call_ended_at   IS NOT NULL
                  THEN a.call_ended_at - a.call_started_at
                END
              )) / 60,
            1),
          0) AS avg_duration_minutes,

          CASE
            WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('completed','no_show')) = 0 THEN 0
            ELSE ROUND(
              COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'no_show')::NUMERIC
              / NULLIF(COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('completed','no_show')), 0)
              * 100, 1
            )
          END AS no_show_rate,

          COALESCE((
            SELECT SUM(p2.amount)
            FROM   payments p2
            JOIN   appointments a2 ON a2.id = p2.appointment_id
            WHERE  a2.doctor_id = d.id
              AND  p2.status = 'paid'
              AND  (p_facility_id IS NULL OR a2.facility_id = p_facility_id)
              AND  a2.created_at >= v_since
          ), 0) AS revenue,

          ROUND(AVG(r.rating)::NUMERIC, 2) AS avg_rating

        FROM doctors d
        LEFT JOIN appointments a
          ON  a.doctor_id = d.id
          AND (p_facility_id IS NULL OR a.facility_id = p_facility_id)
          AND a.created_at >= v_since
        LEFT JOIN reviews r
          ON  r.target_id   = d.id
          AND r.target_type = 'doctor'
          AND r.is_visible  = TRUE
        WHERE (p_facility_id IS NULL OR d.facility_id = p_facility_id)
          AND (p_doctor_id   IS NULL OR d.id = p_doctor_id)
          AND d.is_active = TRUE
        GROUP BY d.id, d.full_name
      ) t
    ),

    'rating_trend', (
      SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM') AS month,
          ROUND(AVG(r.rating)::NUMERIC, 2) AS rating
        FROM reviews r
        JOIN doctors d ON d.id = r.target_id
        WHERE r.target_type = 'doctor'
          AND r.is_visible  = TRUE
          AND (p_facility_id IS NULL OR d.facility_id = p_facility_id)
          AND (p_doctor_id   IS NULL OR d.id = p_doctor_id)
          AND r.created_at  >= (CURRENT_DATE - INTERVAL '12 months')
        GROUP BY month
        ORDER BY month
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_metrics(UUID, UUID, TEXT)
  TO authenticated, service_role;

