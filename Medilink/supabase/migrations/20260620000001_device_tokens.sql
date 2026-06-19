-- MediLink additive migration: device_tokens (push transport for mobile).
-- Additive only — does not alter any existing HAMS table.
create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Patients manage only their own tokens.
create policy "device_tokens_select_own" on public.device_tokens
  for select using (auth.uid() = user_id);
create policy "device_tokens_insert_own" on public.device_tokens
  for insert with check (auth.uid() = user_id);
create policy "device_tokens_update_own" on public.device_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "device_tokens_delete_own" on public.device_tokens
  for delete using (auth.uid() = user_id);
