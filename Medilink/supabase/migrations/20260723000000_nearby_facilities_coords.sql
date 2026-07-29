-- Map View (tracker Phase 5 · 5.2): expose facility coordinates for real map pins.
--
-- The existing get_nearby_facilities RPC returned distance_km but NOT the facility's
-- own latitude/longitude, so the mobile map could not place markers. This reuses the
-- SAME RPC (no new/duplicate API) and adds latitude/longitude derived from the PostGIS
-- `facilities.location` geography column. Additive + reversible: only the RETURNS TABLE
-- gains two columns; all existing callers ignore the extra columns.
--
-- CREATE OR REPLACE cannot change a function's return type, so we DROP then CREATE.

DROP FUNCTION IF EXISTS public.get_nearby_facilities(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_facilities(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m double precision DEFAULT 10000
)
RETURNS TABLE (
  id              uuid,
  name            text,
  type            text,
  address         jsonb,
  services        text[],
  rating          numeric,
  review_count    integer,
  is_verified     boolean,
  cover_photo_url text,
  phone           text,
  distance_km     double precision,
  latitude        double precision,
  longitude       double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.name,
    f.type::text,
    f.address,
    f.services,
    f.rating,
    f.review_count,
    f.is_verified,
    f.cover_photo_url,
    f.phone,
    ROUND(
      (
        ST_Distance(
          f.location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) / 1000.0
      )::numeric,
      2
    )::double precision AS distance_km,
    ST_Y(f.location::geometry) AS latitude,
    ST_X(f.location::geometry) AS longitude
  FROM public.facilities f
  WHERE
    f.status = 'active'
    AND f.is_verified = true
    AND f.location IS NOT NULL
    AND ST_DWithin(
      f.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    AND EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.facility_id = f.id
    )
  ORDER BY distance_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_facilities(double precision, double precision, double precision)
TO anon, authenticated;
