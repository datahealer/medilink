import fs from "fs";
import path from "path";

/**
 * Nearby Clinics — the map screen's contract.
 *
 * The claim these tests exist to defend is narrow and specific: **the patient's real
 * coordinates reach `get_nearby_facilities`, and the ordering the user sees is the ordering
 * that RPC returned for those coordinates.** Everything else on this screen is cosmetic by
 * comparison, and the previous implementation looked correct while silently querying a
 * hardcoded Muscat constant.
 *
 * Screen-level assertions are made against the source. Rendering `map.tsx` would require
 * standing up a WebView, expo-router, React Query, theme and i18n providers, and the
 * properties at risk here are structural — "which coordinate is passed", "which route is
 * pushed", "is distance recomputed locally" — not visual.
 */
const MAP_SCREEN = path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "search", "map.tsx");
const raw = fs.readFileSync(MAP_SCREEN, "utf8");
/** Code with comments stripped — the file documents the fallback at length. */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("6. the patient's coordinates are what get queried", () => {
  it("derives the RPC origin from the location hook, not from a constant", () => {
    expect(src).toMatch(/useCurrentLocation\(/);
    // origin = real coords when we have them...
    expect(src).toMatch(/location\.hasLocation && location\.coords/);
    expect(src).toMatch(/lat:\s*location\.coords\.latitude/);
    expect(src).toMatch(/lng:\s*location\.coords\.longitude/);
    // ...and that origin is what the query receives. (The call now also carries an
    // `enabled` gate — see nearbyPolicy.test.ts — so this matches the argument, not the
    // whole call.)
    expect(src).toMatch(/useNearbyClinics\(origin\b/);
  });

  it("REGRESSION: the PRIMARY query is never anchored to the Muscat constant", () => {
    // The original bug: `const query = useNearbyClinics({ lat: MUSCAT.lat, lng: MUSCAT.lng })`
    // — the proximity search itself hardcoded to a city.
    //
    // This can no longer be a blanket ban on the literal, because the out-of-coverage
    // fallback deliberately queries the national list from that same centroid. The
    // distinction that matters is WHICH query: the primary one must take `origin`, and any
    // Muscat-anchored call must be the fallback, which is gated on `enabled: outOfCoverage`
    // and can therefore never serve as the proximity search.
    expect(src).toMatch(/const query = useNearbyClinics\(origin\b/);
    const muscatCalls = src.match(/useNearbyClinics\(\s*\{\s*lat:\s*MUSCAT\.lat[\s\S]*?\)\s*;/g) ?? [];
    for (const call of muscatCalls) {
      expect(call).toMatch(/enabled:\s*outOfCoverage/);
    }
  });

  it("keeps MUSCAT only as a fallback origin, reachable when there is no fix", () => {
    expect(src).toMatch(/MUSCAT\s*=\s*\{\s*lat:/);
    // The fallback branch of the origin ternary.
    expect(src).toMatch(/:\s*\{\s*lat:\s*MUSCAT\.lat,\s*lng:\s*MUSCAT\.lng\s*\}/);
  });
});

describe("7. ordering stays server-side", () => {
  it("does NOT recompute the DISPLAYED distance on the client", () => {
    // The guarantee: what the patient reads, and the order they read it in, come from
    // PostGIS. A locally-computed display distance would silently diverge from the RPC.
    //
    // `haversineKm` IS now imported, for exactly one thing: deciding whether offering a
    // Transit chip is honest for this journey (`journeyKm`). That value is never rendered
    // and never sorted on, which is what the two assertions below pin down.
    expect(src).toMatch(/const journeyKm =/);
    expect(src).not.toMatch(/distance_km\s*=/); // never assigned locally
    expect(src).not.toMatch(/Math\.asin/); // no hand-rolled haversine in the screen
    expect(src).not.toMatch(/6371/);
    // The only value fed to the distance formatter is the server's own field.
    expect(src).toMatch(/formatDistanceKm\(active\?\.distance_km\)/);
    // journeyKm feeds the mode list and nothing else.
    expect(src).toMatch(/travelModesFor\(Platform\.OS, journeyKm\)/);
    expect(src).not.toMatch(/formatDistanceKm\(journeyKm\)/);
  });

  it("does NOT re-sort the RPC result", () => {
    // `.sort(` anywhere here would override ORDER BY distance_km ASC.
    expect(src).not.toMatch(/\.sort\(/);
    expect(src).not.toMatch(/distance_km\s*-\s*/);
  });

  it("renders distance_km straight from the server row", () => {
    // Optional-chained since the card can render before a selection resolves, and passed
    // through `formatDistanceKm`, which formats and never recomputes — see
    // nearbyPolicy.test.ts for the value-preservation cases.
    expect(src).toMatch(/active\??\.distance_km/);
  });

  it("the filter preserves order (filter, never reorder)", () => {
    // Search narrows the list; it must not shuffle it.
    expect(src).toMatch(/\.filter\(/);
  });
});

describe("9. clinic selection routes to the details screen", () => {
  it("pushes /clinics/<id>", () => {
    expect(src).toMatch(/router\.push\(`\/clinics\/\$\{c\.id\}`\)/);
  });

  it("the card body opens the clinic, not directions", () => {
    expect(src).toMatch(/<Card onPress=\{\(\) => openClinic\(active\)\}/);
    // REGRESSION: the card used to open directions, making details unreachable from the map.
    expect(src).not.toMatch(/<Card onPress=\{\(\) => openDirections\(active\)\}/);
  });
});

describe("10. directions remain available as a separate action", () => {
  it("keeps the native handoff helpers", () => {
    // `nativeDirectionsUrl`/`webDirectionsUrl` were replaced by one ordered fallback chain
    // that also carries the origin and the travel mode — see directions.test.ts.
    expect(src).toMatch(/directionsUrlChain\(Platform\.OS/);
    expect(src).toMatch(/isValidTarget/);
    // Coordinate validation still gates the handoff, so a null geo cannot open "NaN,NaN".
    expect(src).toMatch(/if \(!isValidTarget\(destination\)\) return;/);
  });

  it("exposes directions as its own control", () => {
    expect(src).toMatch(/onPress=\{\(\) => openDirections\(active\)\}/);
    expect(src).toMatch(/accessibilityLabel=\{t\("map\.directions"\)\}/);
  });
});

describe("patient pin is only ever drawn from a real fix", () => {
  it("never derives userLocation from the Muscat fallback", () => {
    expect(src).toMatch(/const userLocation: UserLocation \| null =\s*location\.hasLocation && location\.coords/);
  });

  it("REGRESSION: userLocation is no longer hardcoded null", () => {
    expect(src).not.toMatch(/const userLocation: UserLocation \| null = null/);
  });
});

describe("8. the screen never persists the coordinate", () => {
  it("has no storage, network or logging sink for the position", () => {
    expect(src).not.toMatch(/AsyncStorage/);
    expect(src).not.toMatch(/SecureStore/);
    expect(src).not.toMatch(/apiFetch/);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/reportError/);
  });

  it("the coordinate leaves the device only via the nearby query and the directions handoff", () => {
    const uses = src.match(/location\.coords/g) ?? [];
    // origin lat/lng, userLocation guard + lat/lng/accuracy, directionsOrigin guard +
    // lat/lng — and nothing else. Both consumers are explicitly approved.
    expect(uses.length).toBeLessThanOrEqual(12);
    expect(src).toMatch(/useNearbyClinics\(origin\b/);
    // The directions origin is the REAL fix, never the Muscat discovery anchor.
    expect(src).toMatch(/const directionsOrigin = location\.hasLocation && location\.coords/);
    expect(src).not.toMatch(/origin:\s*\{\s*latitude:\s*MUSCAT/);
  });
});

describe("overlapping-marker de-overlap (audit finding)", () => {
  /**
   * De-overlap MOVED, deliberately: it now lives in `services/maps/leafletBridge` and is
   * applied by `OsmMapView`, because the offset has to be computed from the RENDERED zoom
   * and only the map component knows that. The fixed 20 m version that used to live in the
   * screen was 0.009 px at the zoom that frames all of Oman — invisible in exactly the
   * out-of-coverage view where the stacked Ruwi pins were reported. See nearbyPolicy.test.ts.
   */
  const view = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "components", "ui", "OsmMapView.tsx"),
    "utf8"
  );

  it("spreads only EXACT duplicates, at render time, against the live zoom", () => {
    expect(view).toMatch(/spreadCoincident\(markers, zoom\)/);
    const bridge = fs.readFileSync(path.join(__dirname, "..", "leafletBridge.ts"), "utf8");
    expect(bridge).toMatch(/export function spreadCoincident/);
    expect(bridge).toMatch(/DEDUPE_SEPARATION_PX/);
  });

  it("does not mutate clinic data or the distance used for ordering", () => {
    // The offset applies to MapMarker copies; distance_km is never touched.
    expect(src).not.toMatch(/c\.latitude\s*=/);
    expect(src).not.toMatch(/distance_km\s*=/);
  });
});

describe("location-state UI never claims Muscat is the patient", () => {
  it("has a distinct message per cause", () => {
    for (const key of [
      "map.locationPromptBody",
      "map.locationDeniedBody",
      "map.locationServicesOffBody",
      "map.locationUnavailableBody",
    ]) {
      expect(src).toContain(key);
    }
  });

  it("states which origin the distances are measured from", () => {
    expect(src).toContain("map.nearYou");
    expect(src).toContain("map.nearMuscat");
  });

  it("offers Settings when re-prompting cannot help", () => {
    // iOS will not re-prompt after a refusal, and a system-wide toggle is not ours to flip.
    expect(src).toMatch(/Linking\.openSettings\(\)/);
    expect(src).toContain("map.openSettings");
  });
});

describe("11+12+13. localization parity for the new keys", () => {
  const readCatalog = (locale: string) =>
    fs.readFileSync(path.join(__dirname, "..", "..", "..", "i18n", `${locale}.ts`), "utf8");
  const en = readCatalog("en");
  const ar = readCatalog("ar");

  const NEW_KEYS = [
    "km",
    "doctorsCount",
    "locateCta",
    "locating",
    "locationPromptTitle",
    "locationPromptBody",
    "locationDeniedBody",
    "locationServicesOffBody",
    "locationUnavailableBody",
    "openSettings",
    "nearYou",
    "nearMuscat",
    "viewClinic",
  ];

  it.each(NEW_KEYS)("%s exists in BOTH catalogs", (key) => {
    expect(en).toMatch(new RegExp(`\\b${key}:\\s*"`));
    expect(ar).toMatch(new RegExp(`\\b${key}:\\s*"`));
  });

  it("11. km is translated, not a Latin literal in Arabic", () => {
    expect(en).toMatch(/\bkm:\s*"km"/);
    expect(ar).toMatch(/\bkm:\s*"كم"/);
  });

  it("12. doctorsCount is a parameterised translation in both locales", () => {
    expect(en).toMatch(/doctorsCount:\s*"\{count\} doctors"/);
    expect(ar).toMatch(/doctorsCount:\s*"\{count\} طبيب"/);
  });

  it("REGRESSION: no screen renders a hardcoded ' km' or ' doctors' any more", () => {
    const screens = [
      path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "search", "map.tsx"),
      path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "(tabs)", "dashboard.tsx"),
      path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "(tabs)", "search.tsx"),
    ];
    for (const file of screens) {
      const body = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(body).not.toMatch(/\$\{[^}]*\}\s+km`/);
      expect(body).not.toMatch(/\$\{[^}]*\}\s+doctors`/);
    }
  });

  it("13. Arabic copy is present for the RTL states (no English fallback leaking)", () => {
    // A missing Arabic key renders the raw key string, which is what this guards against.
    for (const key of ["nearYou", "nearMuscat", "locateCta"]) {
      const line = ar.split(/\r?\n/).find((l) => l.includes(`${key}:`)) ?? "";
      expect(line).toMatch(/[؀-ۿ]/); // contains Arabic script
    }
  });

  it("the map screen mirrors layout for RTL", () => {
    expect(src).toMatch(/isRTL \? "row-reverse" : "row"/);
    expect(src).toMatch(/direction=\{isRTL \? "left" : "right"\}/);
  });
});
