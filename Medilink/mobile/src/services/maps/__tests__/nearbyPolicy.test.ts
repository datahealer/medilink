import fs from "fs";
import path from "path";

import {
  NEARBY_RADIUS_M,
  NEAR_ME_KM,
  OUT_OF_COVERAGE_KM,
  coverageFor,
  formatDistanceKm,
} from "../nearby";
import {
  FIT_MIN_ZOOM,
  FIT_USER_MAX_KM,
  haversineKm,
  selectFitPoints,
  buildLeafletHtml,
} from "../leafletBridge";
import { isUsableFix } from "../../../hooks/useCurrentLocation";
import type { MapMarker } from "../types";

/**
 * Regression suite for the Android "Clinics Near Me" defect (2026-08-13).
 *
 * The pre-existing `nearbyClinics.test.ts` passed throughout this bug, and that is the most
 * useful thing about it: it asserted that the ORIGIN IS DERIVED FROM THE HOOK, which was
 * true, while nothing ever asked the hook to produce a fix. The screen was structurally
 * correct and behaviourally wrong. Every test below therefore targets the behaviour, not
 * the shape — "is a fix requested at all", "does the camera stay on the patient", "can 0 km
 * be printed" — and the coordinates used are the real production ones read from
 * `get_nearby_facilities` during the investigation.
 */

// Production coordinates, verified live 2026-08-13 via the anon PostgREST endpoint.
const RUWI = { latitude: 23.588, longitude: 58.3829 }; // three clinics share this exact point
const GHALA = { latitude: 23.5486, longitude: 58.396 };
const KHOUDH = { latitude: 23.6167, longitude: 58.1667 };
const FIRQ = { latitude: 22.9333, longitude: 57.5333 }; // 113 km from Muscat
const SOHAR = { latitude: 24.3417, longitude: 56.7094 }; // 190 km
const SALALAH = { latitude: 17.0197, longitude: 54.0897 }; // 854 km
const DELHI = { latitude: 28.6139, longitude: 77.209 }; // ~2,000 km — the reported device case

const marker = (id: string, c: { latitude: number; longitude: number }): MapMarker => ({
  id,
  latitude: c.latitude,
  longitude: c.longitude,
  title: id,
});

const OMAN_MARKERS = [marker("ruwi", RUWI), marker("ghala", GHALA), marker("khoudh", KHOUDH)];

describe("search radius — clinics are not silently hidden", () => {
  it("covers the whole country, so no eligible clinic is dropped by ST_DWithin", () => {
    // The bug: a 50 km radius returned 7 of the 10 discoverable clinics from Muscat.
    // Firq (113 km), Falaj Al Qabail (190 km) and Al Nahdah (854 km) were invisible.
    expect(NEARBY_RADIUS_M).toBeGreaterThan(854 * 1000);
    for (const far of [FIRQ, SOHAR, SALALAH]) {
      expect(haversineKm(RUWI, far) * 1000).toBeLessThan(NEARBY_RADIUS_M);
    }
  });

  it("REGRESSION: the 50 km literal is gone from both call sites", () => {
    const hook = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "hooks", "queries", "useDiscovery.ts"),
      "utf8"
    );
    const repo = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "data", "real", "index.ts"),
      "utf8"
    );
    expect(hook).not.toMatch(/radiusM\s*\?\?\s*50000/);
    expect(repo).not.toMatch(/radiusM:\s*geo\.radiusM\s*\?\?\s*50000/);
    // ...and both now read the one shared constant.
    expect(hook).toMatch(/NEARBY_RADIUS_M/);
    expect(repo).toMatch(/NEARBY_RADIUS_M/);
  });

  it("is still bounded — an unbounded search would call another continent 'nearby'", () => {
    expect(Number.isFinite(NEARBY_RADIUS_M)).toBe(true);
    expect(haversineKm(RUWI, DELHI) * 1000).toBeGreaterThan(NEARBY_RADIUS_M);
  });
});

describe("coverage — 'near me' may not be claimed for a clinic on another continent", () => {
  it("reports `unknown` with no fix, whatever the distance says", () => {
    // Distances measured from the Muscat fallback are real, but they are not the patient's.
    expect(coverageFor(0, false)).toBe("unknown");
    expect(coverageFor(4.56, false)).toBe("unknown");
  });

  it("reports `near` inside the near-me threshold", () => {
    expect(coverageFor(0, true)).toBe("near");
    expect(coverageFor(NEAR_ME_KM, true)).toBe("near");
  });

  it("reports `far` for a real but distant clinic — it is shown, not hidden", () => {
    expect(coverageFor(NEAR_ME_KM + 0.1, true)).toBe("far");
    expect(coverageFor(113, true)).toBe("far"); // Firq from Muscat
    expect(coverageFor(OUT_OF_COVERAGE_KM, true)).toBe("far");
  });

  it("reports `outOfCoverage` beyond the served area", () => {
    expect(coverageFor(OUT_OF_COVERAGE_KM + 1, true)).toBe("outOfCoverage");
    expect(coverageFor(1800, true)).toBe("outOfCoverage"); // Delhi → Salalah
  });

  it("a real fix with ZERO rows is out of coverage, not unknown", () => {
    // Verified live: a device in Delhi returns 0 rows even at the 1,500 km radius. The
    // patient must be told we don't serve their area, not to widen a search they cannot
    // widen.
    expect(coverageFor(null, true)).toBe("outOfCoverage");
    expect(coverageFor(undefined, true)).toBe("outOfCoverage");
  });

  it("no fix and zero rows stays unknown — Muscat found nothing, not the patient", () => {
    expect(coverageFor(null, false)).toBe("unknown");
  });

  it("treats a corrupt distance as unknown, never as near", () => {
    expect(coverageFor(NaN, true)).toBe("unknown");
    expect(coverageFor(Infinity, true)).toBe("unknown");
    expect(coverageFor(-5, true)).toBe("unknown");
  });
});

describe("distance display — the server value is preserved, never fabricated", () => {
  it("never prints a bare 0", () => {
    const label = formatDistanceKm(0);
    expect(label).toEqual({ kind: "veryClose" });
    expect(JSON.stringify(label)).not.toContain('"0"');
  });

  it("keeps one decimal under 10 km, exactly as the RPC reported it", () => {
    // 4.56 km, Al Fajr Ghala from Ruwi — verified against PostGIS.
    expect(formatDistanceKm(4.56)).toEqual({ kind: "exact", value: "4.6" });
    expect(formatDistanceKm(0.1)).toEqual({ kind: "exact", value: "0.1" });
  });

  it("rounds to whole kilometres above 10 km", () => {
    expect(formatDistanceKm(14.08)).toEqual({ kind: "exact", value: "14" });
    expect(formatDistanceKm(854.12)).toEqual({ kind: "exact", value: "854" });
  });

  it("does not invent a distance when the server sent none", () => {
    expect(formatDistanceKm(null)).toBeNull();
    expect(formatDistanceKm(undefined)).toBeNull();
    expect(formatDistanceKm(NaN)).toBeNull();
    expect(formatDistanceKm(-1)).toBeNull();
  });

  it("never scales or re-bases the value — formatting only", () => {
    // A metres/kilometres mix-up would show here as a 1000x drift.
    expect(formatDistanceKm(22.29)).toEqual({ kind: "exact", value: "22" });
  });
});

describe("camera — the patient's position wins, and the map cannot zoom to a continent", () => {
  it("REGRESSION: a distant patient never drags the frame across the Arabian Sea", () => {
    // The exact reported state: Omani pins on screen, device in India.
    const fit = selectFitPoints(OMAN_MARKERS, { latitude: DELHI.latitude, longitude: DELHI.longitude });
    // Empty => no fitBounds => the caller's setView (centred on the patient) stands.
    expect(fit).toEqual([]);
  });

  it("includeUser:false frames the clinics ALONE — the out-of-coverage fallback", () => {
    const fit = selectFitPoints(
      OMAN_MARKERS,
      { latitude: DELHI.latitude, longitude: DELHI.longitude },
      { includeUser: false }
    );
    // Every clinic is framed…
    expect(fit.length).toBe(OMAN_MARKERS.length);
    // …and the patient's India coordinate appears nowhere in the bounds.
    expect(fit.map((p) => p[0])).not.toContain(DELHI.latitude);
    expect(fit.map((p) => p[1])).not.toContain(DELHI.longitude);
  });

  it("includeUser:false does not silently discard far-apart clinics", () => {
    // Salalah is 854 km from Ruwi. With the patient excluded there is no proximity filter
    // left to apply, so the national set must survive intact.
    const national = [...OMAN_MARKERS, marker("salalah", SALALAH), marker("sohar", SOHAR)];
    const fit = selectFitPoints(national, { latitude: DELHI.latitude, longitude: DELHI.longitude }, {
      includeUser: false,
    });
    expect(fit.length).toBe(national.length);
    expect(fit.map((p) => p[0])).toContain(SALALAH.latitude);
  });

  it("defaults to including the user, so in-coverage framing is unchanged", () => {
    const near = { latitude: 23.61, longitude: 58.44 };
    expect(selectFitPoints(OMAN_MARKERS, near)).toEqual(
      selectFitPoints(OMAN_MARKERS, near, { includeUser: true })
    );
  });

  it("a custom maxKm still works through the options object", () => {
    const near = { latitude: 23.61, longitude: 58.44 };
    // Ruwi/Ghala/Khoudh are all within ~28 km; a 1 km radius admits none of them.
    expect(selectFitPoints(OMAN_MARKERS, near, { maxKm: 1 })).toEqual([]);
  });

  it("frames the patient together with clinics that are genuinely near them", () => {
    const fit = selectFitPoints(OMAN_MARKERS, { latitude: 23.61, longitude: 58.44 });
    expect(fit.length).toBe(OMAN_MARKERS.length + 1);
    expect(fit[0]).toEqual([23.61, 58.44]); // the patient is in the box
  });

  it("drops only the clinics that are too far, keeping the near ones", () => {
    const mixed = [...OMAN_MARKERS, marker("salalah", SALALAH)];
    const fit = selectFitPoints(mixed, { latitude: 23.61, longitude: 58.44 });
    const lats = fit.map((p) => p[0]);
    expect(lats).not.toContain(SALALAH.latitude);
    expect(lats).toContain(RUWI.latitude);
  });

  it("frames every marker when there is no fix — the Muscat fallback view", () => {
    const fit = selectFitPoints(OMAN_MARKERS, null);
    expect(fit.length).toBe(OMAN_MARKERS.length);
  });

  it("returns nothing for a single point, so the map cannot slam to max zoom", () => {
    expect(selectFitPoints([marker("ruwi", RUWI)], null)).toEqual([]);
    expect(selectFitPoints([], null)).toEqual([]);
    expect(selectFitPoints([], { latitude: 23.61, longitude: 58.44 })).toEqual([]);
  });

  it("ignores a patient pin with non-finite coordinates rather than framing NaN", () => {
    const fit = selectFitPoints(OMAN_MARKERS, { latitude: NaN, longitude: 58.4 } as never);
    expect(fit.length).toBe(OMAN_MARKERS.length);
  });

  it("threshold is a distance, not a bounding box — 150 km in every direction", () => {
    expect(FIT_USER_MAX_KM).toBe(150);
    expect(haversineKm(RUWI, FIRQ)).toBeLessThan(FIT_USER_MAX_KM);
    expect(haversineKm(RUWI, SOHAR)).toBeGreaterThan(FIT_USER_MAX_KM);
  });

  it("buildLeafletHtml honours frameWithUser:false — India never enters the payload bounds", () => {
    const html = buildLeafletHtml({
      camera: { latitude: 23.588, longitude: 58.3829, latitudeDelta: 0.35, longitudeDelta: 0.35 },
      markers: OMAN_MARKERS,
      tiles: { urlTemplate: "u", attributionHtml: "a", maxZoom: 19, supportsDarkFilter: true },
      dark: false,
      userLocation: { latitude: DELHI.latitude, longitude: DELHI.longitude, accuracyM: 30 },
      frameWithUser: false,
      colors: { primary: "#1", accent: "#2", surface: "#3", text: "#4" },
    });
    const fit = JSON.parse(/"fit":(\[.*?\]\])/.exec(html)?.[1] ?? "[]");
    expect(fit.length).toBe(OMAN_MARKERS.length);
    expect(JSON.stringify(fit)).not.toContain(String(DELHI.latitude));
    // The pin itself is still DRAWN — we hide it from framing, we do not delete it.
    expect(html).toContain(`"user":{"latitude":${DELHI.latitude}`);
  });

  it("the page carries a hard zoom floor as a second line of defence", () => {
    const html = buildLeafletHtml({
      camera: { latitude: 23.588, longitude: 58.3829, latitudeDelta: 0.12, longitudeDelta: 0.12 },
      markers: OMAN_MARKERS,
      tiles: { urlTemplate: "u", attributionHtml: "a", maxZoom: 19, supportsDarkFilter: true },
      dark: false,
      userLocation: null,
      colors: { primary: "#1", accent: "#2", surface: "#3", text: "#4" },
    });
    expect(html).toContain("minZoom: DATA.minZoom");
    expect(html).toContain(`"minZoom":${FIT_MIN_ZOOM}`);
    // REGRESSION: the page must no longer build its own bounds from markers + user.
    expect(html).not.toMatch(/bounds\.push\(/);
    expect(html).toContain("DATA.fit.length > 1");
  });

  it("haversine framing is local only — the RPC ordering is never recomputed", () => {
    const raw = fs.readFileSync(path.join(__dirname, "..", "leafletBridge.ts"), "utf8");
    // Comments stripped: the file discusses distance_km at length, and prose is not code.
    const bridge = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // The helper exists here, and only for framing…
    expect(bridge).toMatch(/export function haversineKm/);
    // …and it never touches distance_km or sorts anything.
    expect(bridge).not.toMatch(/distance_km/);
    expect(bridge).not.toMatch(/\.sort\(/);
  });
});

describe("GPS validity — a placeholder coordinate is not a location", () => {
  it("REGRESSION: rejects the Null Island sentinel some Android stacks emit", () => {
    expect(isUsableFix(0, 0)).toBe(false);
  });

  it("accepts a real Omani fix", () => {
    expect(isUsableFix(23.588, 58.3829)).toBe(true);
  });

  it("accepts a legitimate zero on ONE axis", () => {
    // 0° latitude on the equator with a real longitude is a real place.
    expect(isUsableFix(0, 58.3829)).toBe(true);
    expect(isUsableFix(23.588, 0)).toBe(true);
  });

  it("rejects NaN, Infinity, non-numbers and out-of-range values", () => {
    expect(isUsableFix(NaN, 58)).toBe(false);
    expect(isUsableFix(23, NaN)).toBe(false);
    expect(isUsableFix(Infinity, 58)).toBe(false);
    expect(isUsableFix("23.5" as unknown, 58)).toBe(false);
    expect(isUsableFix(null, 58)).toBe(false);
    expect(isUsableFix(undefined, undefined)).toBe(false);
    expect(isUsableFix(91, 58)).toBe(false);
    expect(isUsableFix(23, 181)).toBe(false);
  });
});

describe("the map screen actually asks for a location", () => {
  const MAP = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "search", "map.tsx"),
    "utf8"
  );
  const src = MAP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("REGRESSION: requests a fix on mount — the root cause was that it never did", () => {
    // `useCurrentLocation()` with no options defaults auto:false, so `request()` was only
    // ever reachable via a tap on a small text link. Every open used Muscat.
    expect(src).toMatch(/useCurrentLocation\(\{\s*auto:\s*true\s*\}\)/);
    expect(src).not.toMatch(/useCurrentLocation\(\)/);
  });

  it("REGRESSION: holds the query back until the location attempt settles", () => {
    // Otherwise it queries from Muscat, paints Omani pins, then re-queries — the window in
    // which Muscat clinics and a distant patient pin appear in the same frame.
    expect(src).toMatch(/locationSettled\s*=\s*location\.status !== "idle" && location\.status !== "requesting"/);
    expect(src).toMatch(/useNearbyClinics\(origin,\s*\{\s*enabled:\s*locationSettled\s*\}\)/);
    expect(src).toMatch(/!locationSettled \|\| query\.isLoading/);
  });

  it("still keeps Muscat as a labelled fallback and never as a silent substitute", () => {
    expect(src).toMatch(/:\s*\{\s*lat:\s*MUSCAT\.lat,\s*lng:\s*MUSCAT\.lng\s*\}/);
    // The fallback branch is guarded by the absence of a real fix, nothing else.
    expect(src).toMatch(/location\.hasLocation && location\.coords/);
    expect(src).toContain("map.nearMuscat");
    expect(src).toContain("map.nearYou");
  });

  it("does not print a raw distance_km any more", () => {
    expect(src).not.toMatch(/\$\{active\.distance_km\}/);
    expect(src).toMatch(/formatDistanceKm/);
  });

  it("distinguishes permission-denied from services-disabled from no-fix", () => {
    for (const key of [
      "map.locationDeniedBody",
      "map.locationServicesOffBody",
      "map.locationUnavailableBody",
      "map.locationPromptBody",
    ]) {
      expect(src).toContain(key);
    }
    // Denied and services-off offer Settings; the others offer a retry.
    expect(src).toMatch(/action:\s*"settings"/);
    expect(src).toMatch(/action:\s*"request"/);
  });

  it("keeps the out-of-coverage and far states distinct", () => {
    expect(src).toMatch(/outOfCoverage\s*=\s*coverage === "outOfCoverage"/);
    expect(src).toContain("map.outOfCoverageTitle");
    expect(src).toContain("map.nearestIsFar");
  });

  it("still never truncates or re-sorts the clinic list", () => {
    expect(src).not.toMatch(/\.slice\(/);
    expect(src).not.toMatch(/\.sort\(/);
    expect(src).not.toMatch(/6371/);
  });
});

describe("out-of-coverage fallback — the map stays visible and useful", () => {
  const MAP = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "..", "app", "(app)", "search", "map.tsx"),
    "utf8"
  );
  const src = MAP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("REGRESSION: the clinic list is no longer emptied when out of coverage", () => {
    // The exact line that blanked the screen: `if (coverage === "outOfCoverage") return [];`
    // inside the clinics useMemo.
    expect(src).not.toMatch(/if \(coverage === "outOfCoverage"\) return \[\];/);
    expect(src).not.toMatch(/outOfCoverage\) return \[\]/);
  });

  it("sources the fallback from the SAME RPC with the Muscat origin, gated on out-of-coverage", () => {
    expect(src).toMatch(
      /useNearbyClinics\(\s*\{\s*lat:\s*MUSCAT\.lat,\s*lng:\s*MUSCAT\.lng\s*\},\s*\{\s*enabled:\s*outOfCoverage\s*\}\s*\)/
    );
    // No second endpoint, no hand-rolled clinic list, no seeded data.
    expect(src).not.toMatch(/apiFetch/);
    expect(src).not.toMatch(/mockRepositories|mock\./);
  });

  it("swaps the SOURCE of the markers, not their existence", () => {
    expect(src).toMatch(/outOfCoverage \? \(fallbackQuery\.data \?\? \[\]\) : all/);
    // Markers still derive from `clinics`, which still derives from `source`.
    expect(src).toMatch(/return source\.filter\(/);
  });

  it("does not fire the fallback query until the primary one has actually answered", () => {
    expect(src).toMatch(/query\.isSuccess\s*\?\s*coverageFor/);
  });

  it("frames the clinics ALONE — the India coordinate is excluded from the bounds", () => {
    expect(src).toMatch(/frameWithUser=\{!outOfCoverage\}/);
  });

  it("anchors the camera on a clinic, never on the patient, when out of coverage", () => {
    expect(src).toMatch(/const camera: MapCamera = outOfCoverage/);
    expect(src).toMatch(/anchorClinic/);
  });

  it("never converts the patient's position into a fake Oman location", () => {
    // userLocation is still derived ONLY from a real fix — the fallback origin is used for
    // the QUERY, never written back into the pin.
    expect(src).toMatch(/const userLocation: UserLocation \| null =\s*location\.hasLocation && location\.coords/);
    expect(src).not.toMatch(/userLocation\s*=\s*\{[^}]*MUSCAT/);
  });

  it("shows the required two-line notice", () => {
    expect(src).toContain("map.outOfCoverageNoticeTitle");
    expect(src).toContain("map.outOfCoverageNoticeBody");
    expect(src).toMatch(/outOfCoverage && clinics\.length > 0/);
  });

  it("NO misleading proximity wording in fallback mode", () => {
    // The footer must not fall through to "Sorted by distance from you".
    expect(src).toMatch(/\{outOfCoverage\s*\?\s*t\("map\.outOfCoverageNoticeBody"\)/);
  });

  it("NO misleading distance: the Muscat-relative value is suppressed entirely", () => {
    expect(src).toMatch(/const distance = outOfCoverage \? null : formatDistanceKm\(/);
  });

  it("keeps search working over the fallback set", () => {
    expect(src).toMatch(/source\.filter\(\s*\(c\) =>\s*c\.name\.toLowerCase\(\)\.includes\(q\)/);
    // Search is applied AFTER the source is chosen, so it narrows whichever set is in play.
    expect(src.indexOf("const source: Clinic[]")).toBeLessThan(src.indexOf("return source.filter("));
  });

  it("still shows a real empty state when the backend has no clinic at all", () => {
    expect(src).toMatch(/outOfCoverage && source\.length === 0/);
    expect(src).toContain("map.emptyTitle");
  });

  it("waits for, and can retry, the fallback query", () => {
    expect(src).toMatch(/fallbackQuery\.isLoading/);
    expect(src).toMatch(/fallbackQuery\.isError/);
    expect(src).toMatch(/fallbackQuery\.refetch\(\)/);
  });

  it("REGRESSION: markers, spreading, tap-through and directions are untouched", () => {
    expect(src).toMatch(/spreadCoincident\(/);
    expect(src).toMatch(/onMarkerPress=\{setSelectedId\}/);
    expect(src).toMatch(/router\.push\(`\/clinics\/\$\{c\.id\}`\)/);
    expect(src).toMatch(/<Card onPress=\{\(\) => openClinic\(active\)\}/);
    expect(src).toMatch(/onPress=\{\(\) => openDirections\(active\)\}/);
    expect(src).toMatch(/nativeDirectionsUrl/);
    expect(src).toMatch(/webDirectionsUrl/);
  });

  it("REGRESSION: the denied / services-disabled Muscat fallback is unchanged", () => {
    expect(src).toMatch(/:\s*\{\s*lat:\s*MUSCAT\.lat,\s*lng:\s*MUSCAT\.lng\s*\}/);
    expect(src).toContain("map.nearMuscat");
    expect(src).toContain("map.locationDeniedBody");
    expect(src).toContain("map.locationServicesOffBody");
    expect(src).toMatch(/Linking\.openSettings\(\)/);
  });

  it("REGRESSION: privacy rules hold — no persistence, no logging of the coordinate", () => {
    expect(src).not.toMatch(/AsyncStorage/);
    expect(src).not.toMatch(/SecureStore/);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/reportError/);
  });

  it("mirrors the notice for RTL", () => {
    expect(src).toMatch(/textAlign: isRTL \? "right" : "left"/);
  });
});

describe("localization parity for the new copy", () => {
  const read = (l: string) =>
    fs.readFileSync(path.join(__dirname, "..", "..", "..", "i18n", `${l}.ts`), "utf8");
  const en = read("en");
  const ar = read("ar");

  it.each([
    "outOfCoverageTitle",
    "outOfCoverageBody",
    "outOfCoverageNoticeTitle",
    "outOfCoverageNoticeBody",
    "nearestIsFar",
    "distanceVeryClose",
  ])("%s exists in both catalogs", (key) => {
    expect(en).toContain(`${key}:`);
    expect(ar).toContain(`${key}:`);
  });

  it("the notice copy says exactly what the product asked for", () => {
    expect(en).toContain('outOfCoverageNoticeTitle: "No MediLink clinics near your location"');
    expect(en).toContain('outOfCoverageNoticeBody: "Showing MediLink clinics in Oman."');
  });

  it("the Arabic strings are Arabic, not an English fallback", () => {
    for (const key of [
      "outOfCoverageTitle",
      "outOfCoverageNoticeTitle",
      "outOfCoverageNoticeBody",
      "nearestIsFar",
      "distanceVeryClose",
    ]) {
      const line = ar.split(/\r?\n/).find((l) => l.includes(`${key}:`)) ?? "";
      expect(line).toMatch(/[؀-ۿ]/);
    }
  });
});
