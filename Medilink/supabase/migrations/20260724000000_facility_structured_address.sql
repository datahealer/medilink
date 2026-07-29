-- Address-based clinic location (tracker Phase 5 follow-up).
--
-- Clinics enter a STRUCTURED ADDRESS (building/street/area/city/country); the backend
-- geocodes it to coordinates. Coordinates stay in the existing PostGIS
-- `facilities.location` geography column (the single source of truth — the map RPC
-- get_nearby_facilities already derives latitude/longitude from it, so nothing on the
-- read path changes). No lat/lng columns are added (avoids a second, drift-prone
-- coordinate source). `facilities.address` (jsonb) is kept for backward compatibility.
--
-- Additive + reversible: new nullable columns + one new RPC. No existing column, RPC
-- signature, or policy is changed.

ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS building_number   text,
  ADD COLUMN IF NOT EXISTS street            text,
  ADD COLUMN IF NOT EXISTS area              text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS country           text DEFAULT 'Oman',
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS geocoded_at       timestamptz;

COMMENT ON COLUMN public.facilities.formatted_address IS
  'Backend-managed: provider-normalized address returned by geocoding. Do not set from clients.';
COMMENT ON COLUMN public.facilities.geocoded_at IS
  'Backend-managed: when location was last geocoded. Used as a caching guard.';
COMMENT ON COLUMN public.facilities.location IS
  'Backend-managed coordinates (PostGIS geography, SRID 4326). Written only by set_facility_geocode from geocoding; never entered manually.';

-- Backend-only writer for geocoded coordinates. SECURITY DEFINER + service_role-only so
-- the geocode-facility edge function (which resolves lat/lng from the provider) is the
-- sole path that sets `location`. Clients never write coordinates.
CREATE OR REPLACE FUNCTION public.set_facility_geocode(
  p_facility_id uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_formatted   text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.facilities
     SET location          = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
         formatted_address = COALESCE(p_formatted, formatted_address),
         geocoded_at       = now()
   WHERE id = p_facility_id;
$$;

REVOKE ALL ON FUNCTION public.set_facility_geocode(uuid, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_facility_geocode(uuid, double precision, double precision, text) TO service_role;
