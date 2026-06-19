-- =========================================
-- 🔥 STEP 0: DROP OLD STUFF COMPLETELY (FIXED)
-- =========================================

drop table if exists public.invitations cascade;

-- ✅ DROP ALL overloaded versions explicitly
drop function if exists public.invite_facility_admin(uuid, text, text, text) cascade;
drop function if exists public.invite_facility_admin(uuid, text, text, text, jsonb) cascade;


-- =========================================
-- ✅ STEP 1: ENUMS (SAFE)
-- =========================================

do $$ begin
  create type public.invite_type as enum ('facility_admin', 'doctor', 'technician');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
exception when duplicate_object then null; end $$;


-- =========================================
-- ✅ STEP 2: CLEAN INVITATIONS TABLE
-- =========================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),

  invite_type public.invite_type not null,
  status public.invite_status not null default 'pending',

  email text not null,
  invited_name text,

  facility_id uuid not null references public.facilities(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete cascade,

  invited_by uuid not null references public.profiles(id),

  token_hash text not null unique,

  expires_at timestamptz default now() + interval '48 hours',

  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),

  created_at timestamptz default now()
);


-- =========================================
-- ✅ STEP 3: INDEXES
-- =========================================

create unique index uq_inv_pending
on public.invitations (facility_id, invite_type, email)
where status = 'pending';


-- =========================================
-- ✅ STEP 4: RPC (FINAL CLEAN VERSION)
-- =========================================

create or replace function public.invite_facility_admin(
  p_facility_id uuid,
  p_email text,
  p_name text,
  p_token_hash text
)
returns table (invite_id uuid, error text)
language plpgsql
security definer
as $$
declare
  v_invite_id uuid;
begin

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
  )
  returning id into v_invite_id;

  return query select v_invite_id, null;

end;
$$;


-- =========================================
-- ✅ STEP 5: PERMISSIONS
-- =========================================

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to authenticated;

grant execute on function public.invite_facility_admin(
  uuid, text, text, text
) to service_role;