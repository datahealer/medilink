import fs from "fs";
import path from "path";

import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";

import { useCurrentLocation } from "../useCurrentLocation";

/**
 * Foreground location for the Nearby Clinics map.
 *
 * These are BEHAVIOURAL — the hook is driven through mocked expo-location and the resulting
 * status/coords are asserted, because the whole point of the hook is that four different
 * causes of "no location" stay distinguishable. A source-level test could not show that.
 */
jest.mock("expo-location", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  Accuracy: { Balanced: 3, High: 4 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const mockLoc = Location as jest.Mocked<typeof Location>;

const servicesOn = () => mockLoc.hasServicesEnabledAsync.mockResolvedValue(true);
const grant = () =>
  mockLoc.requestForegroundPermissionsAsync.mockResolvedValue({
    status: "granted",
  } as never);
const position = (latitude: number, longitude: number, accuracy: number | null = 25) =>
  mockLoc.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude, longitude, accuracy },
  } as never);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useCurrentLocation", () => {
  it("starts idle and does NOT prompt on mount by default", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation());

    expect(result.current.status).toBe("idle");
    expect(result.current.coords).toBeNull();
    // The OS dialog must follow a user action, not the screen mounting.
    expect(mockLoc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("1. permission GRANTED → status granted with valid coordinates", async () => {
    servicesOn();
    grant();
    position(23.5859, 58.4059, 18);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(result.current.coords).toEqual({
      latitude: 23.5859,
      longitude: 58.4059,
      accuracyM: 18,
    });
    expect(result.current.hasLocation).toBe(true);
  });

  it("2. permission DENIED → status denied, no coordinates", async () => {
    servicesOn();
    mockLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" } as never);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.coords).toBeNull();
    expect(result.current.hasLocation).toBe(false);
    // Never asks for a fix it cannot have.
    expect(mockLoc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("3. location SERVICES DISABLED → distinct status, checked BEFORE permission", async () => {
    mockLoc.hasServicesEnabledAsync.mockResolvedValue(false);
    grant();

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe("servicesDisabled");
    expect(result.current.coords).toBeNull();
    // Reporting this as "denied" would send the user to the wrong settings screen, so the
    // permission prompt must not even fire.
    expect(mockLoc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("4. location ERROR (module throws) → status error, never rejects", async () => {
    servicesOn();
    grant();
    mockLoc.getCurrentPositionAsync.mockRejectedValue(new Error("GPS timeout at 23.6,58.5"));

    const { result } = renderHook(() => useCurrentLocation());
    // Must not throw — a map screen cannot crash because someone is in a lift.
    await act(async () => {
      await expect(result.current.request()).resolves.toBeUndefined();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.coords).toBeNull();
  });

  it("distinguishes UNAVAILABLE (no fix) from denied and from error", async () => {
    servicesOn();
    grant();
    mockLoc.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: null, longitude: null, accuracy: null },
    } as never);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe("unavailable");
    expect(result.current.coords).toBeNull();
  });

  it("rejects NaN coordinates rather than passing them to the RPC", async () => {
    servicesOn();
    grant();
    mockLoc.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: NaN, longitude: 58.4, accuracy: null },
    } as never);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.status).toBe("unavailable");
    expect(result.current.coords).toBeNull();
  });

  it("tolerates a missing accuracy value", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5, null);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(result.current.coords).toEqual({ latitude: 23.6, longitude: 58.5, accuracyM: null });
  });

  it("requests FOREGROUND permission only — never background", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(mockLoc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    // A background permission API must never appear in this hook.
    expect(
      (mockLoc as unknown as Record<string, unknown>).requestBackgroundPermissionsAsync
    ).toBeUndefined();
    expect((mockLoc as unknown as Record<string, unknown>).watchPositionAsync).toBeUndefined();
  });

  it("takes ONE position reading per request — no watching/tracking", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(mockLoc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it("uses Balanced accuracy — clinic proximity does not need GPS-grade precision", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });

    expect(mockLoc.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Balanced,
    });
  });

  it("auto:true requests once on mount, for screens that opt in", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation({ auto: true }));

    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(mockLoc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it("coalesces overlapping requests (double tap) into one", async () => {
    servicesOn();
    grant();
    position(23.6, 58.5);

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await Promise.all([result.current.request(), result.current.request()]);
    });

    expect(mockLoc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it("recovers on retry after a transient failure", async () => {
    servicesOn();
    grant();
    mockLoc.getCurrentPositionAsync.mockRejectedValueOnce(new Error("timeout"));

    const { result } = renderHook(() => useCurrentLocation());
    await act(async () => {
      await result.current.request();
    });
    expect(result.current.status).toBe("error");

    position(23.61, 58.51);
    await act(async () => {
      await result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(result.current.coords?.latitude).toBe(23.61);
  });
});

describe("privacy — no persistence, no logging (8)", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "useCurrentLocation.ts"), "utf8");
  /**
   * CODE ONLY — comments stripped. The hook documents at length which APIs it deliberately
   * does NOT use ("no watchPositionAsync", "never logged"), so asserting against the raw file
   * would fail on its own explanation of the rule.
   */
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("never writes coordinates to any storage layer", () => {
    // The whole privacy claim rests on this: a coordinate that is never stored cannot leak.
    expect(source).not.toMatch(/AsyncStorage/);
    expect(source).not.toMatch(/SecureStore/);
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/apiFetch/);
    expect(source).not.toMatch(/\.from\(/);
  });

  it("never logs — a coordinate in a log survives in a crash report", () => {
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/reportError/);
    expect(source).not.toMatch(/Sentry/);
  });

  it("contains no background-location or tracking API", () => {
    expect(source).not.toMatch(/requestBackgroundPermissionsAsync/);
    expect(source).not.toMatch(/watchPositionAsync/);
    expect(source).not.toMatch(/startLocationUpdatesAsync/);
    expect(source).not.toMatch(/geofenc/i);
  });
});
