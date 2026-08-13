import fs from "fs";
import path from "path";

import {
  DEFAULT_TRAVEL_MODE,
  TRANSIT_MAX_KM,
  buildDirectionsUrl,
  directionsUrlChain,
  geoFallbackUrl,
  isValidTarget,
  travelModesFor,
  webDirectionsUrl,
  type TravelMode,
} from "../directions";

/**
 * Directions contract.
 *
 * The single most important property here is the ORIGIN: the patient's real GPS fix, never
 * the Muscat discovery anchor. Muscat exists so the app can ask "what clinics does MediLink
 * have" when the patient is outside coverage; routing from it would tell a patient in Delhi
 * to start driving from Ruwi.
 *
 * ── A DELIBERATE REVERSAL ──
 *
 * A previous version of this suite asserted `never emits a Google URL`. That is no longer
 * the goal and the assertion has been REPLACED, not deleted: Android now uses the Google
 * Maps URL scheme because it is the only keyless way to carry an origin, a destination and
 * a travel mode in one link. What matters — and what is asserted below — is that no API
 * KEY, project or billing is involved. `maps.googleapis.com` (the paid Platform) must never
 * appear; `google.com/maps/dir` (the free URL scheme) is expected.
 */

const CLINIC = { latitude: 23.588, longitude: 58.3829, label: "Muscat Central Clinic" };
/** The India test case. ~2,900 km from the clinic above. */
const DELHI = { latitude: 28.6139, longitude: 77.209 };
const MUSCAT_FALLBACK = { latitude: 23.588, longitude: 58.3829 };

describe("isValidTarget", () => {
  it("accepts a real coordinate", () => {
    expect(isValidTarget(CLINIC)).toBe(true);
  });

  it("rejects missing, null and non-finite coordinates", () => {
    expect(isValidTarget(null)).toBe(false);
    expect(isValidTarget(undefined)).toBe(false);
    expect(isValidTarget({})).toBe(false);
    expect(isValidTarget({ latitude: 23.5 })).toBe(false);
    expect(isValidTarget({ latitude: Number.NaN, longitude: 58.4 })).toBe(false);
    expect(isValidTarget({ latitude: 23.5, longitude: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(isValidTarget({ latitude: 91, longitude: 58.4 })).toBe(false);
    expect(isValidTarget({ latitude: 23.5, longitude: -181 })).toBe(false);
  });
});

describe("M+N. the origin is the patient's REAL location, and Muscat is never substituted", () => {
  it("Android: an Indian GPS fix is the origin of an Oman route", () => {
    const url = buildDirectionsUrl("android", { destination: CLINIC, origin: DELHI, mode: "drive" });
    expect(url).toContain("origin=28.6139,77.209");
    expect(url).toContain("destination=23.588,58.3829");
  });

  it("iOS: the same fix becomes an explicit saddr", () => {
    const url = buildDirectionsUrl("ios", { destination: CLINIC, origin: DELHI, mode: "drive" });
    expect(url).toContain("saddr=28.6139,77.209");
    expect(url).toContain("daddr=23.588,58.3829");
  });

  it("REGRESSION: the Muscat fallback coordinate never appears as an origin", () => {
    // The out-of-coverage clinic LIST is anchored on Muscat. If that anchor ever leaked
    // into the route, the patient would be navigated from a city they are not in.
    for (const platform of ["ios", "android", "web"]) {
      const url = buildDirectionsUrl(platform, { destination: CLINIC, origin: DELHI });
      expect(url).not.toContain(`origin=${MUSCAT_FALLBACK.latitude},${MUSCAT_FALLBACK.longitude}`);
      expect(url).not.toContain(`saddr=${MUSCAT_FALLBACK.latitude},${MUSCAT_FALLBACK.longitude}`);
      expect(url).not.toContain(`route=${MUSCAT_FALLBACK.latitude},${MUSCAT_FALLBACK.longitude};`);
    }
  });

  it("REGRESSION: the clinic is never used as its own origin", () => {
    const url = buildDirectionsUrl("android", { destination: CLINIC, origin: DELHI });
    expect(url).not.toContain("origin=23.588,58.3829");
  });

  it("omits the origin entirely when there is no fix — never invents one", () => {
    for (const origin of [null, undefined]) {
      const a = buildDirectionsUrl("android", { destination: CLINIC, origin });
      const i = buildDirectionsUrl("ios", { destination: CLINIC, origin });
      expect(a).not.toContain("origin=");
      expect(i).not.toContain("saddr=");
      // …and the destination is still correct, so the handoff remains useful.
      expect(a).toContain("destination=23.588,58.3829");
      expect(i).toContain("daddr=23.588,58.3829");
    }
  });

  it("refuses a malformed origin rather than emitting NaN", () => {
    const url = buildDirectionsUrl("android", {
      destination: CLINIC,
      origin: { latitude: Number.NaN, longitude: 77.2 },
    });
    expect(url).not.toContain("NaN");
    expect(url).not.toContain("origin=");
  });

  it("the module cannot reach the Muscat constant at all", () => {
    // Structural guarantee: directions.ts does not import the map screen or its constants,
    // so there is no code path by which the fallback could become an origin.
    const src = fs.readFileSync(path.join(__dirname, "..", "directions.ts"), "utf8");
    expect(src).not.toMatch(/MUSCAT/);
    expect(src).not.toMatch(/58\.3829/);
  });
});

describe("O+P+Q+R. travel modes", () => {
  const modeUrl = (platform: string, mode: TravelMode) =>
    buildDirectionsUrl(platform, { destination: CLINIC, origin: DELHI, mode });

  it("O. drive", () => {
    expect(modeUrl("android", "drive")).toContain("travelmode=driving");
    expect(modeUrl("ios", "drive")).toContain("dirflg=d");
  });

  it("P. walk", () => {
    expect(modeUrl("android", "walk")).toContain("travelmode=walking");
    expect(modeUrl("ios", "walk")).toContain("dirflg=w");
  });

  it("Q. cycle — Android only, because Apple Maps' URL scheme has no bicycle flag", () => {
    expect(modeUrl("android", "cycle")).toContain("travelmode=bicycling");
    expect(travelModesFor("android")).toContain("cycle");
    expect(travelModesFor("ios")).not.toContain("cycle");
  });

  it("R. transit", () => {
    expect(modeUrl("android", "transit")).toContain("travelmode=transit");
    expect(modeUrl("ios", "transit")).toContain("dirflg=r");
  });

  it("defaults to driving when no mode is given", () => {
    expect(DEFAULT_TRAVEL_MODE).toBe("drive");
    expect(buildDirectionsUrl("android", { destination: CLINIC })).toContain("travelmode=driving");
  });

  it("offers transit for a plausible journey and withholds it for an impossible one", () => {
    // Within Oman: a transit answer is at least conceivable, so hand off and let the
    // provider answer honestly.
    expect(travelModesFor("android", 20)).toContain("transit");
    expect(travelModesFor("android", TRANSIT_MAX_KM)).toContain("transit");
    // Delhi → Muscat: no transit network crosses the Arabian Sea. Offering the chip would
    // promise something no provider can deliver.
    expect(travelModesFor("android", TRANSIT_MAX_KM + 1)).not.toContain("transit");
    expect(travelModesFor("android", 2900)).not.toContain("transit");
    expect(travelModesFor("ios", 2900)).not.toContain("transit");
  });

  it("offers transit when the distance is unknown, rather than hiding a working option", () => {
    expect(travelModesFor("android")).toContain("transit");
    expect(travelModesFor("android", null)).toContain("transit");
    expect(travelModesFor("android", Number.NaN)).toContain("transit");
  });

  it("always offers drive and walk on both platforms", () => {
    for (const p of ["ios", "android"]) {
      expect(travelModesFor(p, 5)).toEqual(expect.arrayContaining(["drive", "walk"]));
    }
  });
});

describe("no API key, no account, no billing", () => {
  it("uses the FREE Google Maps URL scheme on Android, not the paid Platform", () => {
    const url = buildDirectionsUrl("android", { destination: CLINIC, origin: DELHI });
    expect(url.startsWith("https://www.google.com/maps/dir/?")).toBe(true);
    expect(url).toContain("api=1"); // the URL-scheme marker, NOT an API key
  });

  it("no URL on any platform carries a key, token or Platform endpoint", () => {
    for (const platform of ["ios", "android", "web", "windows"]) {
      for (const mode of ["drive", "walk", "cycle", "transit"] as TravelMode[]) {
        const url = buildDirectionsUrl(platform, { destination: CLINIC, origin: DELHI, mode });
        expect(url).not.toMatch(/[?&]key=/);
        expect(url).not.toMatch(/api_key|apikey|access_token|client_id/i);
        expect(url).not.toContain("maps.googleapis.com");
      }
    }
  });
});

describe("fallback chain", () => {
  it("Android: Google URL → geo: → OpenStreetMap", () => {
    const chain = directionsUrlChain("android", { destination: CLINIC, origin: DELHI, mode: "drive" });
    expect(chain).toHaveLength(3);
    expect(chain[0]).toContain("google.com/maps/dir");
    expect(chain[1]!.startsWith("geo:23.588,58.3829")).toBe(true);
    expect(chain[2]).toContain("openstreetmap.org");
  });

  it("iOS: Apple Maps → OpenStreetMap (no geo: — it is an Android intent)", () => {
    const chain = directionsUrlChain("ios", { destination: CLINIC, origin: DELHI });
    expect(chain).toHaveLength(2);
    expect(chain[0]).toContain("maps.apple.com");
    expect(chain[1]).toContain("openstreetmap.org");
    expect(chain.some((u) => u.startsWith("geo:"))).toBe(false);
  });

  it("every link in the chain still carries the real origin where the format allows it", () => {
    const chain = directionsUrlChain("android", { destination: CLINIC, origin: DELHI });
    expect(chain[0]!).toContain("28.6139,77.209");
    // geo: has no origin field at all — it is a pin, and that is stated in the source.
    expect(chain[2]!).toContain("28.6139,77.209");
  });

  it("geo: keeps the label URL-encoded so an ampersand cannot break the intent", () => {
    const tricky = { ...CLINIC, label: "Al Noor & Co / Ruwi" };
    expect(geoFallbackUrl(tricky)).toContain(encodeURIComponent(tricky.label as string));
  });
});

describe("web fallback", () => {
  it("produces a real route when an origin is known", () => {
    const url = webDirectionsUrl({ destination: CLINIC, origin: DELHI, mode: "cycle" });
    expect(url).toContain("openstreetmap.org/directions");
    expect(url).toContain("route=28.6139,77.209;23.588,58.3829");
    expect(url).toContain("fossgis_osrm_bike");
  });

  it("degrades to a pin when there is no origin, rather than a half-built route", () => {
    const url = webDirectionsUrl({ destination: CLINIC });
    expect(url).toContain("mlat=23.588");
    expect(url).toContain("mlon=58.3829");
    expect(url).not.toContain("route=");
  });
});
