-- ✅ ANNOUNCEMENTS TABLE
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  title text not null,
  message text not null,
  channels text[] default '{}',
  target_audience text default 'all',
  sent_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ✅ NEW NOTIFICATIONS TABLE (DO NOT TOUCH OLD ONE)
create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  facility_id uuid,
  title text,
  message text,
  type text default 'announcement',
  read boolean default false,
  created_at timestamptz default now()
);

-- ✅ MUTED FACILITIES
alter table profiles
add column if not exists muted_facilities uuid[] default '{}';