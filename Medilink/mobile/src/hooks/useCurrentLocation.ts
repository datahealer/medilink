import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

/**
 * The patient's own position, foreground only, for the Nearby Clinics map.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 * NO PERSISTENCE, ANYWHERE. The coordinate lives in React state for the lifetime of the
 * screen and nothing else. It is never written to Supabase, AsyncStorage, SecureStore, a
 * file, an analytics event, or a log line — not even in __DEV__, because a coordinate in a
 * log survives in a crash report. The only place it leaves the device is as `p_lat`/`p_lng`
 * parameters to `get_nearby_facilities`, which is `LANGUAGE sql STABLE` and therefore
 * structurally incapable of writing them down.
 *
 * NO BACKGROUND LOCATION, NO TRACKING, NO WATCHING. `getCurrentPositionAsync` is called
 * once per explicit request. There is no `watchPositionAsync`, no geofence, and no history —
 * a health app has no business knowing where a patient goes, and the Play Console
 * background-location declaration is something we never want to need.
 *
 * ── WHY THE STATUS IS AN ENUM AND NOT A BOOLEAN ──
 *
 * "No location" has four causes and they need four different pieces of UI:
 *
 *   • `denied`            — the OS permission was refused. Asking again is futile on iOS
 *                           after the first refusal; the user must go to Settings.
 *   • `servicesDisabled`  — permission may be granted but the device's location services
 *                           are switched off system-wide. Re-requesting cannot fix it.
 *   • `unavailable`       — permission granted, services on, but no fix was obtained
 *                           (indoors, airplane mode, GPS timeout). Retrying is reasonable.
 *   • `error`             — the module itself threw.
 *
 * Collapsing these into `coords === null` is what produces the "it just doesn't work"
 * bug report, so callers get to tell the patient which one happened.
 *
 * The hook never throws and never rejects: every failure becomes a status. A map screen must
 * not crash because someone is in a lift.
 */

export type LocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "servicesDisabled"
  | "unavailable"
  | "error";

export interface Coords {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres, when the platform reports one. */
  accuracyM?: number | null;
}

export interface CurrentLocation {
  status: LocationStatus;
  coords: Coords | null;
  /** True while a permission prompt or a position fix is in flight. */
  isLoading: boolean;
  /** True once we have a real fix — the only condition under which `coords` is non-null. */
  hasLocation: boolean;
  /** Ask for permission (if needed) and fetch one position. Safe to call repeatedly. */
  request: () => Promise<void>;
}

/**
 * @param options.auto request once on mount. Default `false` — a screen should normally
 *   decide when to prompt, so the OS dialog is not the first thing a patient sees.
 */
export function useCurrentLocation(options?: { auto?: boolean }): CurrentLocation {
  const auto = options?.auto ?? false;
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);

  // Guards against setState after unmount (the OS dialog easily outlives the screen) and
  // against overlapping requests from a double tap.
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (alive.current) setStatus("requesting");

    try {
      // Services first: on Android a granted permission with location switched off still
      // yields no fix, and reporting that as "denied" would send the user to the wrong
      // settings screen.
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        if (alive.current) {
          setCoords(null);
          setStatus("servicesDisabled");
        }
        return;
      }

      // Foreground only. `requestForegroundPermissionsAsync` is a no-op prompt when the
      // permission is already granted, so this doubles as the "check" call.
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== Location.PermissionStatus.GRANTED) {
        if (alive.current) {
          setCoords(null);
          setStatus("denied");
        }
        return;
      }

      // `Balanced` (~100 m) rather than `High`: clinic proximity does not need GPS-grade
      // precision, and Balanced resolves faster, costs less battery, and reveals less.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = position?.coords?.latitude;
      const lng = position?.coords?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
        if (alive.current) {
          setCoords(null);
          setStatus("unavailable");
        }
        return;
      }

      if (alive.current) {
        setCoords({ latitude: lat, longitude: lng, accuracyM: position.coords.accuracy ?? null });
        setStatus("granted");
      }
    } catch {
      // Intentionally no error detail is captured or reported: an expo-location error
      // message can embed the last known position, and this must never reach a log or a
      // crash report.
      if (alive.current) {
        setCoords(null);
        setStatus("error");
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (auto) void request();
  }, [auto, request]);

  return {
    status,
    coords,
    isLoading: status === "requesting",
    hasLocation: status === "granted" && coords !== null,
    request,
  };
}
