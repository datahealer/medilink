CREATE OR REPLACE FUNCTION public.get_nearby_facilities(
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
  distance_km     double precision
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
    f.address,                         -- ✅ FIX: jsonb (not text)
    f.services,
    f.rating,                          -- ✅ FIX: correct column (not avg_rating)
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
    )::double precision AS distance_km

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