create table if not exists in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  facility_id uuid,
  title text,
  body text,
  type text default 'announcement',
  is_read boolean default false,
  created_at timestamptz default now()
);

-- performance
create index if not exists idx_notifications_user on in_app_notifications(user_id);