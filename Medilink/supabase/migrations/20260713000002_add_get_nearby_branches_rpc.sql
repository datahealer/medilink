-- Migration-drift recovery: public.get_nearby_branches(double precision, double precision, integer)
--
-- This RPC is live on the remote database (used by facilities.nearbyBranches) but had no
-- committed migration, so a fresh environment could not rebuild it. This file recovers the
-- exact live definition (captured via pg_get_functiondef). CREATE OR REPLACE is idempotent:
-- re-applying it against the live DB reproduces the identical function and changes nothing.
-- Requires PostGIS and branches.location (already present on the reused HAMS schema).

CREATE OR REPLACE FUNCTION public.get_nearby_branches(lat double precision, lng double precision, radius integer)
 RETURNS TABLE(id uuid, facility_id uuid, name text, address jsonb, distance double precision)
 LANGUAGE sql
AS $function$
  select
    b.id,
    b.facility_id,
    b.name,
    b.address,
    ST_Distance(
      b.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) as distance
  from branches b
  where ST_DWithin(
    b.location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius
  )
  order by distance;
$function$;
