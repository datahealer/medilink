/**
 * Provider-agnostic map contract.
 *
 * The map surface is deliberately abstracted so the rendering engine can be swapped
 * without touching any screen. Today it is Leaflet + OpenStreetMap raster tiles in a
 * WebView (no API key of any kind). The intended production upgrade is MapLibre with
 * a licensed vector tile provider — see docs/MAPS_OSM_MIGRATION.md.
 *
 * Nothing in this folder may import a screen, a repository, or a Supabase client.
 */

/** A pin on the map. `id` is echoed back on tap so callers can resolve their own model. */
export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  /** Popup title. Rendered as TEXT inside the WebView — never as HTML. */
  title: string;
  /** Optional popup subtitle (e.g. area). Also rendered as text. */
  subtitle?: string | null;
  /** Highlights the pin (used for the currently-selected clinic). */
  selected?: boolean;
}

/** Where the camera starts. Deltas mirror the previous react-native-maps `Region`. */
export interface MapCamera {
  latitude: number;
  longitude: number;
  /** Latitude span in degrees; converted to a Leaflet zoom level. */
  latitudeDelta: number;
  longitudeDelta: number;
}

/** The patient's own position, when location permission has been granted. */
export interface UserLocation {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres; drawn as a circle when present. */
  accuracyM?: number | null;
}

/**
 * Raster tile source. Kept as data (not hardcoded in the HTML) so switching provider
 * is a config change rather than a template edit.
 */
export interface TileSource {
  /** XYZ template, e.g. `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. */
  urlTemplate: string;
  /**
   * Attribution HTML. **Legally required** by OSM's ODbL licence and by most
   * commercial providers. Never render the map without it.
   */
  attributionHtml: string;
  maxZoom: number;
  /** Applies a CSS filter to tiles so raster maps read correctly in dark mode. */
  supportsDarkFilter: boolean;
}

/** Messages the WebView posts back to React Native. */
export type MapMessage =
  | { type: "ready" }
  | { type: "markerPress"; id: string }
  | { type: "mapPress" }
  | { type: "error"; message: string };
