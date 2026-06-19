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

    -- 👨‍⚕️ Doctor OR 🏥 Facility breakdown
    'breakdown',
    (
      select coalesce(json_agg(t), '[]'::json)
      from (

        -- 🔥 CASE 1: Facility Admin → Doctor breakdown
        select 
          d.full_name as name,
          sum(p.amount) as total
        from public.payments p
        join public.appointments a on a.id = p.appointment_id
        join public.doctors d on d.id = a.doctor_id
        where 
          p_facility_id is not null
          and p.facility_id = p_facility_id
          and p.status = 'paid'
        group by d.full_name

        union all

        -- 🔥 CASE 2: Super Admin → Facility breakdown
        select 
          f.name as name,
          sum(p.amount) as total
        from public.payments p
        join public.facilities f on f.id = p.facility_id
        where 
          p_facility_id is null
          and p.status = 'paid'
        group by f.name

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