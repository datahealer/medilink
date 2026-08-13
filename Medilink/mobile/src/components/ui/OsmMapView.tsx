import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useTheme } from "@/hooks/useTheme";
import {
  buildLeafletHtml,
  buildStateScript,
  parseMapMessage,
  selectFitPoints,
  spreadCoincident,
} from "@/services/maps/leafletBridge";
import { activeTileSource } from "@/services/maps/tiles";
import type { MapCamera, MapMarker, UserLocation } from "@/services/maps/types";

export interface OsmMapViewProps {
  camera: MapCamera;
  markers: MapMarker[];
  /** Patient position, when location permission has been granted. */
  userLocation?: UserLocation | null;
  /**
   * Should the patient's pin influence the camera? Defaults to `true`. Set `false` when the
   * pin is real but irrelevant to framing — the out-of-coverage fallback, where the patient
   * is thousands of kilometres from every clinic and fitting both would zoom the map out
   * until the clinics are invisible. The pin is still drawn.
   */
  frameWithUser?: boolean;
  /**
   * THE CAMERA PERMISSION SLIP. The map moves only when this value CHANGES. The screen bumps
   * it on the four approved triggers — first load, first fix, coverage transition, explicit
   * "locate me" — and on nothing else. Selecting a marker or filtering by search reuses the
   * current token, so neither can recentre the map, and a manual pan is never undone.
   */
  fitToken?: number;
  onMarkerPress?: (id: string) => void;
  onMapPress?: () => void;
  /** The user dragged the map. Surfaced so a screen can show a "recentre" affordance. */
  onUserPan?: () => void;
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
 * checkout.
 *
 * ── THE DOCUMENT IS BUILT ONCE ──
 *
 * `html` depends only on the tile source and the colour scheme. It deliberately does NOT
 * depend on markers, camera or user location, because `source={{html}}` RELOADS the page on
 * every change: the previous implementation rebuilt the document whenever a marker's
 * `selected` flag flipped, so tapping a pin tore down and re-created the whole map. That is
 * why markers felt dead and why panning never survived.
 *
 * Data now flows into the live page through `injectJavaScript` → `window.__mlApply`.
 *
 * The rendering engine is isolated here and in `src/services/maps/*`. Screens depend only
 * on `MapMarker`/`MapCamera`, so swapping to MapLibre for production means replacing this
 * one component. See docs/MAPS_OSM_MIGRATION.md.
 */
export function OsmMapView({
  camera,
  markers,
  userLocation,
  frameWithUser = true,
  fitToken = 0,
  onMarkerPress,
  onMapPress,
  onUserPan,
  onReady,
  onError,
  testID,
}: OsmMapViewProps) {
  const { colors, scheme } = useTheme();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  /**
   * The zoom the page is actually rendering at, reported on every `zoomend`.
   *
   * De-overlap needs it: separating coincident pins by a fixed distance in METRES is
   * invisible when zoomed out (20 m is 0.009 px at the zoom that frames all of Oman), so the
   * offset has to be recomputed from metres-per-pixel whenever the zoom changes. Seeded at
   * the camera's own zoom so the very first paint is already correct.
   */
  const [zoom, setZoom] = useState(() => Math.round(Math.log2(360 / (camera.latitudeDelta || 0.35))));

  /** Only the document-level inputs. Changing these is the ONLY thing that reloads. */
  const html = useMemo(
    () =>
      buildLeafletHtml({
        tiles: activeTileSource(),
        dark: scheme === "dark",
        colors: {
          primary: colors.primary,
          accent: colors.primaryMuted,
          surface: colors.surface,
          text: colors.text,
        },
      }),
    [scheme, colors.primary, colors.primaryMuted, colors.surface, colors.text]
  );

  /** Pins pulled apart for the CURRENT zoom, so a coincident group stays tappable. */
  const placed = useMemo(() => spreadCoincident(markers, zoom), [markers, zoom]);

  const state = useMemo(
    () => ({
      markers: placed,
      userLocation: userLocation ?? null,
      fit: selectFitPoints(placed, userLocation, { includeUser: frameWithUser }),
      fitToken,
      camera,
    }),
    [placed, userLocation, frameWithUser, fitToken, camera]
  );

  /**
   * Push state into the live page. Runs on every state change AND once the page reports
   * ready, because injections before boot would be dropped.
   */
  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(buildStateScript(state));
  }, [ready, state]);

  // Keep the latest callbacks without re-creating the message handler.
  const handlers = useRef({ onMarkerPress, onMapPress, onUserPan, onReady, onError });
  handlers.current = { onMarkerPress, onMapPress, onUserPan, onReady, onError };

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
      case "zoom":
        setZoom(msg.zoom);
        break;
      case "userPan":
        handlers.current.onUserPan?.();
        break;
      case "error":
        handlers.current.onError?.(msg.message);
        break;
    }
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} testID={testID}>
      <WebView
        ref={webRef}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        // The page is fully self-authored; only pinned Leaflet + tile requests leave it.
        javaScriptEnabled
        domStorageEnabled={false}
        // ANDROID DRAG FIX. RNCWebView.onTouchEvent calls requestDisallowInterceptTouchEvent
        // only when this is set, which is what stops a React Native ancestor stealing the
        // gesture mid-pan. Without it the map could not be dragged on a physical device.
        // `checkout.tsx` already relies on the same prop for the Thawani page.
        nestedScrollEnabled
        // NB: `scrollEnabled` is deliberately NOT set. It is a documented no-op on Android
        // (RNCWebViewManager.setScrollEnabled has an empty body in newarch and is absent in
        // oldarch), so setting it false only ever misled readers into thinking gestures were
        // configured here. Leaflet owns all gesture handling inside the page.
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
