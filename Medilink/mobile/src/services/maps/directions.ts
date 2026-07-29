/**
 * "Open directions" — provider-agnostic and key-free.
 *
 * Previously this built a `https://www.google.com/maps/search/?api=1&query=…` URL. That
 * needed no API key, but it forced Google Maps on every user and opened a browser when the
 * Maps app wasn't installed. Handing off to the platform's own scheme is both
 * Google-free and better UX: it opens whichever map app the user actually has.
 *
 * Pure functions only — the caller owns `Linking`, so this stays unit-testable.
 */

export interface DirectionsTarget {
  latitude: number;
  longitude: number;
  /** Optional label shown as the destination name where the platform supports it. */
  label?: string | null;
}

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
 * Preferred native URL for the platform.
 *
 * - iOS → Apple Maps (`maps.apple.com`), which iOS routes straight to the Maps app.
 * - Android → the `geo:` intent, which lets the OS offer every installed map app.
 *   The `q=` duplicate is required: without it many apps drop the pin label.
 */
export function nativeDirectionsUrl(
  platform: "ios" | "android" | string,
  target: DirectionsTarget
): string {
  const { latitude, longitude, label } = target;
  const coords = `${latitude},${longitude}`;

  if (platform === "ios") {
    const q = label ? `&q=${encodeURIComponent(label)}` : "";
    return `https://maps.apple.com/?daddr=${coords}${q}&dirflg=d`;
  }

  if (platform === "android") {
    const q = label ? `(${encodeURIComponent(label)})` : "";
    return `geo:${coords}?q=${coords}${q}`;
  }

  return webDirectionsUrl(target);
}

/**
 * Key-free web fallback, used when the native scheme cannot be opened (no map app, or an
 * unexpected platform). Points at OpenStreetMap rather than Google, so the whole
 * directions path is free of Google dependencies.
 */
export function webDirectionsUrl(target: DirectionsTarget): string {
  const { latitude, longitude } = target;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}
