-- ================================
-- 1. CREATE INVITATIONS TABLE
-- ================================
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),

  invite_type text not null, -- e.g. 'facility_admin'
  email text not null,
  invited_name text,

  facility_id uuid not null,

  invited_by uuid not null, -- auth.uid()
  token_hash text not null,

  status text default 'pending',

  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '48 hours'
);


-- ================================
-- 2. CREATE RPC FUNCTION
-- ================================
create or replace function public.invite_facility_admin(
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (
  invite_id uuid,
  error text
)
language plpgsql
as $$
begin

  -- Insert invite
  insert into public.invitations (
    invite_type,
    email,
    invited_name,
    facility_id,
    invited_by,
    token_hash
  )
  values (
    'facility_admin',
    lower(trim(p_email)),
    p_name,
    p_facility_id,
    auth.uid(),
    p_token_hash
  );

  -- Return created invite
  return query
  select id, null
  from public.invitations
  where email = lower(trim(p_email))
  order by created_at desc
  limit 1;

end;
$$;


-- ================================
-- 3. GRANT PERMISSIONS
-- ================================
grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to authenticated;

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to service_role;