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

    -- 📈 Revenue
    'revenue',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          date_trunc(p_period, p.created_at) as period,
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by period
        order by period
      ) t
    ),

    -- 👨‍⚕️ Doctor breakdown (FIXED JOIN)
    'doctors',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          a.doctor_id,
          sum(p.amount) as total
        from public.payments p
        join public.appointments a 
          on a.id = p.appointment_id
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
          and a.doctor_id is not null
        group by a.doctor_id
      ) t
    ),

    -- 💳 Payment methods
    'methods',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select 
          p.payment_method, 
          sum(p.amount) as total
        from public.payments p
        where 
          (p.facility_id = p_facility_id OR p_facility_id is null)
          and p.status = 'paid'
        group by p.payment_method
      ) t
    ),

    -- 💰 Summary
    'summary',
    (
      select json_build_object(
        'total', coalesce(sum(p.amount), 0),
        'count', count(*)
      )
      from public.payments p
      where 
        (p.facility_id = p_facility_id OR p_facility_id is null)
        and p.status = 'paid'
    )

  ) into result;

  return result;
end;
$$;