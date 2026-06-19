-- ============================================================
-- F-28 MULTI-LOCATION BOOKING (COMPLETE + SAFE MIGRATION)
-- ============================================================

-- ============================================================
-- 1. ENABLE POSTGIS (SAFE)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'postgis'
  ) THEN
    CREATE EXTENSION postgis;
  END IF;
END $$;


-- ============================================================
-- 2. ADD GEO LOCATION COLUMN TO BRANCHES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'branches'
    AND column_name = 'location'
  ) THEN
    ALTER TABLE public.branches
    ADD COLUMN location geography(Point, 4326);
  END IF;
END $$;


-- ============================================================
-- 3. ADD SPATIAL INDEX (PERFORMANCE 🔥)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'branches'
    AND indexname = 'idx_branches_location'
  ) THEN
    CREATE INDEX idx_branches_location
    ON public.branches
    USING gist(location);
  END IF;
END $$;


-- ============================================================
-- 4. CREATE NEARBY SEARCH RPC (CORE FEATURE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.nearby_branches(
  user_lat float,
  user_lng float,
  radius_meters int DEFAULT 5000
)
RETURNS SETOF public.branches
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.branches
  WHERE location IS NOT NULL
  AND ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
    radius_meters
  );
$$;


-- ============================================================
-- 5. ADVANCED: DISTANCE + SORT (PRODUCTION READY)
-- ============================================================
CREATE OR REPLACE FUNCTION public.nearby_branches_with_distance(
  user_lat float,
  user_lng float,
  radius_meters int DEFAULT 5000
)
RETURNS TABLE (
  id uuid,
  facility_id uuid,
  name text,
  address jsonb,
  phone text,
  working_hours jsonb[],
  is_main boolean,
  created_at timestamptz,
  location geography,
  distance_meters float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    b.*,
    ST_Distance(
      b.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) AS distance_meters
  FROM public.branches b
  WHERE b.location IS NOT NULL
  AND ST_DWithin(
    b.location,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC;
$$;


-- ============================================================
-- 6. OPTIONAL: GET BRANCHES BY FACILITY (OPTIMIZED)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_facility_branches(
  facility_uuid uuid
)
RETURNS SETOF public.branches
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.branches
  WHERE facility_id = facility_uuid
  ORDER BY is_main DESC, created_at DESC;
$$;


-- ============================================================
-- 7. SAFE GRANTS
-- ============================================================
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.nearby_branches(float, float, int) TO anon;
  GRANT EXECUTE ON FUNCTION public.nearby_branches(float, float, int) TO authenticated;

  GRANT EXECUTE ON FUNCTION public.nearby_branches_with_distance(float, float, int) TO anon;
  GRANT EXECUTE ON FUNCTION public.nearby_branches_with_distance(float, float, int) TO authenticated;

  GRANT EXECUTE ON FUNCTION public.get_facility_branches(uuid) TO anon;
  GRANT EXECUTE ON FUNCTION public.get_facility_branches(uuid) TO authenticated;

EXCEPTION
  WHEN undefined_function THEN
    NULL;
END $$;


-- ============================================================
-- 8. OPTIONAL: HELPER FUNCTION TO INSERT BRANCH WITH GEO
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_branch_with_location(
  facility_uuid uuid,
  branch_name text,
  lat float,
  lng float,
  address jsonb DEFAULT '{}'::jsonb,
  phone text DEFAULT NULL
)
RETURNS public.branches
LANGUAGE plpgsql
AS $$
DECLARE
  new_branch public.branches;
BEGIN
  INSERT INTO public.branches (
    facility_id,
    name,
    address,
    phone,
    location
  )
  VALUES (
    facility_uuid,
    branch_name,
    address,
    phone,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  )
  RETURNING * INTO new_branch;

  RETURN new_branch;
END;
$$;


-- ============================================================
-- 9. COMMENTS (DOCUMENTATION)
-- ============================================================
COMMENT ON COLUMN public.branches.location IS
'Geographic coordinates for branch (PostGIS Point: lng, lat) used for nearby search';

COMMENT ON FUNCTION public.nearby_branches IS
'Returns branches within radius using PostGIS ST_DWithin';

COMMENT ON FUNCTION public.nearby_branches_with_distance IS
'Returns branches sorted by distance from user';

-- ============================================================
-- DONE ✅ F-28 FULLY IMPLEMENTED
-- ============================================================