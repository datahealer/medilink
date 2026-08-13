import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  OsmMapView,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { localizedName } from "@/utils/localizedName";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useNearbyClinics } from "@/hooks/queries/useDiscovery";
import { coverageFor, formatDistanceKm } from "@/services/maps/nearby";
import {
  DEFAULT_TRAVEL_MODE,
  directionsUrlChain,
  isValidTarget,
  travelModesFor,
  type TravelMode,
} from "@/services/maps/directions";
import { haversineKm } from "@/services/maps/leafletBridge";
import type { MapCamera, MapMarker, UserLocation } from "@/services/maps/types";
import type { Clinic } from "@/data/types";

/**
 * FALLBACK ORIGIN ONLY — not "the patient's location".
 *
 * The RPC is a proximity search and needs a centre, so when we have no real position we
 * anchor to Muscat. Every UI state below that uses this constant SAYS SO ("Showing clinics
 * around Muscat"), because silently presenting Muscat-relative distances as if they were
 * measured from the patient is the actual bug this screen used to have.
 */
const MUSCAT = { lat: 23.588, lng: 58.3829 };
const FALLBACK_CAMERA: MapCamera = {
  latitude: MUSCAT.lat,
  longitude: MUSCAT.lng,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
};
/** Tighter span once we know where the patient is — city-level, not country-level. */
const LOCATED_DELTA = 0.12;

/**
 * Coincident-pin de-overlap now lives in `services/maps/leafletBridge.spreadCoincident`,
 * because it has to scale with the RENDERED zoom and only `OsmMapView` knows that. The old
 * copy here offset duplicates by a constant 20 m, which is 0.009 px at the zoom that frames
 * all of Oman — so the three Ruwi clinics stayed perfectly stacked in exactly the
 * out-of-coverage view where the problem was reported.
 */

/** Map View (PDF p19): real map with nearby-clinic markers + a bottom clinic card. */
export default function MapViewScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { t, num } = useI18n();

  /**
   * Real device position.
   *
   * `auto: true`. The previous `auto: false` is the root cause of the reported bug: nothing
   * in this screen ever called `request()` except a tap on the small "Use my location" text
   * link, so on every open `status` stayed `idle`, `hasLocation` stayed false, and the
   * origin below silently resolved to Muscat. A screen titled "Clinics near me" that never
   * asks where you are cannot be right, and the deferred-prompt argument does not survive
   * contact with it — the whole purpose of opening this screen is proximity, so the prompt
   * IS the user's own action. The permission string is already declared in app.json.
   */
  const location = useCurrentLocation({ auto: true });

  /**
   * Has the location attempt finished, one way or another? Used to hold the query back.
   *
   * Without this the screen fires a Muscat-origin query on mount, renders Omani pins, and
   * then re-queries when the fix lands — the transient state in which a patient outside
   * Oman saw Muscat clinics and their own pin in the same frame.
   */
  const locationSettled = location.status !== "idle" && location.status !== "requesting";

  /**
   * THE SEARCH ORIGIN: the patient's real coordinates whenever we have them, and Muscat
   * ONLY when we genuinely do not. `distance_km` and the ordering come back from PostGIS
   * relative to whichever origin was sent — nothing is recomputed on the client.
   */
  const origin = location.hasLocation && location.coords
    ? { lat: location.coords.latitude, lng: location.coords.longitude }
    : { lat: MUSCAT.lat, lng: MUSCAT.lng };

  const query = useNearbyClinics(origin, { enabled: locationSettled });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>(DEFAULT_TRAVEL_MODE);

  /**
   * ── THE CAMERA CONTRACT ──
   *
   * The map moves ONLY when this token changes. `OsmMapView` compares it against the last
   * value it applied, so every other update — a marker tap, a search keystroke, a re-render
   * — leaves the camera exactly where the user put it.
   *
   * Bumped on precisely four events, and nothing else:
   *   1. initial load                (token starts at 0 and the page applies it once)
   *   2. first successful fix        (effect on `hasLocation`)
   *   3. coverage-mode transition    (effect on `outOfCoverage`)
   *   4. explicit "locate me"        (the recentre control)
   *
   * Expressing it as a token rather than a boolean matters: "recentre me again" is a NEW
   * event even though the inputs are identical, and only a monotonic counter can say that.
   */
  const [fitToken, setFitToken] = useState(0);
  const bumpFit = useCallback(() => setFitToken((n) => n + 1), []);
  const [hasPanned, setHasPanned] = useState(false);

  /** Everything the proximity RPC returned, before the search box narrows it. */
  const all = useMemo(() => query.data ?? [], [query.data]);

  /**
   * How far the patient actually is from the nearest clinic — read off the FIRST row,
   * because the RPC already ordered by distance ascending and this screen never re-sorts.
   *
   * Gated on `isSuccess` so an in-flight query is never mistaken for "nothing found": the
   * row set is empty while loading, and treating that as out-of-coverage would fire the
   * fallback query below on every open.
   */
  const coverage = query.isSuccess
    ? coverageFor(all[0]?.distance_km, location.hasLocation)
    : "unknown";
  const outOfCoverage = coverage === "outOfCoverage";

  /**
   * ── OUT-OF-COVERAGE FALLBACK ──
   *
   * The patient has a real fix, and there is nothing near them. Measured against
   * production: a device in Delhi is ~2,900 km from the nearest Omani clinic, so the
   * proximity query returns ZERO rows — which is why this screen previously went blank.
   * Suppressing the list was only half of it; there was also genuinely nothing to draw.
   *
   * So we ask a second question — "what clinics does MediLink have at all?" — using the
   * SAME RPC with the Muscat centroid as origin, which is exactly the call this screen
   * already makes when location permission is denied. No new endpoint, no new query
   * shape, no fabricated clinics. It runs ONLY when the first answer was "none near you".
   *
   * CRITICAL: the `distance_km` on these rows is measured FROM MUSCAT, not from the
   * patient. It is never displayed — see `distance` below. Presenting a Muscat-relative
   * distance as the patient's own is precisely the class of bug this screen has already
   * been fixed for once.
   */
  const fallbackQuery = useNearbyClinics(
    { lat: MUSCAT.lat, lng: MUSCAT.lng },
    { enabled: outOfCoverage }
  );

  /**
   * The clinic set this screen is showing, and what it MEANS. Out of coverage it is the
   * national list; otherwise it is the patient's neighbourhood.
   */
  // Memoised so the `?? []` does not mint a fresh array on every render and invalidate the
  // marker/search memos below it.
  const source: Clinic[] = useMemo(
    () => (outOfCoverage ? (fallbackQuery.data ?? []) : all),
    [outOfCoverage, fallbackQuery.data, all]
  );

  /** Search narrows whichever set is in play — it must keep working in fallback mode too. */
  const clinics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.area ?? "").toLowerCase().includes(q)
    );
  }, [source, search]);

  const active: Clinic | undefined = clinics.find((c) => c.id === selectedId) ?? clinics[0];

  /**
   * The distance the patient reads. Server value, formatted — never recomputed, never
   * rounded up to look better. `veryClose` replaces the bare "0 km" that the old Muscat
   * origin produced on every open, because three Ruwi clinics are stored at exactly the
   * Muscat fallback coordinate.
   *
   * SUPPRESSED ENTIRELY in fallback mode. Those rows are Muscat-relative; the honest
   * options were "hide it" or "invent a patient-relative distance", and inventing one
   * means a second RPC round-trip to state something the patient already knows — that the
   * clinics are in another country. The card shows the rating alone.
   */
  const distance = outOfCoverage ? null : formatDistanceKm(active?.distance_km);

  /**
   * Markers for the map surface, derived from the same clinic list as the card.
   *
   * De-overlap is NOT applied here any more — `OsmMapView` does it against the rendered
   * zoom, which is the only place that knows how many metres a pixel is worth.
   */
  const markers: MapMarker[] = useMemo(
    () =>
      clinics
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          id: c.id,
          latitude: c.latitude as number,
          longitude: c.longitude as number,
          title: localizedName(c.name, c.name_ar, c.name_ar_status, isRTL),
          subtitle: c.area,
          selected: c.id === active?.id,
        })),
    [clinics, active?.id, isRTL]
  );

  /**
   * Patient pin + accuracy circle. `OsmMapView` already supported this; until now nothing
   * supplied it. Only ever set from a real fix — never from the Muscat fallback, which would
   * draw a "you are here" pin on a city the patient may not be in.
   */
  const userLocation: UserLocation | null =
    location.hasLocation && location.coords
      ? {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyM: location.coords.accuracyM ?? null,
        }
      : null;

  /**
   * CAMERA — three modes, stated explicitly rather than emerging from a chain of ternaries:
   *
   *   1. Located and in coverage → centre on the patient at city zoom. `selectFitPoints`
   *      then widens just enough to include the clinics near them.
   *   2. Out of coverage         → the patient is irrelevant to framing. Anchor on the
   *      nearest clinic in the national list (the RPC ordered it, so `[0]` is a real
   *      anchor, not an arbitrary pick) and let `fitBounds` frame the whole set. The
   *      anchor matters for the one-clinic case, where `selectFitPoints` returns `[]` by
   *      design and this value is the final word — without it the camera would sit on the
   *      patient's own country with every marker off-screen.
   *   3. No fix at all           → the country-level Muscat view, unchanged.
   */
  const anchorClinic = clinics.find((c) => c.latitude != null && c.longitude != null);
  const camera: MapCamera = outOfCoverage
    ? anchorClinic
      ? {
          latitude: anchorClinic.latitude as number,
          longitude: anchorClinic.longitude as number,
          latitudeDelta: FALLBACK_CAMERA.latitudeDelta,
          longitudeDelta: FALLBACK_CAMERA.longitudeDelta,
        }
      : FALLBACK_CAMERA
    : userLocation
      ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: LOCATED_DELTA,
          longitudeDelta: LOCATED_DELTA,
        }
      : FALLBACK_CAMERA;

  /** Which explanatory line to show, keyed off WHY we have no position. */
  const locationNotice: { body: string; action: "request" | "settings" } | null =
    location.hasLocation
      ? null
      : location.status === "denied"
        ? { body: t("map.locationDeniedBody"), action: "settings" }
        : location.status === "servicesDisabled"
          ? { body: t("map.locationServicesOffBody"), action: "settings" }
          : location.status === "unavailable" || location.status === "error"
            ? { body: t("map.locationUnavailableBody"), action: "request" }
            : { body: t("map.locationPromptBody"), action: "request" };

  /** Open the clinic's existing details screen (QA map Phase 3). */
  const openClinic = (c: Clinic) => router.push(`/clinics/${c.id}`);

  /**
   * ── CAMERA TRIGGER 2: first successful fix ──
   * Frames the patient the moment we learn where they are, and never again for the same
   * fix. A later position update does not re-trigger, so a GPS jitter cannot yank the map
   * out from under a user who is reading it.
   */
  useEffect(() => {
    if (location.hasLocation) bumpFit();
  }, [location.hasLocation, bumpFit]);

  /**
   * ── CAMERA TRIGGER 3: coverage transition ──
   * Entering or leaving the out-of-coverage fallback changes WHICH clinics are on screen
   * and what the camera should frame, so it is the one data change that legitimately moves
   * the map.
   */
  useEffect(() => {
    bumpFit();
  }, [outOfCoverage, bumpFit]);

  /** ── CAMERA TRIGGER 4: explicit "locate me". Also re-requests if we have no fix yet. */
  const recentre = useCallback(() => {
    if (!location.hasLocation) void location.request();
    setHasPanned(false);
    bumpFit();
  }, [location, bumpFit]);

  /**
   * DIRECTIONS ORIGIN — the patient's REAL coordinates, and nothing else.
   *
   * This reads `location.coords`, never the Muscat constant. The two are not
   * interchangeable and the distinction is the whole point of this screen: Muscat is a
   * DISCOVERY anchor used to ask "what clinics exist" when the patient is out of coverage.
   * Routing a patient in India from Muscat would be confidently wrong.
   *
   * `null` when there is no fix, which makes the maps app use its own current location —
   * still the device's real position, never a value we guessed.
   */
  const directionsOrigin = location.hasLocation && location.coords
    ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
    : null;

  /**
   * Straight-line origin→destination distance, used ONLY to decide whether offering a
   * Transit chip is honest. Not shown to the patient and not a route.
   */
  const journeyKm =
    directionsOrigin && active?.latitude != null && active?.longitude != null
      ? haversineKm(
          { latitude: directionsOrigin.latitude, longitude: directionsOrigin.longitude },
          { latitude: active.latitude, longitude: active.longitude }
        )
      : null;

  /** Modes this platform can actually honour for this journey. */
  const modes = useMemo(() => travelModesFor(Platform.OS, journeyKm), [journeyKm]);

  /** Keep the selection valid when the available modes change (e.g. Transit disappears). */
  useEffect(() => {
    if (!modes.includes(travelMode)) setTravelMode(DEFAULT_TRAVEL_MODE);
  }, [modes, travelMode]);

  /**
   * Hand off to the platform's own map app, carrying the real origin, the clinic and the
   * chosen travel mode. Google Maps URLs and Apple Maps URLs are public schemes: no API
   * key, no developer project, no billing. The chain falls back in order until one opens.
   */
  const openDirections = (c: Clinic) => {
    const destination = {
      latitude: c.latitude as number,
      longitude: c.longitude as number,
      label: localizedName(c.name, c.name_ar, c.name_ar_status, isRTL),
    };
    if (!isValidTarget(destination)) return;

    const chain = directionsUrlChain(Platform.OS, {
      destination,
      origin: directionsOrigin,
      mode: travelMode,
    });

    const tryNext = (i: number): void => {
      const url = chain[i];
      if (!url) {
        Alert.alert(t("map.loadError"));
        return;
      }
      Linking.openURL(url).catch(() => tryNext(i + 1));
    };
    tryNext(0);
  };

  const MODE_LABEL: Record<TravelMode, string> = {
    drive: t("map.modeDrive"),
    walk: t("map.modeWalk"),
    cycle: t("map.modeCycle"),
    transit: t("map.modeTransit"),
  };
  const MODE_EMOJI: Record<TravelMode, string> = {
    drive: "🚗",
    walk: "🚶",
    cycle: "🚲",
    transit: "🚆",
  };

  return (
    // `dismissKeyboardOnTap={false}` is REQUIRED here, not cosmetic. Screen otherwise wraps
    // its children in a TouchableWithoutFeedback, and that ancestor claims the touch
    // responder — which, combined with the WebView not asking its parents to keep out,
    // stopped the map being draggable on a physical Android device.
    <Screen scroll={false} padded={false} dismissKeyboardOnTap={false} edges={["top", "left", "right", "bottom"]}>
      {/* Search header */}
      <View style={[styles.header, { paddingHorizontal: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Icon name="chevron" direction={isRTL ? "right" : "left"} size={26} tint={colors.text} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.searchWrap}>
          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder={t("map.searchPlaceholder")}
            returnKeyType="search"
            leading={<Icon name="search" size={18} tint={colors.textMuted} />}
          />
        </View>
      </View>

      {/* Map surface — Leaflet + OpenStreetMap in a WebView; no Google Maps API key. */}
      <View style={styles.map}>
        <OsmMapView
          camera={camera}
          markers={markers}
          userLocation={userLocation}
          // The pin stays REAL and stays drawn; it just stops dragging the camera when the
          // patient is thousands of kilometres from every clinic. Framing and drawing are
          // separate decisions — see selectFitPoints.
          frameWithUser={!outOfCoverage}
          // The camera moves only when this changes. Marker taps do not change it.
          fitToken={fitToken}
          // Selecting a clinic updates the card and the pin state. It does NOT recentre.
          onMarkerPress={setSelectedId}
          onUserPan={() => setHasPanned(true)}
          onError={setMapError}
          testID="osm-map"
        />

        {/* Recentre — the ONLY control that moves the camera back to the patient, and the
            fourth and last camera trigger. Shown once we have a fix and the user has moved
            the map, so it appears exactly when it is useful and never nags. */}
        {location.hasLocation && hasPanned ? (
          <Pressable
            onPress={recentre}
            accessibilityRole="button"
            accessibilityLabel={t("map.recentre")}
            hitSlop={8}
            style={[
              styles.recentre,
              isRTL ? { left: spacing.lg } : { right: spacing.lg },
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Icon name="location" size={20} tint={colors.primary} />
          </Pressable>
        ) : null}

        {/* Leaflet or the tile server was unreachable — say so instead of showing a
            blank rectangle the user can't interpret. */}
        {mapError && !query.isLoading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <ErrorState message={t("map.tilesError")} onRetry={() => setMapError(null)} />
          </View>
        ) : null}

        {!locationSettled || query.isLoading || fallbackQuery.isLoading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <LoadingState />
          </View>
        ) : query.isError || fallbackQuery.isError ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <ErrorState
              message={t("map.loadError")}
              onRetry={() => void (outOfCoverage ? fallbackQuery.refetch() : query.refetch())}
            />
          </View>
        ) : clinics.length === 0 ? (
          /* The ONLY remaining full-screen state. Out of coverage no longer lands here —
             it now shows the national clinic list on a live map — so reaching this means
             either the search matched nothing or the backend genuinely has no eligible
             clinic to offer. Those are different sentences. */
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <EmptyState
              title={outOfCoverage && source.length === 0 ? t("map.outOfCoverageTitle") : t("map.emptyTitle")}
              body={outOfCoverage && source.length === 0 ? t("map.outOfCoverageBody") : t("map.emptyBody")}
            />
          </View>
        ) : null}
      </View>

      {/* Out-of-coverage notice. Two sentences, deliberately: the first states the fact
          about the patient's location, the second states what they are looking at instead.
          No action button — there is nothing the patient can do about being in another
          country, and offering "Open Settings" here would imply otherwise. Mutually
          exclusive with the location notice below (that one only renders without a fix). */}
      {outOfCoverage && clinics.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <Card padded>
            <Text variant="label" style={{ textAlign: isRTL ? "right" : "left" }}>
              {t("map.outOfCoverageNoticeTitle")}
            </Text>
            <Text
              variant="caption"
              color="textMuted"
              style={{ paddingTop: 2, textAlign: isRTL ? "right" : "left" }}
            >
              {t("map.outOfCoverageNoticeBody")}
            </Text>
          </Card>
        </View>
      ) : null}

      {/* Location notice — explains WHERE the distances are measured from, and offers the
          one action that can actually change it. Never claims Muscat is the patient. */}
      {locationNotice ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <Card padded>
            <Text variant="caption" color="textMuted">
              {locationNotice.body}
            </Text>
            <Pressable
              onPress={
                locationNotice.action === "settings"
                  ? () => void Linking.openSettings().catch(() => {})
                  : () => void location.request()
              }
              hitSlop={8}
              accessibilityRole="button"
              disabled={location.isLoading}
              style={{ paddingTop: 6 }}
            >
              <Text variant="label" color="primary">
                {location.isLoading
                  ? t("map.locating")
                  : locationNotice.action === "settings"
                    ? t("map.openSettings")
                    : t("map.locateCta")}
              </Text>
            </Pressable>
          </Card>
        </View>
      ) : null}

      {/* Bottom clinic card */}
      {active ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm }}>
          {/* QA map Phase 3 — the card BODY opens the clinic's details screen. It used to open
              directions, which made the details screen unreachable from the map entirely.
              "Get directions" is now its own control below, so neither action hides the other. */}
          <Card onPress={() => openClinic(active)} accessibilityLabel={t("map.viewClinic")}>
            <View style={[styles.cardRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={active.name} size={44} />
              <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                <Text variant="title" numberOfLines={1}>
                  {localizedName(active.name, active.name_ar, active.name_ar_status, isRTL)}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {active.area}
                </Text>
                <Text variant="caption" color="textMuted">
                  {num(
                    [
                      // `rating` defaults to 0 in the mapper, so a clinic with no rating
                      // would read "★ 0" — worse than saying nothing. Only show a real one.
                      active.rating > 0 ? `★ ${active.rating}` : null,
                      // Reviews are shown only when the backend actually sent a count.
                      active.review_count ? t("clinic.reviewsCount", { count: active.review_count }) : null,
                      // Unit via i18n so Arabic reads "٤٫٦ كم", not "٤٫٦ km". `veryClose`
                      // is a whole phrase, not a number + unit — "0 km" is not what a
                      // patient standing outside the clinic should be told.
                      distance == null
                        ? null
                        : distance.kind === "veryClose"
                          ? t("map.distanceVeryClose")
                          : `${distance.value} ${t("common.km")}`,
                    ]
                      .filter(Boolean)
                      .join("   ·   ")
                  )}
                </Text>
              </View>
              <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
            </View>
          </Card>

          {/* Travel-mode selector. Only modes the chosen provider can actually honour are
              offered — Cycle is absent on iOS because the Apple Maps URL scheme has no
              bicycle flag, and Transit disappears for journeys no transit network serves.
              Showing a chip we cannot deliver would be a lie the maps app has to break. */}
          <View
            style={[styles.modes, { flexDirection: isRTL ? "row-reverse" : "row", paddingTop: spacing.sm }]}
            accessibilityRole="radiogroup"
            accessibilityLabel={t("map.travelMode")}
          >
            {modes.map((m) => {
              const on = m === travelMode;
              return (
                <Pressable
                  key={m}
                  onPress={() => setTravelMode(m)}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={MODE_LABEL[m]}
                  style={[
                    styles.modeChip,
                    {
                      flexDirection: isRTL ? "row-reverse" : "row",
                      backgroundColor: on ? colors.primary : colors.surface,
                      borderColor: on ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text variant="caption" style={{ color: on ? colors.textOnPrimary : colors.text }}>
                    {MODE_EMOJI[m]}
                  </Text>
                  <Text
                    variant="caption"
                    style={[
                      { color: on ? colors.textOnPrimary : colors.text },
                      isRTL ? { marginEnd: 4 } : { marginStart: 4 },
                    ]}
                  >
                    {MODE_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Directions is an EXPLICIT action, never the card body. The origin is the
              patient's real GPS fix — never the Muscat discovery anchor. */}
          <Pressable
            onPress={() => openDirections(active)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("map.directions")}
            style={[styles.directions, { flexDirection: isRTL ? "row-reverse" : "row", paddingTop: spacing.sm }]}
          >
            <Icon name="map" size={16} tint={colors.primary} />
            <Text variant="label" color="primary" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>
              {t("map.directions")}
            </Text>
          </Pressable>

          {/* Removes the ambiguity in "4.6 km" — from where? Out of coverage there is no
              distance on the card at all, so this line says what the list IS instead of
              what it is sorted by. It must never read "from you" there. */}
          <Text variant="caption" color="textMuted" style={{ paddingTop: 4 }}>
            {outOfCoverage
              ? t("map.outOfCoverageNoticeBody")
              : coverage === "far"
                ? t("map.nearestIsFar")
                : location.hasLocation
                  ? t("map.nearYou")
                  : t("map.nearMuscat")}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 12 },
  searchWrap: { flex: 1 },
  map: { flex: 1, overflow: "hidden" },
  overlay: { alignItems: "center", justifyContent: "center" },
  cardRow: { alignItems: "center" },
  directions: { alignItems: "center" },
  modes: { alignItems: "center", gap: 8, flexWrap: "wrap" },
  modeChip: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    // 32px + the row's own padding clears the 44dp target with hitSlop.
    minHeight: 32,
  },
  /** Floating recentre control, kept clear of the attribution strip. */
  recentre: {
    position: "absolute",
    bottom: 28,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
