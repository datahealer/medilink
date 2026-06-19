create or replace function public.invite_facility_admin(
  p_account_id uuid,
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

  insert into invitations (
    account_id,
    email,
    invited_by,
    facility_id,
    token_hash,
    role,
    status,
    invited_name   -- ✅ FIXED
  )
  values (
    p_account_id,
    p_email,
    auth.uid(),
    p_facility_id,
    p_token_hash,
    'facility_admin',
    'pending',
    p_name         -- ✅ goes into invited_name
  );

  return query
  select id, null from invitations
  where email = p_email
  order by created_at desc
  limit 1;

end;
$$;