CREATE OR REPLACE FUNCTION public.hams_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'patient'
  );

  -- 🔒 Force patient only
  IF v_role NOT IN ('patient') THEN
    v_role := 'patient';
  END IF;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    phone,
    email,
    phone_verified,
    two_factor_enabled,
    language,
    theme_preference,
    notification_prefs,
    consent_flags,
    push_tokens,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_role,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    false,                 -- phone_verified
    false,                 -- two_factor_enabled
    'en',                  -- language
    'light',               -- theme_preference
    '{}'::jsonb,           -- notification_prefs
    '{}'::jsonb,           -- consent_flags
    ARRAY[]::text[],       -- push_tokens
    'active',              -- status
    NOW(),                 -- created_at
    NOW()                  -- updated_at
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.patient_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;