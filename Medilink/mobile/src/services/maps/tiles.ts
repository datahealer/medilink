import type { TileSource } from "./types";

/**
 * Tile sources.
 *
 * ⚠️ LICENCE / PRODUCTION NOTE — read before shipping.
 *
 * `OSM_STANDARD` points at OpenStreetMap's public tile servers. That service is run by
 * donation and its Tile Usage Policy explicitly forbids heavy or commercial use, offers
 * no uptime guarantee, and blocks clients that hammer it. It is appropriate for
 * DEVELOPMENT AND TESTING ONLY.
 *
 * For production, switch `activeTileSource()` to a provider with a licence that covers
 * the app's traffic (MapTiler, Stadia Maps, Thunderforest, or a self-hosted
 * OpenMapTiles/Protomaps stack). Most require an API key — but crucially, a tile key is
 * a *tile* credential, not a Google Cloud project, and is scoped to map rendering only.
 *
 * Swapping provider is intentionally a one-line change here; no screen or component
 * touches tile URLs directly.
 */

/** OpenStreetMap standard raster tiles. No API key. Dev/testing only (see above). */
export const OSM_STANDARD: TileSource = {
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  // ODbL attribution — required. Do not remove.
  attributionHtml:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  supportsDarkFilter: true,
};

/**
 * The tile source the app currently renders with.
 *
 * Kept as a function (not a const) so a future implementation can read an env var or a
 * remote flag without changing any call site.
 */
export function activeTileSource(): TileSource {
  return OSM_STANDARD;
}

/**
 * Leaflet is loaded from a pinned CDN URL with a Subresource Integrity hash, so a
 * tampered or substituted file is rejected by the WebView rather than executed.
 *
 * Hashes were computed from the exact 1.9.4 artefacts:
 *   leaflet.js  147,552 bytes
 *   leaflet.css  14,806 bytes
 *
 * If you bump the version you MUST recompute both hashes, e.g.
 *   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
 * A mismatched hash makes the map fail closed (visible error state), never silently.
 */
export const LEAFLET_CDN = {
  version: "1.9.4",
  js: {
    url: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    integrity: "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH",
  },
  css: {
    url: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    integrity: "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H",
  },
} as const;
