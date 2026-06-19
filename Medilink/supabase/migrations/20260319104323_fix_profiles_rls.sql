-- =========================================================
-- FIX: Profiles RLS policies (SSR compatibility)
-- =========================================================

-- 1. Drop existing policies

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_facility_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_super_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;


-- =========================================================
-- 2. Recreate SELECT policies (FIXED)
-- =========================================================

-- ✅ Users can read their own profile
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO public
USING (id = auth.uid());


-- ✅ Facility staff can read relevant profiles
CREATE POLICY "profiles_select_facility_staff"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('facility_admin', 'doctor', 'technician')
  )
);


-- ✅ Super admin can read everything
CREATE POLICY "profiles_select_super_admin"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
  )
);


-- =========================================================
-- 3. UPDATE policy (safe)
-- =========================================================

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (id = auth.uid());


-- =========================================================
-- DONE
-- =========================================================