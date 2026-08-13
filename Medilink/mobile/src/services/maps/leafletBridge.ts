import { LEAFLET_CDN } from "./tiles";
import type { MapMarker, MapMessage, MapState, TileSource, UserLocation } from "./types";

/**
 * Pure builders for the Leaflet WebView. No React, no react-native imports — so this is
 * unit-testable and can never accidentally reach the network or a native module.
 *
 * SECURITY: clinic names come from the database and are therefore untrusted input for an
 * HTML context. Nothing is interpolated into markup as a string. All dynamic data crosses
 * into the page as a JSON literal via `encodeJson()`, and the page assigns it with
 * `textContent` (never `innerHTML`), so a name containing `</script>` or `<img onerror=…>`
 * cannot execute.
 */

/**
 * JSON for safe embedding in an inline `<script>`.
 *
 * `JSON.stringify` alone is NOT enough: a payload containing `</script>` would terminate
 * the script element early. Escaping `<` closes that, and U+2028/U+2029 are escaped
 * because they are valid JSON but illegal raw in JavaScript string literals.
 */
export function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Convert a react-native-maps style latitude span to a Leaflet zoom level, so the camera
 * framing carries over from the previous implementation instead of being re-tuned by eye.
 *
 * Derivation: the whole world spans 360° at zoom 0 and halves each level, so
 * `zoom ≈ log2(360 / span)`. Clamped to Leaflet's usable range.
 */
export function deltaToZoom(latitudeDelta: number): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) return 12;
  const zoom = Math.log2(360 / latitudeDelta);
  return Math.min(19, Math.max(1, Math.round(zoom)));
}

/**
 * Web-Mercator ground resolution — metres per screen pixel at a given latitude and zoom.
 * `156543.03392` m/px is the equator resolution at zoom 0.
 */
export function metresPerPixel(latitude: number, zoom: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Screen separation we want between pins that share a coordinate. */
export const DEDUPE_SEPARATION_PX = 26;

/** Minimum tappable pin box. Android's guidance is ~48dp; 44 is the shared floor with iOS. */
export const MARKER_HIT_SIZE_PX = 44;

/**
 * Pull byte-identical markers apart so every one of them can be tapped — SCALED TO ZOOM.
 *
 * ── WHY THE OLD FIXED 20 m FAILED ──
 *
 * Three verified clinics in Ruwi share the coordinate 23.588,58.3829 (a geocoder that fell
 * back to the city centre, not three clinics at one point). The previous implementation
 * spread them by a constant 20 m, which is only visible when you are zoomed right in:
 *
 *     zoom  6 (frames all of Oman — the India fallback view):  ~2243 m/px → 20 m = 0.009 px
 *     zoom 10:                                                  ~140 m/px → 20 m = 0.14 px
 *     zoom 16:                                                    ~2.2 m/px → 20 m = 9 px
 *
 * So in exactly the view this feature was reported broken in, the three pins were still
 * perfectly stacked and only the topmost was tappable — two dead markers out of ten.
 *
 * Offsetting by `DEDUPE_SEPARATION_PX * metresPerPixel(...)` instead makes the separation
 * constant ON SCREEN, so a coincident group stays individually tappable at every zoom.
 *
 * Deliberately unchanged from before: RENDER-ONLY (the repository, the RPC and the database
 * are untouched, and `distance_km` never moves, so ordering cannot drift), DETERMINISTIC
 * (the angle comes from the index, so a pin does not hop between renders), and EXACT
 * duplicates only (clinics 50 m apart are left where they are).
 */
export function spreadCoincident(pins: MapMarker[], zoom: number): MapMarker[] {
  const groups = new Map<string, MapMarker[]>();
  for (const p of pins) {
    const key = `${p.latitude},${p.longitude}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  const out: MapMarker[] = [];
  for (const group of groups.values()) {
    const only = group.length === 1 ? group[0] : undefined;
    if (only) {
      out.push(only);
      continue;
    }
    group.forEach((p, i) => {
      const offsetM = DEDUPE_SEPARATION_PX * metresPerPixel(p.latitude, zoom);
      // 1 degree of latitude ≈ 111,320 m; longitude shrinks by cos(latitude).
      const latDeg = offsetM / 111_320;
      const lngDeg = latDeg / Math.max(Math.cos((p.latitude * Math.PI) / 180), 0.01);
      const angle = (2 * Math.PI * i) / group.length;
      out.push({
        ...p,
        latitude: p.latitude + latDeg * Math.sin(angle),
        longitude: p.longitude + lngDeg * Math.cos(angle),
      });
    });
  }
  return out;
}

/** Drop markers with missing/invalid coordinates rather than letting Leaflet throw. */
export function sanitizeMarkers(markers: MapMarker[]): MapMarker[] {
  return markers.filter(
    (m) =>
      Number.isFinite(m.latitude) &&
      Number.isFinite(m.longitude) &&
      Math.abs(m.latitude) <= 90 &&
      Math.abs(m.longitude) <= 180
  );
}

/**
 * Framing distance ONLY. This is not, and must never become, the distance the patient
 * reads: ordering and every displayed `distance_km` come from PostGIS via
 * `get_nearby_facilities` and are never recomputed on the device. This haversine answers
 * one local question — "is the patient's pin in the same region as this clinic's pin, or
 * on another continent?" — which is a camera decision, not a clinical one.
 */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far a clinic may be from the patient and still be worth framing alongside them.
 * Matches `NEARBY_RADIUS_M`'s sibling constant `NEAR_ME_KM` in spirit, but is intentionally
 * looser: a clinic 120 km away is still a sensible thing to fit in view, whereas one 2,000
 * km away is what produced the bug below.
 */
export const FIT_USER_MAX_KM = 150;

/** Leaflet is never allowed to zoom out past this, whatever bounds it is handed. */
export const FIT_MIN_ZOOM = 4;

/**
 * Which points `fitBounds` is allowed to frame.
 *
 * ── THE BUG THIS FIXES ──
 *
 * The page previously pushed EVERY marker plus the patient pin into one `bounds` array and
 * called `map.fitBounds(bounds, { maxZoom: 15 })`. Two things were wrong with that.
 *
 * First, `maxZoom` clamps zooming IN, not OUT — there was no lower bound at all. Second,
 * and worse, `fitBounds` runs AFTER `setView(DATA.center, DATA.zoom)`, so it silently
 * overrode the camera the screen had carefully computed. The screen believed it was
 * centred on the patient; Leaflet re-framed to whatever box contained everything.
 *
 * With a device outside Oman that combination produced the reported screenshot: Omani
 * clinic pins on one side, the patient pin ~2,000 km away on the other, and a frame
 * stretched across the Arabian Sea to fit both. At that zoom the seven Muscat-area clinics
 * — which span about 28 km — fall inside a couple of pixels and read as a SINGLE marker,
 * which is why "only one clinic" appeared to be returned when in fact seven were.
 *
 * ── THE RULE ──
 *
 * The patient's own position wins. When we have a fix, we frame the patient plus only the
 * clinics genuinely near them; if none are, we return nothing and the caller's `setView`
 * stands, keeping the camera exactly where the screen asked for it. With no fix there is
 * no patient pin to argue with, so all markers are framed — that is the Muscat-fallback
 * view, and it is correct.
 *
 * Returns `[]` to mean "do not call fitBounds"; a single point is also `[]`, since fitting
 * one coordinate slams the map to maximum zoom.
 *
 * ── `includeUser: false` ──
 *
 * Out-of-coverage fallback. The patient is genuinely somewhere we do not serve (measured:
 * a device in Delhi is ~2,900 km from the nearest Omani clinic), and we are showing the
 * Oman clinics anyway so the screen is not blank. Framing must then ignore the patient
 * COMPLETELY — including them is the Arabian Sea bug by another route, and the
 * "clinics near you" filter below would drop every marker and leave the camera on India.
 *
 * This is a caller decision, not something to infer from distance: the caller already
 * knows the coverage state, and inferring it here would put the same rule in two places.
 */
export function selectFitPoints(
  markers: MapMarker[],
  user?: UserLocation | null,
  options?: { maxKm?: number; includeUser?: boolean }
): [number, number][] {
  const maxKm = options?.maxKm ?? FIT_USER_MAX_KM;
  const includeUser = options?.includeUser ?? true;
  const valid = sanitizeMarkers(markers);

  if (!includeUser || !user || !Number.isFinite(user.latitude) || !Number.isFinite(user.longitude)) {
    return valid.length > 1 ? valid.map((m) => [m.latitude, m.longitude]) : [];
  }

  const near = valid.filter((m) => haversineKm(m, user) <= maxKm);
  if (near.length === 0) return [];
  return [
    [user.latitude, user.longitude],
    ...near.map((m) => [m.latitude, m.longitude] as [number, number]),
  ];
}

/** Parse a `postMessage` payload from the WebView. Returns null for anything unexpected. */
export function parseMapMessage(raw: string): MapMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const msg = parsed as Record<string, unknown>;

  switch (msg.type) {
    case "ready":
      return { type: "ready" };
    case "mapPress":
      return { type: "mapPress" };
    case "markerPress":
      return typeof msg.id === "string" ? { type: "markerPress", id: msg.id } : null;
    case "zoom":
      return typeof msg.zoom === "number" && Number.isFinite(msg.zoom)
        ? { type: "zoom", zoom: msg.zoom }
        : null;
    case "userPan":
      return { type: "userPan" };
    case "error":
      return { type: "error", message: typeof msg.message === "string" ? msg.message : "map_error" };
    default:
      return null;
  }
}

/**
 * One imperative update, as JavaScript to inject into the LIVE page.
 *
 * ── WHY THIS EXISTS ──
 *
 * The page used to be rebuilt from scratch on every change and handed to the WebView as a
 * new `source={{html}}`, which RELOADS the document. Selecting a marker changed its
 * `selected` flag, which changed the HTML, which reloaded the map — so a tap tore down and
 * re-created the entire surface, discarding the user's pan and zoom and making markers feel
 * dead. Panning was pointless because the next render put the camera back.
 *
 * Now the document is built once and never regenerated for data. Markers, the patient pin
 * and the camera arrive through this function, so the map stays alive across every
 * interaction.
 *
 * ── THE CAMERA CONTRACT ──
 *
 * The page moves the camera ONLY when `fitToken` differs from the token it last applied.
 * The token is bumped by the screen on exactly four events (first load, first fix, coverage
 * transition, explicit "locate me"). Marker selection, search filtering and marker updates
 * all leave the token alone, so they can never recentre the map. This is what makes "do not
 * reset after a manual pan" structural rather than a heuristic.
 *
 * Returns a string ending in `true;` — required by `injectJavaScript` on iOS, which
 * otherwise warns about a non-serialisable evaluation result.
 */
export function buildStateScript(state: MapState): string {
  return `window.__mlApply && window.__mlApply(${encodeJson({
    markers: sanitizeMarkers(state.markers),
    user: state.userLocation ?? null,
    fit: state.fit,
    fitToken: state.fitToken,
    center: [state.camera.latitude, state.camera.longitude],
    zoom: deltaToZoom(state.camera.latitudeDelta),
  })}); true;`;
}


export interface LeafletHtmlOptions {
  tiles: TileSource;
  /** Applies the dark tile filter + dark chrome. */
  dark: boolean;
  /** Theme colours so pins match the app palette. */
  colors: { primary: string; accent: string; surface: string; text: string };
}

/**
 * The WebView document — built ONCE and never regenerated for data.
 *
 * ── WHAT CHANGED, AND WHY IT MATTERS ──
 *
 * This used to take `camera`, `markers` and `userLocation`. Every change to any of them
 * produced a new HTML string, and a new string handed to `source={{html}}` RELOADS the
 * document. Selecting a marker flipped its `selected` flag, which rebuilt the page, which
 * destroyed the map and re-created it — so a tap looked like a dead marker, and panning was
 * futile because the next render restored the camera.
 *
 * The options here are now only things that genuinely require a new document: the tile
 * provider and the colour scheme. Everything else arrives through `__mlApply` (see
 * `buildStateScript`) into the LIVE map.
 *
 * SECURITY is unchanged: no dynamic data is interpolated into markup. Marker titles cross
 * the boundary as a JSON literal and are written with `textContent`, never `innerHTML`, so
 * a clinic named `</script><img onerror=…>` cannot execute.
 *
 * INTERACTION: Leaflet's own `dragging`, `touchZoom`, `doubleClickZoom` and `scrollWheelZoom`
 * defaults are left ON and stated explicitly. `touch-action: none` on the container stops
 * the WebView's own gesture handling from swallowing pans before Leaflet sees them.
 */
export function buildLeafletHtml(options: LeafletHtmlOptions): string {
  const { tiles, dark, colors } = options;

  const boot = encodeJson({
    minZoom: FIT_MIN_ZOOM,
    hitSize: MARKER_HIT_SIZE_PX,
    tiles: {
      url: tiles.urlTemplate,
      attribution: tiles.attributionHtml,
      maxZoom: tiles.maxZoom,
    },
    colors,
    dark: dark && tiles.supportsDarkFilter,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CDN.css.url}" integrity="${LEAFLET_CDN.css.integrity}" crossorigin="anonymous" referrerpolicy="no-referrer" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${dark ? "#0F0A18" : "#F9F4FA"}; }
  /* Hand every touch gesture to Leaflet. Without this the WebView can claim the pan for
     its own (non-existent) document scrolling and the map feels frozen on Android. */
  html, body { overscroll-behavior: none; }
  #map, .leaflet-container { touch-action: none; }
  /* Dark mode for RASTER tiles: invert + hue-rotate is the standard trick, since OSM
     serves only a light raster style. Applied to tiles only, so pins stay true-colour. */
  .dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92); }
  .leaflet-container { background: ${dark ? "#0F0A18" : "#F9F4FA"}; font-family: -apple-system, Roboto, sans-serif; }
  /* The pin is a TRANSPARENT hit box with a small visible dot centred inside it, so the
     touch target meets the platform minimum without drawing a 44px blob. */
  .hit { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
         background: transparent; }
  .pin { width: 22px; height: 22px; border-radius: 50%; border: 3px solid #fff;
         box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .pin.sel { width: 32px; height: 32px; border-width: 4px; }
  .me { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
  #err { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
         text-align: center; padding: 24px; color: ${colors.text}; font-family: -apple-system, Roboto, sans-serif; font-size: 14px; z-index: 9999; }
</style>
</head>
<body class="${dark ? "dark" : ""}">
<div id="map"></div>
<div id="err"></div>
<script>
  var BOOT = ${boot};
  var map = null;
  var markerLayer = null;
  var userLayer = null;
  var lastFitToken = -1;

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function fail(message) {
    var el = document.getElementById("err");
    el.textContent = message;
    el.style.display = "flex";
    post({ type: "error", message: message });
  }
  window.onerror = function (m) { fail(String(m)); };

  function boot() {
    if (typeof L === "undefined") { fail("map_library_unavailable"); return; }
    try { init(); } catch (e) { fail(String(e && e.message ? e.message : e)); }
  }

  function init() {
    // Interaction handlers are Leaflet's defaults — stated explicitly so nobody "tidies"
    // them away again and silently freezes the map.
    map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      minZoom: BOOT.minZoom,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      bounceAtZoomLimits: false,
    }).setView([23.588, 58.3829], 6);

    L.control.zoom({ position: "topright" }).addTo(map);

    // Attribution is mandatory under ODbL — keep this layer's attribution intact.
    L.tileLayer(BOOT.tiles.url, {
      maxZoom: BOOT.tiles.maxZoom,
      attribution: BOOT.tiles.attribution,
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);

    map.on("click", function () { post({ type: "mapPress" }); });
    // "dragend" fires only for a real user drag, never for setView/fitBounds, so this is a
    // reliable "the user took control" signal. (No backticks in here: this whole document
    // lives inside a TS template literal.)
    map.on("dragend", function () { post({ type: "userPan" }); });
    map.on("zoomend", function () { post({ type: "zoom", zoom: map.getZoom() }); });

    post({ type: "ready" });
  }

  function drawMarkers(list) {
    markerLayer.clearLayers();
    list.forEach(function (m) {
      var dot = '<div class="hit"><div class="pin' + (m.selected ? " sel" : "") + '" style="background:' +
                (m.selected ? BOOT.colors.primary : BOOT.colors.accent) + '"></div></div>';
      var icon = L.divIcon({
        className: "",
        html: dot,
        iconSize: [BOOT.hitSize, BOOT.hitSize],
        iconAnchor: [BOOT.hitSize / 2, BOOT.hitSize / 2],
      });
      var marker = L.marker([m.latitude, m.longitude], {
        icon: icon,
        // Keep the selected pin above its neighbours so it is never buried.
        zIndexOffset: m.selected ? 500 : 0,
        keyboard: false,
        // Titles cross as data and are set as ATTRIBUTES by Leaflet, not as innerHTML.
        title: m.title,
        alt: m.title,
      }).addTo(markerLayer);

      // NO bindPopup: selection is shown by the pin state and the bottom card. A popup
      // would be a second, competing feedback channel that also covers the map.
      marker.on("click", function (ev) {
        if (ev && ev.originalEvent && ev.originalEvent.stopPropagation) ev.originalEvent.stopPropagation();
        post({ type: "markerPress", id: m.id });
      });
    });
  }

  function drawUser(u) {
    userLayer.clearLayers();
    if (!u) return;
    L.marker([u.latitude, u.longitude], {
      icon: L.divIcon({
        className: "",
        html: '<div class="hit"><div class="me" style="background:' + BOOT.colors.primary + '"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      // Non-interactive: the patient's own pin must never steal a tap from a clinic.
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(userLayer);
    if (u.accuracyM) {
      L.circle([u.latitude, u.longitude], {
        radius: u.accuracyM,
        color: BOOT.colors.primary, weight: 1, opacity: 0.4, fillOpacity: 0.08,
        interactive: false,
      }).addTo(userLayer);
    }
  }

  // THE ONLY WAY DATA ENTERS THE PAGE AFTER BOOT. Called by injectJavaScript; it never
  // reloads, so the user's pan and zoom survive every update.
  window.__mlApply = function (state) {
    if (!map) return;
    try {
      drawMarkers(state.markers || []);
      drawUser(state.user);

      // THE CAMERA CONTRACT: move only when the screen issues a NEW fit token. Marker
      // selection and search filtering reuse the current token, so they cannot recentre.
      if (state.fitToken !== lastFitToken) {
        lastFitToken = state.fitToken;
        if (state.fit && state.fit.length > 1) {
          map.fitBounds(state.fit, { padding: [48, 48], maxZoom: 15 });
        } else if (state.center) {
          map.setView(state.center, state.zoom);
        }
      }
    } catch (e) {
      fail(String(e && e.message ? e.message : e));
    }
  };
</script>
<script
  src="${LEAFLET_CDN.js.url}"
  integrity="${LEAFLET_CDN.js.integrity}"
  crossorigin="anonymous"
  referrerpolicy="no-referrer"
  onload="boot()"
  onerror="fail('map_library_unavailable')"></script>
</body>
</html>`;
}
