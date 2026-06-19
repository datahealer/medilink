----+++===============================
-- These are not nedded now as we have tabel for doctors already 
---- this is important -- Realtime setup
-- ALTER PUBLICATION supabase_realtime ADD TABLE doctors;
-----+++===============================

-- -- ================================
-- -- 1️⃣ MAKE DOCTOR FIELDS OPTIONAL
-- -- ================================

-- alter table public.doctors
--   alter column specialty drop not null,
--   alter column sub_specialty drop not null,
--   alter column years_experience drop not null,
--   alter column bio drop not null,
--   alter column fees drop not null,
--   alter column qualifications drop not null,
--   alter column languages drop not null,
--   alter column facility_id drop not null;


-- -- ================================
-- -- 2️⃣ CREATE FUNCTION (AUTO CREATE DOCTOR)
-- -- ================================

-- create or replace function public.handle_new_user()
-- returns trigger as $$
-- begin
--   -- Only create doctor if role = doctor
--   if new.raw_user_meta_data->>'role' = 'doctor' then
--     insert into public.doctors (
--       user_id,
--       full_name,
--       created_at,
--       updated_at
--     )
--     values (
--       new.id,
--       coalesce(new.raw_user_meta_data->>'full_name', 'Doctor'),
--       now(),
--       now()
--     );
--   end if;

--   return new;
-- end;
-- $$ language plpgsql security definer;


-- -- ================================
-- -- 3️⃣ CREATE TRIGGER
-- -- ================================

-- drop trigger if exists on_auth_user_created on auth.users;

-- create trigger on_auth_user_created
-- after insert on auth.users
-- for each row
-- execute procedure public.handle_new_user();