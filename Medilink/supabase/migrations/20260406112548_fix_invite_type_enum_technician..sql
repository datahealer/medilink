-- Ensure invite_type enum includes technician in drifted environments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typname = 'invite_type'
  ) THEN
    ALTER TYPE public.invite_type ADD VALUE IF NOT EXISTS 'technician';
  ELSE
    CREATE TYPE public.invite_type AS ENUM ('facility_admin', 'doctor', 'technician');
  END IF;
END
$$;
 
-- Ensure invitations.invite_type uses the enum type (handles old text schema drift).
DO $$
DECLARE
  v_udt_name TEXT;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'invitations'
    AND c.column_name = 'invite_type';
 
  IF v_udt_name IS NULL THEN
    ALTER TABLE public.invitations
      ADD COLUMN invite_type public.invite_type;
  ELSIF v_udt_name <> 'invite_type' THEN
    ALTER TABLE public.invitations
      ALTER COLUMN invite_type TYPE public.invite_type
      USING invite_type::public.invite_type;
  END IF;
END
$$;
 