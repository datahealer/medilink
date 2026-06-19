-- =========================================================
-- F-30 Earnings Dashboard (Facility + Super Admin)
-- =========================================================

create or replace function public.get_earnings_dashboard(
  p_facility_id uuid,
  p_period text
)
returns json
language plpgsql
security definer
as $$
declare result json;
begin
  select json_build_object(

    -- 📈 Revenue over time
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, created_at) as period,
          sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor breakdown
    'doctors',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select doctor_id, sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by doctor_id
      ) t
    ),

    -- 💳 Payment method split
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select payment_method, sum(amount) as total
        from public.payments
        where 
          (facility_id = p_facility_id OR p_facility_id is null)
          and status = 'paid'
        group by payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(amount), 0),
        'count', count(*)
      )
      from public.payments
      where 
        (facility_id = p_facility_id OR p_facility_id is null)
        and status = 'paid'
    )

  ) into result;

  return result;
end;
$$;

grant execute on function public.get_earnings_dashboard(uuid, text)
to authenticated, service_role;