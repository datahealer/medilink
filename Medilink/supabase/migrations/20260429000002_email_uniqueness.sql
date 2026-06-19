-- 1. Add email column to profiles (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill from auth.users (normalize to lowercase)
UPDATE public.profiles p
SET email = lower(a.email)
FROM auth.users a
WHERE p.id = a.id AND p.email IS NULL;

-- 3. Set NOT NULL (after backfill; every profile has a corresponding auth user)
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;

-- 4. Case-insensitive partial unique index (NULL rows excluded)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_ci_unique
  ON public.profiles (LOWER(email))
  WHERE email IS NOT NULL;

-- 5. Trigger: sync profiles.email from auth.users on insert/update
--    Guards against missing or delayed profile rows; normalizes to lowercase.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    LOWER(NEW.email),
    'patient',
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = LOWER(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_email_trigger ON auth.users;
CREATE TRIGGER sync_profile_email_trigger
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- 6. Audit action for duplicate-email onboarding attempts
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'onboarding_failed_duplicate_email';
