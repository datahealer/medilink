-- =====================================================
-- F14: FACILITY PROFILE MANAGEMENT UPGRADE
-- =====================================================

-- -------------------------------
-- STEP 1: Enable PostGIS
-- -------------------------------
create extension if not exists postgis;

-- -------------------------------
-- STEP 2: Add GEO location column
-- -------------------------------
alter table public.facilities
add column if not exists location geography(Point, 4326);

-- -------------------------------
-- STEP 3: Facility Members (NEW)
-- -------------------------------
create table if not exists public.facility_members (
  id uuid primary key default gen_random_uuid(),

  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  role text not null check (role in ('admin','doctor','staff')),

  created_at timestamptz default now(),

  unique(facility_id, user_id)
);

-- -------------------------------
-- STEP 4: RLS for facility_members
-- -------------------------------
alter table public.facility_members enable row level security;

create policy "facility_members_read_own"
on public.facility_members
for select
using (user_id = auth.uid());

create policy "facility_members_admin_insert"
on public.facility_members
for insert
with check (
  exists (
    select 1 from public.facility_members fm
    where fm.facility_id = facility_members.facility_id
    and fm.user_id = auth.uid()
    and fm.role = 'admin'
  )
);

-- -------------------------------
-- STEP 5: Backfill existing admins
-- -------------------------------
insert into public.facility_members (facility_id, user_id, role)
select
  f.id,
  p.id,
  'admin'
from public.facilities f
join public.profiles p
  on p.role = 'facility_admin'
on conflict do nothing;

-- -------------------------------
-- STEP 6: Nearby Search Function
-- -------------------------------
create or replace function public.nearby_facilities(
  lat float,
  lng float,
  radius int
)
returns setof public.facilities
language sql
as $$
  select *
  from public.facilities
  where location is not null
  and ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326),
    radius
  );
$$;