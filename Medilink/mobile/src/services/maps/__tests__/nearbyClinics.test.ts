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

  it("REGRESSION: no longer passes the Muscat constant as the search origin", () => {
    // The exact bug: useNearbyClinics({ lat: MUSCAT.lat, lng: MUSCAT.lng }).
    expect(src).not.toMatch(/useNearbyClinics\(\s*\{\s*lat:\s*MUSCAT\.lat/);
  });

  it("keeps MUSCAT only as a fallback origin, reachable when there is no fix", () => {
    expect(src).toMatch(/MUSCAT\s*=\s*\{\s*lat:/);
    // The fallback branch of the origin ternary.
    expect(src).toMatch(/:\s*\{\s*lat:\s*MUSCAT\.lat,\s*lng:\s*MUSCAT\.lng\s*\}/);
  });
});

describe("7. ordering stays server-side", () => {
  it("does NOT recompute distance on the client", () => {
    // A local haversine would silently diverge from PostGIS and break the ordering claim.
    expect(src).not.toMatch(/haversine/i);
    expect(src).not.toMatch(/Math\.asin/);
    expect(src).not.toMatch(/6371/);
    expect(src).not.toMatch(/toRad/);
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
    expect(src).toMatch(/nativeDirectionsUrl/);
    expect(src).toMatch(/webDirectionsUrl/);
    expect(src).toMatch(/isValidTarget/);
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

  it("the only outbound use of the coordinate is the nearby-clinics query", () => {
    const uses = src.match(/location\.coords/g) ?? [];
    // origin lat, origin lng, userLocation guard, lat, lng, accuracy — and nothing else.
    expect(uses.length).toBeLessThanOrEqual(8);
    expect(src).toMatch(/useNearbyClinics\(origin\b/);
  });
});

describe("overlapping-marker de-overlap (audit finding)", () => {
  it("spreads only EXACT duplicates, at render time", () => {
    expect(src).toMatch(/spreadCoincident/);
    expect(src).toMatch(/DEDUPE_OFFSET_M/);
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
