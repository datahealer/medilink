// Address-based clinic geocoding (backend-only).
//
// Turns a facility's STRUCTURED ADDRESS (building/street/area/city/country) into
// coordinates and stores them in facilities.location via the set_facility_geocode RPC.
// Coordinates are never entered manually and never geocoded from the client — this is
// the single server-side place geocoding happens.
//
// Invoked two ways:
//   1. Supabase Database Webhook on public.facilities INSERT/UPDATE (of the address
//      columns) — payload: { type, record, old_record }. Geocodes only when the
//      address actually changed (caching guard).
//   2. Manual/backfill — payload: { facility_id } — geocodes that facility now.
//
// Provider: Google Geocoding API (best Oman accuracy; consistent with the Google Maps
// used on Android; tiny volume → negligible cost). Key is a server-only function secret.
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const ADDRESS_FIELDS = ["building_number", "street", "area", "city", "country"] as const;
type AddressRow = Record<(typeof ADDRESS_FIELDS)[number] | "id", string | null>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Compose the provider query from structured fields; country defaults to Oman. */
function buildAddress(row: Partial<AddressRow>): string {
  return [row.building_number, row.street, row.area, row.city, row.country || "Oman"]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** True when any address field differs between the new and old record. */
function addressChanged(rec: Partial<AddressRow>, old?: Partial<AddressRow> | null): boolean {
  if (!old) return true;
  return ADDRESS_FIELDS.some((f) => (rec[f] ?? null) !== (old[f] ?? null));
}

serve(async (req) => {
  const googleKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY");
  if (!googleKey) {
    console.error("[geocode-facility] GOOGLE_GEOCODING_API_KEY is not set");
    return json({ error: "geocoding not configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: {
    type?: string;
    record?: Partial<AddressRow>;
    old_record?: Partial<AddressRow> | null;
    facility_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // Resolve the target facility + its address (from the webhook record, or by id).
  let facilityId: string | undefined;
  let record: Partial<AddressRow> | undefined = payload.record;

  if (record?.id) {
    facilityId = record.id;
    // Webhook UPDATE with no address change → skip (caching guard; avoids re-geocoding).
    if (payload.type === "UPDATE" && !addressChanged(record, payload.old_record)) {
      return json({ skipped: "address unchanged", facility_id: facilityId });
    }
  } else if (payload.facility_id) {
    facilityId = payload.facility_id;
    const { data, error } = await supabase
      .from("facilities")
      .select("id, building_number, street, area, city, country")
      .eq("id", facilityId)
      .maybeSingle();
    if (error) {
      console.error("[geocode-facility] facility fetch failed:", error.message);
      return json({ error: "facility lookup failed" }, 500);
    }
    if (!data) return json({ error: "facility not found" }, 404);
    record = data as Partial<AddressRow>;
  }

  if (!facilityId || !record) {
    return json({ error: "facility_id or record required" }, 400);
  }

  const address = buildAddress(record);
  // Require a meaningful address before spending a geocoding call.
  if (address.replace(/oman/i, "").replace(/[,\s]/g, "").length === 0) {
    return json({ skipped: "insufficient address", facility_id: facilityId });
  }

  // Google Geocoding (region-biased to Oman).
  let geo: { status?: string; results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }> };
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}` +
      `&region=om&key=${googleKey}`;
    const res = await fetch(url);
    geo = await res.json();
  } catch (err) {
    console.error("[geocode-facility] provider request failed:", err instanceof Error ? err.message : err);
    return json({ error: "geocoding provider error" }, 502); // 5xx → webhook retry
  }

  if (geo.status === "ZERO_RESULTS") {
    console.warn(`[geocode-facility] no result for facility ${facilityId}: "${address}"`);
    return json({ skipped: "no geocoding result", facility_id: facilityId, address });
  }
  const loc = geo.results?.[0]?.geometry?.location;
  if (geo.status !== "OK" || !loc) {
    // OVER_QUERY_LIMIT / REQUEST_DENIED / UNKNOWN_ERROR → transient/config → retry.
    console.error(`[geocode-facility] provider status ${geo.status} for facility ${facilityId}`);
    return json({ error: `geocoding failed: ${geo.status}` }, 502);
  }

  const { error: rpcErr } = await supabase.rpc("set_facility_geocode", {
    p_facility_id: facilityId,
    p_lat: loc.lat,
    p_lng: loc.lng,
    p_formatted: geo.results?.[0]?.formatted_address ?? null,
  });
  if (rpcErr) {
    console.error("[geocode-facility] set_facility_geocode failed:", rpcErr.message);
    return json({ error: "failed to store coordinates" }, 500);
  }

  console.log(`[geocode-facility] geocoded ${facilityId} → ${loc.lat},${loc.lng}`);
  return json({ geocoded: true, facility_id: facilityId, latitude: loc.lat, longitude: loc.lng });
});
