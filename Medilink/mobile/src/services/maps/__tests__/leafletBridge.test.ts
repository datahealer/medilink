import {
  buildLeafletHtml,
  buildStateScript,
  deltaToZoom,
  encodeJson,
  parseMapMessage,
  sanitizeMarkers,
} from "../leafletBridge";
import { LEAFLET_CDN, OSM_STANDARD } from "../tiles";
import type { MapMarker, UserLocation } from "../types";

const COLORS = { primary: "#2E1A47", accent: "#6E4AA0", surface: "#FFFFFF", text: "#241338" };
const CAMERA = { latitude: 23.588, longitude: 58.3829, latitudeDelta: 0.35, longitudeDelta: 0.35 };

/**
 * The document no longer carries markers, the camera or the patient pin. Those now reach
 * the LIVE page through `buildStateScript` → `__mlApply`, so that selecting a clinic stops
 * reloading the WebView and destroying the user's pan. Assertions about DATA therefore
 * target `state()`; assertions about the DOCUMENT still target `html()`.
 */
function html(dark = false) {
  return buildLeafletHtml({ tiles: OSM_STANDARD, dark, colors: COLORS });
}

function state(markers: MapMarker[] = [], userLocation: UserLocation | null = null) {
  return buildStateScript({ markers, userLocation, fit: [], fitToken: 1, camera: CAMERA });
}

/**
 * The WebView map renders untrusted database text (clinic names) inside an HTML document.
 * These tests exist because an escaping regression here is a script-injection bug, and it
 * would only ever be noticed in production with a maliciously-named facility.
 */
describe("encodeJson — script-context escaping", () => {
  it("neutralises a </script> breakout attempt", () => {
    const out = encodeJson({ title: "</script><img src=x onerror=alert(1)>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<img");
    expect(out).toContain("\\u003c");
  });

  it("escapes both angle brackets", () => {
    const out = encodeJson({ t: "<b>x</b>" });
    expect(out).not.toMatch(/[<>]/);
  });

  it("escapes U+2028 / U+2029, which are legal JSON but illegal in JS string literals", () => {
    const out = encodeJson({ t: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
  });

  it("still produces JSON the page can parse back", () => {
    const value = { title: "Al <Noor> Clinic", n: 3, ok: true, nested: { a: [1, 2] } };
    // Undo only the escaping we added; the result must round-trip exactly.
    const decoded = encodeJson(value).replace(/\\u003c/g, "<").replace(/\\u003e/g, ">");
    expect(JSON.parse(decoded)).toEqual(value);
  });

  it("maps null/undefined to null rather than the string 'undefined'", () => {
    expect(encodeJson(undefined)).toBe("null");
    expect(encodeJson(null)).toBe("null");
  });
});

describe("deltaToZoom", () => {
  it("converts a latitude span to a sane Leaflet zoom", () => {
    // 0.35° across ⇒ z10 (log2(360/0.35) ≈ 10.0), matching the old region framing.
    expect(deltaToZoom(0.35)).toBe(10);
    expect(deltaToZoom(360)).toBe(1);
  });

  it("clamps to Leaflet's usable range", () => {
    expect(deltaToZoom(0.0000001)).toBeLessThanOrEqual(19);
    expect(deltaToZoom(100000)).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a city zoom for nonsense input", () => {
    // A NaN/0 delta would otherwise produce Infinity and blank the map.
    expect(deltaToZoom(0)).toBe(12);
    expect(deltaToZoom(-1)).toBe(12);
    expect(deltaToZoom(Number.NaN)).toBe(12);
  });
});

describe("sanitizeMarkers", () => {
  const ok: MapMarker = { id: "a", latitude: 23.5, longitude: 58.4, title: "A" };

  it("keeps valid markers", () => {
    expect(sanitizeMarkers([ok])).toHaveLength(1);
  });

  it("drops out-of-range and non-finite coordinates", () => {
    const bad = [
      { ...ok, id: "lat", latitude: 91 },
      { ...ok, id: "lng", longitude: 181 },
      { ...ok, id: "nan", latitude: Number.NaN },
      { ...ok, id: "inf", longitude: Number.POSITIVE_INFINITY },
    ];
    expect(sanitizeMarkers(bad)).toHaveLength(0);
  });

  it("accepts the coordinate extremes", () => {
    expect(
      sanitizeMarkers([{ ...ok, latitude: -90, longitude: 180 }])
    ).toHaveLength(1);
  });
});

describe("parseMapMessage", () => {
  it("parses each known message", () => {
    expect(parseMapMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(parseMapMessage('{"type":"mapPress"}')).toEqual({ type: "mapPress" });
    expect(parseMapMessage('{"type":"markerPress","id":"c1"}')).toEqual({
      type: "markerPress",
      id: "c1",
    });
    expect(parseMapMessage('{"type":"error","message":"boom"}')).toEqual({
      type: "error",
      message: "boom",
    });
  });

  it("rejects malformed or hostile payloads instead of trusting them", () => {
    // The WebView is a lower-trust boundary; anything unrecognised must be ignored.
    expect(parseMapMessage("not json")).toBeNull();
    expect(parseMapMessage("null")).toBeNull();
    expect(parseMapMessage('"a string"')).toBeNull();
    expect(parseMapMessage("[1,2]")).toBeNull();
    expect(parseMapMessage('{"type":"eval","code":"x"}')).toBeNull();
    expect(parseMapMessage('{"type":"markerPress"}')).toBeNull(); // id missing
    expect(parseMapMessage('{"type":"markerPress","id":42}')).toBeNull(); // id not a string
  });

  it("defaults a malformed error message rather than returning null", () => {
    expect(parseMapMessage('{"type":"error"}')).toEqual({ type: "error", message: "map_error" });
  });
});

describe("buildLeafletHtml", () => {
  it("embeds a hostile clinic name without breaking out of the script", () => {
    const payload = "</script><script>alert(1)</script>";
    const doc = state([{ id: "x", latitude: 23.5, longitude: 58.4, title: payload }]);

    // The security property is that the payload cannot become MARKUP. Its angle brackets
    // are escaped, so it stays inert text inside a JSON string literal — the substring
    // "alert(1)" is expected to survive verbatim and is harmless there.
    expect(doc).toContain("\\u003c/script\\u003e");
    expect(doc).not.toContain(payload);

    // The injected script must contain NO raw markup at all — it is evaluated inside the
    // live page, so an unescaped tag here would be just as dangerous as one in the document.
    expect(doc).not.toMatch(/<script/);
    expect(doc).not.toMatch(/<\/script>\s*<script>alert/);
    expect(doc).not.toMatch(/onerror\s*=\s*["']?alert/);
  });

  it("the DOCUMENT itself declares exactly two script tags and carries no clinic data", () => {
    const doc = html();
    expect(doc.match(/<script/g)).toHaveLength(2);
    // The regression this guards: markers used to be baked into the HTML, which is why a
    // selection change reloaded the map.
    expect(doc).not.toContain('"markers"');
    expect(doc).not.toContain('"fitToken"');
  });

  it("references the pinned, SRI-verified Leaflet assets", () => {
    const doc = html();
    expect(doc).toContain(LEAFLET_CDN.js.url);
    expect(doc).toContain(LEAFLET_CDN.js.integrity);
    expect(doc).toContain(LEAFLET_CDN.css.integrity);
    expect(doc).toContain('crossorigin="anonymous"');
  });

  it("includes the OSM attribution — a licence requirement, not decoration", () => {
    expect(html()).toContain("openstreetmap.org/copyright");
  });

  it("points at the configured tile template", () => {
    expect(html()).toContain(OSM_STANDARD.urlTemplate);
  });

  it("contains no Google endpoint of any kind", () => {
    const doc = html();
    expect(doc).not.toMatch(/google/i);
    expect(doc).not.toMatch(/googleapis/i);
    expect(doc).not.toMatch(/gstatic/i);
  });

  it("applies the dark tile filter only in dark mode", () => {
    expect(html(true)).toContain('<body class="dark"');
    expect(html(false)).toContain('<body class=""');
  });

  it("renders marker payloads and never uses innerHTML for text", () => {
    const script = state([
      { id: "c1", latitude: 23.5, longitude: 58.4, title: "Al Noor", subtitle: "Ruwi" },
    ]);
    expect(script).toContain('"id":"c1"');
    expect(script).toContain("Al Noor");
    // Titles reach the DOM through Leaflet's `title`/`alt` marker options, which are set as
    // attributes — the document never assigns marker text through innerHTML.
    expect(html()).not.toMatch(/innerHTML\s*=\s*[^;]*title/);
  });

  it("includes the patient marker only when a location is supplied", () => {
    expect(state()).toContain('"user":null');
    expect(state([], { latitude: 23.6, longitude: 58.4, accuracyM: 25 })).toContain('"accuracyM":25');
  });

  it("fails visibly when Leaflet cannot load", () => {
    // A blank grey rectangle is the worst outcome; the page must report it.
    expect(html()).toContain("map_library_unavailable");
  });
});
