# Maps — Google → OpenStreetMap migration

**Date:** 2026-07-29 · **Status:** implemented, verified
**Goal:** remove every Google Maps API key / Google Cloud credential requirement from
development and testing.

---

## 1. What was there before

| Item | Finding |
|---|---|
| Library | `react-native-maps@1.20.1` |
| Screens using maps | **exactly one** — `app/(app)/search/map.tsx` |
| Provider | `PROVIDER_DEFAULT` → Apple Maps on iOS, **Google Maps on Android** |
| Android key | `app.json` → `android.config.googleMaps.apiKey` = the literal placeholder `REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY` |
| Native project | none — fully managed (CNG), so there is no `AndroidManifest.xml` to edit |
| Directions | `https://www.google.com/maps/search/?api=1&query=…` (no key, but Google-only) |
| Server geocoding | `GOOGLE_GEOCODING_API_KEY` in the `geocode-facility` Edge Function (backend, unchanged) |

**Why Android was broken:** `react-native-maps` on Android is built on the Google Maps
SDK. Without a valid key the map renders blank. The placeholder guaranteed that.
iOS was unaffected because `PROVIDER_DEFAULT` uses Apple MapKit, which needs no key.

---

## 2. What was chosen, and why not MapLibre

**Implemented: Leaflet + OpenStreetMap raster tiles inside `react-native-webview`.**

MapLibre (`@maplibre/maplibre-react-native`) was the stated preference and is the better
*long-term* engine. It was not chosen for this change, for three concrete reasons:

1. **It is a new native module.** It cannot run in Expo Go and requires a fresh dev-client
   build before anyone can see a map. The WebView approach needs **no new dependency at
   all** — `react-native-webview@13.15.0` already ships for Thawani checkout — so the map
   works in Expo Go *and* in existing builds immediately.
2. **It would not actually remove the key requirement.** MapLibre renders *vector* tiles,
   and essentially every hosted vector style (MapTiler, Stadia, Thunderforest) requires an
   API key. Adopting MapLibre for vector tiles swaps a Google key for a MapTiler key —
   which does not satisfy "no credentials for development". Pointing MapLibre at OSM
   *raster* tiles avoids the key but discards the reason to use MapLibre.
3. **It cannot be verified here.** A native Android build is not producible in this
   environment, so the change could not be proven to compile and run. The WebView route was
   verified end-to-end (§6).

**The engine is isolated**, so this is not a one-way door — see §5.

---

## 3. Files changed

### Added

| File | Role |
|---|---|
| `mobile/src/services/maps/types.ts` | Provider-agnostic contract (`MapMarker`, `MapCamera`, `UserLocation`, `TileSource`, `MapMessage`) |
| `mobile/src/services/maps/tiles.ts` | Tile source config + pinned Leaflet CDN URLs with SRI hashes |
| `mobile/src/services/maps/leafletBridge.ts` | Pure HTML builder + message parser (no React, no RN imports) |
| `mobile/src/services/maps/directions.ts` | Pure, key-free directions URL builders |
| `mobile/src/components/ui/OsmMapView.tsx` | WebView map component |
| `mobile/src/services/maps/__tests__/leafletBridge.test.ts` | 22 tests |
| `mobile/src/services/maps/__tests__/directions.test.ts` | 12 tests |
| `docs/MAPS_OSM_MIGRATION.md` | this document |

### Modified

| File | Change |
|---|---|
| `mobile/app/(app)/search/map.tsx` | `MapView`/`Marker` → `OsmMapView`; markers derived via `useMemo`; platform-native directions; tile-error state |
| `mobile/src/components/ui/index.ts` | export `OsmMapView` |
| `mobile/app.json` | **removed** `android.config.googleMaps` |
| `mobile/package.json` | **removed** `react-native-maps` |
| `mobile/src/i18n/en.ts`, `ar.ts` | added `map.tilesError` |

### Packages

- **Removed:** `react-native-maps@1.20.1`
- **Added:** none

---

## 4. Functionality preserved

| Requirement | Status | Notes |
|---|---|---|
| Display clinic locations | ✅ | Same `useNearbyClinics` data, unchanged |
| Map markers | ✅ | Themed pins; selected pin enlarges |
| Marker tap → selection | ✅ | `markerPress` message → `setSelectedId` |
| Zoom and pan | ✅ | Leaflet gestures + a zoom control |
| Navigation flow | ✅ | Route, header, search field, bottom clinic card all unchanged |
| Directions | ✅ **improved** | Apple Maps on iOS / `geo:` chooser on Android (opens the user's own map app) with an OSM web fallback — no Google |
| Display patient location | ✅ *supported* | `OsmMapView` renders a patient pin + accuracy circle whenever `userLocation` is passed. **Nothing supplies it yet** — `expo-location` is not a dependency, matching the previous behaviour. Wiring it later is a one-line change in the screen. |
| Dark mode | ✅ **new** | Tiles are CSS-filtered for dark theme |
| Error state | ✅ **new** | Previously a blank rectangle if the map failed; now a retryable message |
| Attribution | ✅ **required** | OSM ODbL attribution is rendered and its link opens the system browser |

---

## 5. Swapping the engine later (one file)

Screens depend only on `MapMarker` / `MapCamera` from `services/maps/types.ts`. To move to
MapLibre or a licensed provider:

- **Change tile provider only:** edit `activeTileSource()` in `services/maps/tiles.ts`.
- **Change rendering engine:** replace `components/ui/OsmMapView.tsx`, keeping the same
  props. No screen changes.

---

## 6. Verification performed

| Check | Result |
|---|---|
| `npm run typecheck` (4 workspaces) | ✅ 0 errors |
| `cd mobile && npm run lint` | ✅ 0 problems |
| `npx jest` | ✅ **189/189** across 12 suites (34 new map tests) |
| `npx expo export --platform android` | ✅ bundled — 6.63 MB Hermes bytecode |
| `npx expo export --platform ios` | ✅ bundled |
| `require.resolve("react-native-maps")` | ✅ no longer resolvable |
| Google Maps strings in the shipped Android bundle | ✅ **0** for `AirGoogleMaps`, `maps.googleapis`, `PROVIDER_GOOGLE`, `com.google.android.gms.maps` |
| OSM strings in the shipped bundle | ✅ `tile.openstreetmap.org`, `unpkg.com/leaflet`, `openstreetmap.org/copyright` all present |

**Not verified** (not possible in this environment): rendering on a physical Android/iOS
device. The bundle compiles and the logic is unit-tested, but a real device pass is still
required — see `DEVICE_TEST_CHECKLIST.md` §Maps.

### Security notes

Clinic names are untrusted database text rendered inside an HTML document, so:
- all dynamic data crosses into the page as a JSON literal via `encodeJson()`, which
  escapes `<`, `>`, U+2028 and U+2029 — a name containing `</script>` cannot break out;
- popup text is assigned with `textContent`, never `innerHTML`;
- Leaflet is loaded from a **pinned** URL with a **Subresource Integrity** hash, so a
  substituted or tampered file is rejected rather than executed;
- main-frame navigation away from the inline document is blocked; the OSM attribution link
  is opened in the system browser instead.

Both properties are covered by tests, including a hostile-name injection case.

---

## 7. Manual steps required

| # | Step | Needed? |
|---|---|---|
| 1 | `npm install` at the repo root | ✅ already run |
| 2 | Restart Metro with a clear cache: `cd mobile && npx expo start -c` | **Yes** — a dependency was removed |
| 3 | Rebuild the dev client / EAS build | **Recommended, not required.** The map works in existing builds and Expo Go because no new native module was added. A rebuild is only needed to physically strip the now-unused Google Maps SDK from the binary. |
| 4 | Delete the Google Maps API key from Google Cloud | Optional — nothing references it any more |
| 5 | Verify the map on a physical Android device | **Yes** — first Android device pass for maps |

**No Google Cloud project, billing account, or API key is required for the app's maps.**

---

## 8. Is this production-ready?

**The code is production-quality. The tile source is not.**

| Aspect | Verdict |
|---|---|
| Architecture, error handling, security, tests | ✅ production-quality |
| Directions | ✅ production-ready (platform-native, no credentials) |
| **OSM public tile servers** | ❌ **development/testing only** |
| Leaflet-from-CDN at runtime | ⚠️ acceptable, hardening available |

**Two things to change before a public release:**

1. **Tile provider (required).** `tile.openstreetmap.org` is donation-funded; its
   [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) forbids heavy
   or commercial use, offers no uptime guarantee, and blocks abusive clients. A patient-app
   at scale is exactly what it excludes. Move `activeTileSource()` to MapTiler, Stadia
   Maps, Thunderforest, or a self-hosted OpenMapTiles/Protomaps stack.
   ⚠️ Most need an API key — but a **tile key is not a Google Cloud project**: it is scoped
   to map rendering, has predictable per-tile pricing, and is not tied to Google billing.
2. **Consider vendoring Leaflet (recommended).** SRI protects *integrity* but not
   *availability* — if unpkg is unreachable (restricted hospital wifi, network filtering)
   the map shows its error state. Bundling `leaflet.js`/`leaflet.css` as local assets, or
   moving to MapLibre native, removes that runtime dependency. This is when MapLibre
   becomes the right call: at that point you are paying for a tile provider anyway, so the
   vector-tile advantage is finally available.

**Recommended path:** ship this for development, QA and beta. Before public launch, pick a
licensed tile provider (a one-line change) and decide MapLibre-vs-vendored-Leaflet.

---

## 9. Still Google-dependent (isolated, documented)

| Item | Where | Needs a Google credential? | Notes |
|---|---|---|---|
| **Geocoding** — clinic address → coordinates | `supabase/functions/geocode-facility` (server-side) | ✅ `GOOGLE_GEOCODING_API_KEY` | **Untouched by this change.** Backend-only, runs at facility onboarding, never called from the app. The free alternative is OSM **Nominatim** — but its usage policy caps ~1 req/s and forbids bulk geocoding, so for production either keep Google Geocoding or use the geocoding endpoint of whichever tile provider is chosen (MapTiler and Stadia both offer one). |
| Map pin data | `doctor.mapClinics` in `mobile/src/data/index.ts` | ❌ | ⚠️ Still the **mock** source. Unrelated to this migration, but note the map screen itself uses the real `discovery.nearbyClinics`. |

No other Google Maps dependency remains in the mobile app.
