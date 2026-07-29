import { LEAFLET_CDN } from "./tiles";
import type { MapCamera, MapMarker, MapMessage, TileSource, UserLocation } from "./types";

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
    case "error":
      return { type: "error", message: typeof msg.message === "string" ? msg.message : "map_error" };
    default:
      return null;
  }
}

export interface LeafletHtmlOptions {
  camera: MapCamera;
  markers: MapMarker[];
  tiles: TileSource;
  /** Applies the dark tile filter + dark chrome. */
  dark: boolean;
  /** Patient position, when available. */
  userLocation?: UserLocation | null;
  /** Theme colours so pins match the app palette. */
  colors: { primary: string; accent: string; surface: string; text: string };
}

/**
 * The full WebView document. Self-contained apart from the pinned, SRI-verified Leaflet
 * assets — there is no application JavaScript served from a third party.
 */
export function buildLeafletHtml(options: LeafletHtmlOptions): string {
  const { camera, markers, tiles, dark, userLocation, colors } = options;

  const payload = encodeJson({
    center: [camera.latitude, camera.longitude],
    zoom: deltaToZoom(camera.latitudeDelta),
    markers: sanitizeMarkers(markers),
    user: userLocation ?? null,
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
  /* Dark mode for RASTER tiles: invert + hue-rotate is the standard trick, since OSM
     serves only a light raster style. Applied to tiles only, so pins stay true-colour. */
  .dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92); }
  .leaflet-container { background: ${dark ? "#0F0A18" : "#F9F4FA"}; font-family: -apple-system, Roboto, sans-serif; }
  .pin { width: 22px; height: 22px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .pin.sel { width: 30px; height: 30px; border-width: 4px; }
  .me { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
  .leaflet-popup-content { margin: 10px 12px; font-size: 13px; }
  .pt { font-weight: 700; display: block; }
  .ps { opacity: .7; display: block; margin-top: 2px; }
  #err { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
         text-align: center; padding: 24px; color: ${colors.text}; font-family: -apple-system, Roboto, sans-serif; font-size: 14px; }
</style>
</head>
<body class="${dark ? "dark" : ""}">
<div id="map"></div>
<div id="err"></div>
<script>
  // Data crosses the boundary as a JSON literal, never as interpolated markup.
  var DATA = ${payload};

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

  // Leaflet failing to load (offline, blocked CDN, SRI mismatch) must fail visibly,
  // never as a blank grey rectangle the user cannot interpret.
  function boot() {
    if (typeof L === "undefined") { fail("map_library_unavailable"); return; }
    try { render(); } catch (e) { fail(String(e && e.message ? e.message : e)); }
  }

  function textEl(cls, value) {
    var s = document.createElement("span");
    s.className = cls;
    s.textContent = value == null ? "" : String(value); // textContent => no HTML execution
    return s;
  }

  function render() {
    var map = L.map("map", { zoomControl: false, attributionControl: true })
      .setView(DATA.center, DATA.zoom);

    L.control.zoom({ position: "topright" }).addTo(map);

    // Attribution is mandatory under ODbL — keep this layer's attribution intact.
    L.tileLayer(DATA.tiles.url, {
      maxZoom: DATA.tiles.maxZoom,
      attribution: DATA.tiles.attribution,
    }).addTo(map);

    var bounds = [];

    DATA.markers.forEach(function (m) {
      var icon = L.divIcon({
        className: "",
        html: '<div class="pin' + (m.selected ? " sel" : "") + '" style="background:' +
              (m.selected ? DATA.colors.primary : DATA.colors.accent) + '"></div>',
        iconSize: m.selected ? [30, 30] : [22, 22],
        iconAnchor: m.selected ? [15, 15] : [11, 11],
      });

      var marker = L.marker([m.latitude, m.longitude], { icon: icon }).addTo(map);

      var content = document.createElement("div");
      content.appendChild(textEl("pt", m.title));
      if (m.subtitle) content.appendChild(textEl("ps", m.subtitle));
      marker.bindPopup(content);

      marker.on("click", function () { post({ type: "markerPress", id: m.id }); });
      bounds.push([m.latitude, m.longitude]);
    });

    if (DATA.user) {
      L.marker([DATA.user.latitude, DATA.user.longitude], {
        icon: L.divIcon({
          className: "",
          html: '<div class="me" style="background:' + DATA.colors.primary + '"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        zIndexOffset: 1000,
      }).addTo(map);

      if (DATA.user.accuracyM) {
        L.circle([DATA.user.latitude, DATA.user.longitude], {
          radius: DATA.user.accuracyM,
          color: DATA.colors.primary, weight: 1, opacity: 0.4, fillOpacity: 0.08,
        }).addTo(map);
      }
      bounds.push([DATA.user.latitude, DATA.user.longitude]);
    }

    // Frame everything when there is more than one point; a single pin keeps the
    // requested zoom so the view doesn't slam to max on one clinic.
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });

    map.on("click", function () { post({ type: "mapPress" }); });
    post({ type: "ready" });
  }
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
