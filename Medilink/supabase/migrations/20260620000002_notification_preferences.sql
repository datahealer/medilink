-- MediLink additive migration: notification_preferences (per-user channel/category opt-in).
-- Additive only — does not alter any existing HAMS table.
create table if not exists public.notification_preferences (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  push         boolean not null default true,
  email        boolean not null default true,
  sms          boolean not null default false,
  -- per-category opt-in (appointment_reminders, lab_results, prescriptions, payments, facility_updates, promotions)
  categories   jsonb not null default '{"appointment_reminders":true,"lab_results":true,"prescriptions":true,"payments":true,"facility_updates":true,"promotions":false}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notif_prefs_select_own" on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy "notif_prefs_upsert_own" on public.notification_preferences
  for insert with check (auth.uid() = user_id);
create policy "notif_prefs_update_own" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
