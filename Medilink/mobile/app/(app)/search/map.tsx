import React, { useMemo, useState } from "react";
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
import {
  isValidTarget,
  nativeDirectionsUrl,
  webDirectionsUrl,
} from "@/services/maps/directions";
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
 * Pull byte-identical markers apart so every one of them can be tapped (audit finding).
 *
 * Three verified clinics in Ruwi share the coordinate 23.588,58.3829 — which is exactly the
 * MUSCAT constant above, i.e. a geocoder that fell back to the city centre rather than three
 * clinics that genuinely occupy one point. Leaflet stacks them, so only the topmost pin was
 * reachable and the other two were invisible and unselectable.
 *
 * This spreads a duplicate group evenly around a ~20 m circle. Deliberately:
 *   • RENDER-ONLY — the repository, the RPC and the database are untouched. `distance_km`
 *     still comes from the server and is unchanged, so ordering cannot drift.
 *   • DETERMINISTIC — the angle comes from the index, so a pin does not hop between renders.
 *   • ~20 m — smaller than the positional error already present in the data, and invisible
 *     at any zoom where you would read a clinic name.
 *   • EXACT duplicates only. Clinics 50 m apart are left exactly where they are.
 *
 * This is a legibility workaround, not a data fix. Correcting those three coordinates is a
 * separate, explicitly-approved data operation.
 */
const DEDUPE_OFFSET_M = 20;
function spreadCoincident(pins: MapMarker[]): MapMarker[] {
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
    // 1 degree of latitude ≈ 111,320 m; longitude shrinks by cos(latitude).
    const latDeg = DEDUPE_OFFSET_M / 111_320;
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      const lngDeg = latDeg / Math.max(Math.cos((p.latitude * Math.PI) / 180), 0.01);
      out.push({
        ...p,
        latitude: p.latitude + latDeg * Math.sin(angle),
        longitude: p.longitude + lngDeg * Math.cos(angle),
      });
    });
  }
  return out;
}

/** Map View (PDF p19): real map with nearby-clinic markers + a bottom clinic card. */
export default function MapViewScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { t, num } = useI18n();

  /**
   * Real device position (QA map Phase 1/2). `auto: false` on purpose — the OS permission
   * dialog should not be the first thing a patient sees on opening the map; they tap
   * "Use my location" and the prompt follows their own action.
   */
  const location = useCurrentLocation();

  /**
   * THE SEARCH ORIGIN. This is the whole point of the change: the RPC is now queried from
   * the patient's real coordinates when we have them, and only falls back to Muscat when we
   * genuinely do not. `distance_km` and the ordering come back from PostGIS relative to
   * whichever origin was sent — nothing is recomputed on the client.
   */
  const origin = location.hasLocation && location.coords
    ? { lat: location.coords.latitude, lng: location.coords.longitude }
    : { lat: MUSCAT.lat, lng: MUSCAT.lng };

  const query = useNearbyClinics(origin);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const clinics = useMemo(() => {
    const all = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.area ?? "").toLowerCase().includes(q)
    );
  }, [query.data, search]);

  const active: Clinic | undefined = clinics.find((c) => c.id === selectedId) ?? clinics[0];

  /** Markers for the map surface, derived from the same clinic list as the card. */
  const markers: MapMarker[] = useMemo(
    () =>
      spreadCoincident(
        clinics
          .filter((c) => c.latitude != null && c.longitude != null)
          .map((c) => ({
            id: c.id,
            latitude: c.latitude as number,
            longitude: c.longitude as number,
            title: localizedName(c.name, c.name_ar, c.name_ar_status, isRTL),
            subtitle: c.area,
            selected: c.id === active?.id,
          }))
      ),
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

  /** Follow the patient once located; otherwise stay on the country-level fallback view. */
  const camera: MapCamera = userLocation
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
   * Hand off to the platform's own map app — Apple Maps on iOS, the `geo:` chooser on
   * Android — with an OpenStreetMap web fallback. No Google dependency, and no API key.
   */
  const openDirections = (c: Clinic) => {
    const target = {
      latitude: c.latitude as number,
      longitude: c.longitude as number,
      label: localizedName(c.name, c.name_ar, c.name_ar_status, isRTL),
    };
    if (!isValidTarget(target)) return;

    Linking.openURL(nativeDirectionsUrl(Platform.OS, target)).catch(() => {
      // No map app installed (or an unexpected platform) — fall back to the web.
      Linking.openURL(webDirectionsUrl(target)).catch(() => Alert.alert(t("map.loadError")));
    });
  };

  return (
    <Screen scroll={false} padded={false} edges={["top", "left", "right", "bottom"]}>
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
          onMarkerPress={setSelectedId}
          onError={setMapError}
          testID="osm-map"
        />

        {/* Leaflet or the tile server was unreachable — say so instead of showing a
            blank rectangle the user can't interpret. */}
        {mapError && !query.isLoading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <ErrorState message={t("map.tilesError")} onRetry={() => setMapError(null)} />
          </View>
        ) : null}

        {query.isLoading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <LoadingState />
          </View>
        ) : query.isError ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <ErrorState message={t("map.loadError")} onRetry={() => query.refetch()} />
          </View>
        ) : clinics.length === 0 ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <EmptyState title={t("map.emptyTitle")} body={t("map.emptyBody")} />
          </View>
        ) : null}
      </View>

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
                      `★ ${active.rating}`,
                      // Unit via i18n so Arabic reads "٤٫٥٦ كم", not "٤٫٥٦ km".
                      active.distance_km != null ? `${active.distance_km} ${t("common.km")}` : null,
                    ]
                      .filter(Boolean)
                      .join("   ·   ")
                  )}
                </Text>
              </View>
              <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
            </View>
          </Card>

          {/* Directions kept as a SEPARATE action — same native handoff as before. */}
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

          {/* Removes the ambiguity in "4.56 km" — from where? */}
          <Text variant="caption" color="textMuted" style={{ paddingTop: 4 }}>
            {location.hasLocation ? t("map.nearYou") : t("map.nearMuscat")}
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
});
