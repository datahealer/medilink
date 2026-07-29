import React, { useCallback, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useTheme } from "@/hooks/useTheme";
import { buildLeafletHtml, parseMapMessage } from "@/services/maps/leafletBridge";
import { activeTileSource } from "@/services/maps/tiles";
import type { MapCamera, MapMarker, UserLocation } from "@/services/maps/types";

export interface OsmMapViewProps {
  camera: MapCamera;
  markers: MapMarker[];
  /** Patient position, when location permission has been granted. */
  userLocation?: UserLocation | null;
  onMarkerPress?: (id: string) => void;
  onMapPress?: () => void;
  /** Fired once Leaflet has rendered, or with a reason when it could not. */
  onReady?: () => void;
  onError?: (reason: string) => void;
  testID?: string;
}

/**
 * Map surface backed by Leaflet + OpenStreetMap raster tiles inside a WebView.
 *
 * Replaces `react-native-maps`, which on Android is built on the Google Maps SDK and
 * therefore requires a Google Cloud API key. This needs **no key on either platform** and
 * adds **no native dependency** — `react-native-webview` already ships for Thawani
 * checkout — so it runs in Expo Go and in existing builds with no rebuild.
 *
 * The rendering engine is isolated here and in `src/services/maps/*`. Screens depend only
 * on `MapMarker`/`MapCamera`, so swapping to MapLibre for production means replacing this
 * one component. See docs/MAPS_OSM_MIGRATION.md.
 */
export function OsmMapView({
  camera,
  markers,
  userLocation,
  onMarkerPress,
  onMapPress,
  onReady,
  onError,
  testID,
}: OsmMapViewProps) {
  const { colors, scheme } = useTheme();
  const [ready, setReady] = useState(false);

  // Remount the WebView only when something structural changes. Re-generating the HTML on
  // every render would reload the page and lose the user's pan/zoom, so the HTML is keyed
  // on the marker set, selection, theme and camera rather than on object identity.
  const markerKey = useMemo(
    () =>
      markers
        .map((m) => `${m.id}:${m.latitude},${m.longitude}${m.selected ? ":s" : ""}`)
        .join("|"),
    [markers]
  );

  const html = useMemo(
    () =>
      buildLeafletHtml({
        camera,
        markers,
        tiles: activeTileSource(),
        dark: scheme === "dark",
        userLocation: userLocation ?? null,
        colors: {
          primary: colors.primary,
          accent: colors.primaryMuted,
          surface: colors.surface,
          text: colors.text,
        },
      }),
    // `markerKey` stands in for `markers` deliberately (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      markerKey,
      camera.latitude,
      camera.longitude,
      camera.latitudeDelta,
      camera.longitudeDelta,
      userLocation?.latitude,
      userLocation?.longitude,
      userLocation?.accuracyM,
      scheme,
      colors.primary,
      colors.primaryMuted,
      colors.surface,
      colors.text,
    ]
  );

  // Keep the latest callbacks without re-keying the WebView.
  const handlers = useRef({ onMarkerPress, onMapPress, onReady, onError });
  handlers.current = { onMarkerPress, onMapPress, onReady, onError };

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = parseMapMessage(event.nativeEvent.data);
    if (!msg) return; // unknown/garbled payloads are ignored, never trusted
    switch (msg.type) {
      case "ready":
        setReady(true);
        handlers.current.onReady?.();
        break;
      case "markerPress":
        handlers.current.onMarkerPress?.(msg.id);
        break;
      case "mapPress":
        handlers.current.onMapPress?.();
        break;
      case "error":
        handlers.current.onError?.(msg.message);
        break;
    }
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} testID={testID}>
      <WebView
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        // The page is fully self-authored; only pinned Leaflet + tile requests leave it.
        javaScriptEnabled
        domStorageEnabled={false}
        // Prevents the WebView hijacking the screen's scroll/gesture handling.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        // Android: without this the tile layer can render blank on some devices.
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // Keep the WebView on its inline document. This callback fires for main-frame
        // NAVIGATIONS only — scripts, stylesheets and map tiles are subresources and are
        // never routed through it, so pinned Leaflet and tile loading are unaffected.
        //
        // The one link in the page is OSM's attribution, which ODbL requires to remain
        // functional; a tap on it opens the system browser instead of turning the map
        // surface into one.
        onShouldStartLoadWithRequest={(req) => {
          if (!/^https?:/i.test(req.url)) return true;
          if (req.navigationType !== "click") return true;
          void Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        // A failed page load is surfaced through the same channel as an in-page failure.
        onError={() => handlers.current.onError?.("map_webview_error")}
        onHttpError={() => handlers.current.onError?.("map_webview_http_error")}
        accessibilityLabel={testID}
        // Hidden from the a11y tree until rendered; the screen supplies a text alternative.
        importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
      />
    </View>
  );
}
