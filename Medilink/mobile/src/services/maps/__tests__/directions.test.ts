import { isValidTarget, nativeDirectionsUrl, webDirectionsUrl } from "../directions";

const TARGET = { latitude: 23.588, longitude: 58.3829, label: "Muscat Central Clinic" };

/**
 * Directions previously went to a Google Maps URL. These tests lock in that the whole
 * path is now Google-free and that a null coordinate can never produce a
 * "NaN,NaN" link — the failure mode that silently opens a map at the origin.
 */
describe("isValidTarget", () => {
  it("accepts a real coordinate", () => {
    expect(isValidTarget(TARGET)).toBe(true);
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

describe("nativeDirectionsUrl", () => {
  it("uses Apple Maps on iOS", () => {
    const url = nativeDirectionsUrl("ios", TARGET);
    expect(url).toContain("maps.apple.com");
    expect(url).toContain("daddr=23.588,58.3829");
    expect(url).toContain("dirflg=d");
  });

  it("uses the geo: intent on Android so the OS offers every installed map app", () => {
    const url = nativeDirectionsUrl("android", TARGET);
    expect(url.startsWith("geo:23.588,58.3829")).toBe(true);
    // The duplicated q= is required or many Android map apps drop the label.
    expect(url).toContain("q=23.588,58.3829");
  });

  it("URL-encodes the label on both platforms", () => {
    const tricky = { ...TARGET, label: "Al Noor & Co / Ruwi" };
    expect(nativeDirectionsUrl("ios", tricky)).toContain(encodeURIComponent(tricky.label));
    expect(nativeDirectionsUrl("android", tricky)).toContain(encodeURIComponent(tricky.label));
  });

  it("omits the label cleanly when absent", () => {
    const noLabel = { latitude: 23.588, longitude: 58.3829 };
    expect(nativeDirectionsUrl("ios", noLabel)).not.toContain("&q=");
    expect(nativeDirectionsUrl("android", noLabel)).toBe("geo:23.588,58.3829?q=23.588,58.3829");
  });

  it("falls back to the web URL for an unknown platform", () => {
    expect(nativeDirectionsUrl("web", TARGET)).toContain("openstreetmap.org");
  });

  it("never emits a Google URL", () => {
    for (const platform of ["ios", "android", "web", "windows"]) {
      expect(nativeDirectionsUrl(platform, TARGET)).not.toMatch(/google/i);
    }
  });
});

describe("webDirectionsUrl", () => {
  it("points at OpenStreetMap with a marker and zoom", () => {
    const url = webDirectionsUrl(TARGET);
    expect(url).toContain("openstreetmap.org");
    expect(url).toContain("mlat=23.588");
    expect(url).toContain("mlon=58.3829");
    expect(url).toContain("#map=17/23.588/58.3829");
  });

  it("is Google-free", () => {
    expect(webDirectionsUrl(TARGET)).not.toMatch(/google/i);
  });
});
