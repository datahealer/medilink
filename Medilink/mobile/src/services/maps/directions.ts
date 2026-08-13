/**
 * "Get directions" — provider-agnostic, key-free, and anchored on the patient's REAL
 * position.
 *
 * ── THE ORIGIN RULE (the whole reason this file gained an `origin`) ──
 *
 * The nearby-clinic list is anchored on Muscat whenever the patient is outside coverage,
 * because a proximity RPC needs a centre. That fallback is a DISCOVERY device and nothing
 * more. It must never become the patient's location — a route drawn from Muscat for a
 * patient in India is not merely wrong, it is confidently wrong, which is worse.
 *
 * So `origin` is a separate, explicit parameter that only ever carries a real GPS fix.
 * There is no code path here that can reach the Muscat constant: this module does not
 * import it and does not know it exists. `buildDirectionsUrl` omits the origin entirely
 * when no fix is available, which makes the maps app fall back to its own idea of "current
 * location" — still the device's real position, never ours to guess.
 *
 * ── NO API KEY, NO ACCOUNT, NO BILLING ──
 *
 * Google Maps URLs (https://developers.google.com/maps/documentation/urls) are a PUBLIC URL
 * scheme and are not the Google Maps Platform. No key, no project, no billing, no quota.
 * On Android the https URL is claimed by the Google Maps app's intent filter, so it opens
 * the app when installed and the web map when it isn't. Apple Maps' `maps.apple.com` scheme
 * is likewise public and keyless.
 *
 * Pure functions only — the caller owns `Linking`, so this stays unit-testable.
 */

export interface DirectionsTarget {
  latitude: number;
  longitude: number;
  /** Optional label shown as the destination name where the platform supports it. */
  label?: string | null;
}

/** The patient's real position. Never the Muscat discovery fallback. */
export interface DirectionsOrigin {
  latitude: number;
  longitude: number;
}

/**
 * Travel modes as the PRODUCT names them. Mapped to each provider's own vocabulary in
 * `buildDirectionsUrl`, so a provider quirk never leaks into the UI layer.
 */
export type TravelMode = "drive" | "walk" | "cycle" | "transit";

export const DEFAULT_TRAVEL_MODE: TravelMode = "drive";

/**
 * Beyond this, offering "Transit" is dishonest UI. We cannot know whether a transit route
 * exists without a routing API we deliberately do not have, but we can know that no bus
 * connects Delhi to Muscat. Gating the CHIP is not the same as fabricating a route: within
 * the threshold we still hand off and let the provider give its own answer, including "no
 * transit routes found".
 *
 * Deliberately matches OUT_OF_COVERAGE_KM in services/maps/nearby.ts — the same 300 km line
 * that decides whether clinics count as "in your area".
 */
export const TRANSIT_MAX_KM = 300;

/** True when the coordinate pair is usable. Guards against null/NaN geo from the API. */
export function isValidTarget(t: Partial<DirectionsTarget> | null | undefined): boolean {
  if (!t) return false;
  const { latitude: lat, longitude: lng } = t;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Which modes this platform can actually honour for this journey.
 *
 * `cycle` is Android-only, and that is a fact about Apple, not a limitation we chose: the
 * documented `maps.apple.com` scheme exposes `dirflg=d|w|r` and has no bicycle flag. Showing
 * a Cycle chip on iOS would either silently give walking directions or need a Google
 * redirect — both of which lie to the user about what they tapped.
 *
 * @param distanceKm straight-line origin→destination distance, when known.
 */
export function travelModesFor(
  platform: "ios" | "android" | string,
  distanceKm?: number | null
): TravelMode[] {
  const modes: TravelMode[] = ["drive", "walk"];
  if (platform === "android") modes.push("cycle");
  const far = typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm > TRANSIT_MAX_KM;
  if (!far) modes.push("transit");
  return modes;
}

/** Google Maps URL vocabulary. */
const GOOGLE_MODE: Record<TravelMode, string> = {
  drive: "driving",
  walk: "walking",
  cycle: "bicycling",
  transit: "transit",
};

/**
 * Apple Maps `dirflg` vocabulary. `cycle` maps to `d` ONLY as a last-resort safety net —
 * `travelModesFor` never offers Cycle on iOS, so this entry should be unreachable from the
 * UI. It exists so a programmatic caller cannot produce a malformed URL.
 */
const APPLE_MODE: Record<TravelMode, string> = {
  drive: "d",
  walk: "w",
  cycle: "d",
  transit: "r",
};

const OSM_ENGINE: Record<TravelMode, string> = {
  drive: "fossgis_osrm_car",
  walk: "fossgis_osrm_foot",
  cycle: "fossgis_osrm_bike",
  // OSRM has no public transit engine; car is the least-wrong fallback for a browser.
  transit: "fossgis_osrm_car",
};

export interface DirectionsRequest {
  destination: DirectionsTarget;
  /** The patient's REAL coordinates. Omit only when there is genuinely no fix. */
  origin?: DirectionsOrigin | null;
  mode?: TravelMode;
}

const coord = (c: { latitude: number; longitude: number }) => `${c.latitude},${c.longitude}`;

/**
 * The preferred URL for the platform, carrying origin, destination and travel mode.
 *
 * Android → Google Maps URLs. Chosen over `geo:` because `geo:` has no concept of a route:
 * the previous implementation built `geo:lat,lng?q=lat,lng(label)`, which is a
 * SHOW-THIS-PLACE intent. It dropped a pin and never asked for directions at all, so
 * "Get directions" on Android did not give directions. It also had nowhere to put an origin
 * or a travel mode.
 *
 * iOS → Apple Maps with an explicit `saddr`. Previously `saddr` was omitted and Apple Maps
 * inferred current location, which happened to be right; explicit is better, because the
 * caller can now prove which coordinate was sent.
 */
export function buildDirectionsUrl(
  platform: "ios" | "android" | string,
  req: DirectionsRequest
): string {
  const mode = req.mode ?? DEFAULT_TRAVEL_MODE;
  const dest = coord(req.destination);
  const from = req.origin && isValidTarget(req.origin) ? coord(req.origin) : null;

  if (platform === "android") {
    const params = [
      "api=1",
      from ? `origin=${from}` : null,
      `destination=${dest}`,
      `travelmode=${GOOGLE_MODE[mode]}`,
    ]
      .filter(Boolean)
      .join("&");
    return `https://www.google.com/maps/dir/?${params}`;
  }

  if (platform === "ios") {
    const params = [
      from ? `saddr=${from}` : null,
      `daddr=${dest}`,
      `dirflg=${APPLE_MODE[mode]}`,
    ]
      .filter(Boolean)
      .join("&");
    return `https://maps.apple.com/?${params}`;
  }

  return webDirectionsUrl(req);
}

/**
 * Android-only last resort, used when the Google Maps URL cannot be opened at all. `geo:`
 * lets the OS offer every installed map app, but carries no route, origin or mode — it is a
 * pin. Reaching this means the device has no browser and no Google Maps, so a pin is the
 * most that can honestly be offered.
 */
export function geoFallbackUrl(target: DirectionsTarget): string {
  const c = coord(target);
  const q = target.label ? `(${encodeURIComponent(target.label)})` : "";
  return `geo:${c}?q=${c}${q}`;
}

/**
 * Key-free browser fallback. OpenStreetMap's directions page takes a real origin and a real
 * routing engine, so unlike the previous `?mlat=` pin this actually produces a route.
 */
export function webDirectionsUrl(req: DirectionsRequest): string {
  const mode = req.mode ?? DEFAULT_TRAVEL_MODE;
  const dest = coord(req.destination);
  if (req.origin && isValidTarget(req.origin)) {
    return `https://www.openstreetmap.org/directions?engine=${OSM_ENGINE[mode]}&route=${coord(req.origin)};${dest}`;
  }
  const { latitude, longitude } = req.destination;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

/**
 * Ordered list of URLs to try. The caller opens them in order until one succeeds, so the
 * fallback chain is data rather than nested catch blocks — and is therefore testable.
 */
export function directionsUrlChain(
  platform: "ios" | "android" | string,
  req: DirectionsRequest
): string[] {
  const primary = buildDirectionsUrl(platform, req);
  const chain = [primary];
  if (platform === "android") chain.push(geoFallbackUrl(req.destination));
  const web = webDirectionsUrl(req);
  if (!chain.includes(web)) chain.push(web);
  return chain;
}
