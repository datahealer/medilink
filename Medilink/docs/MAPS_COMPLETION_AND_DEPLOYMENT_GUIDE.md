# MediLink — Maps & Discovery: Completion & Deployment Guide

**Purpose:** permanent handover for the Map View + address-based geocoding feature. The
code is complete; what remains is **external deployment/configuration** (native install,
Supabase deploy, Google Cloud). This document lets anyone pause here and finish later.

**Status at handover:** code-complete, **awaiting external deployment**.
**Last updated:** 2026-07-24 · **Branch:** `runtime-rtl`

---

## 1. Current Status

### Fully implemented (code)
- **Real map screen** — `mobile/app/(app)/search/map.tsx` rewritten to use `react-native-maps` (`MapView` + a `Marker` per clinic at real coordinates). Replaced the fake `PIN_POS`/`MAP_BLOCKS` placeholder. Includes: search field (client-side filter by name/area), bottom clinic card, "Get directions" (opens the maps app), loading/error/empty states, EN/AR + RTL.
- **Mobile data layer** — `Clinic` type gains `latitude`/`longitude`; new `discovery.nearbyClinics(geo)` repo method (real → `api.facilities.nearbyFacilities`; mock → seeded Muscat clinics); new `useNearbyClinics` hook. Wired into the hybrid repository.
- **Address-based geocoding (backend)** — edge function `supabase/functions/geocode-facility` (Google Geocoding, server-only key) + `set_facility_geocode` RPC. Structured address columns on `facilities`.

### Backend work complete (code)
- Migration `20260723000000_nearby_facilities_coords.sql` — adds `latitude`/`longitude` to the existing `get_nearby_facilities` RPC (derived from PostGIS `facilities.location` via `ST_Y`/`ST_X`). **No new/duplicate API.**
- Migration `20260724000000_facility_structured_address.sql` — adds `building_number/street/area/city/country(default 'Oman')/formatted_address/geocoded_at` to `facilities`; adds `set_facility_geocode(id,lat,lng,formatted)` (`SECURITY DEFINER`, `service_role`-only) as the sole writer of `location`.
- Edge function `geocode-facility` registered in `supabase/config.toml` (`verify_jwt=true`).

### Frontend (mobile) work complete (code)
- Map screen, data layer, hook (above). No further mobile code is required. **No mobile redesign needed to finish** — it already reads coordinates from the RPC.

### Database work complete (code, not yet applied)
- Two additive migrations authored (coords on the RPC; structured address + geocode RPC). Reversible.

### Already deployed
- **Nothing map-specific has been deployed.** Both migrations are **un-pushed**; the edge function is **un-deployed**; `react-native-maps` is declared in `package.json` but **not installed** in the working env; no Google keys/secrets set; no Database Webhook configured.

### Still pending (summary)
Native dep install + rebuild, `db:push` (both migrations), edge-function deploy, `GOOGLE_GEOCODING_API_KEY` secret, Android Google Maps key in `app.json`, Database Webhook config, backfill of existing facilities, device/production verification. (Full checklist in §3.)

---

## 2. Architecture

```
Clinic author (HAMS — external to this repo)
        │  enters a STRUCTURED ADDRESS (building, street, area, city, country)
        ▼
facilities table (Supabase / reused HAMS schema)
        │  INSERT / UPDATE of address columns
        ▼
Database Webhook  (Supabase dashboard config)
        │  fires on facilities INSERT/UPDATE
        ▼
Edge Function: geocode-facility  (server-side; holds the Google key)
        │  builds full address → Google Geocoding API → {lat,lng}
        │  (skips if address unchanged / insufficient)
        ▼
set_facility_geocode RPC  (SECURITY DEFINER, service_role only)
        │  writes coordinates
        ▼
facilities.location  (PostGIS geography, SRID 4326 — single source of truth)
        ▼
get_nearby_facilities RPC  (unchanged; derives latitude/longitude via ST_Y/ST_X)
        ▼
Mobile Map  (react-native-maps MapView + Markers; reads lat/lng from the RPC)
```

**Component responsibilities**
- **HAMS (external):** authors clinics/facilities and their structured address. Should stop entering coordinates manually. *Not modifiable from this repo.*
- **`facilities` table:** stores the structured address (new columns) + `location` (backend-managed coords) + `address` jsonb (legacy, kept for compat).
- **Database Webhook:** the trigger that makes geocoding automatic regardless of who writes the row (the only integration point, since HAMS is external).
- **`geocode-facility` edge function:** the single, server-side place geocoding happens. Builds the address, calls Google, caches (skips unchanged/insufficient), handles errors (ZERO_RESULTS→skip; transient/provider→5xx retry), writes coords via the RPC. Also accepts `{ facility_id }` for manual/backfill.
- **`set_facility_geocode` RPC:** the only writer of `facilities.location` (keeps coordinates backend-managed; clients never set them).
- **`facilities.location` (PostGIS):** single coordinate source of truth. No separate lat/lng columns (avoids drift).
- **`get_nearby_facilities` RPC:** proximity search returning facility rows + `distance_km` + `latitude`/`longitude` (derived from `location`). **Unchanged by the address work** → backward compatible.
- **Mobile map:** renders markers from the RPC's lat/lng. Anchored to Muscat + 50 km radius (device-location centring is a documented follow-up).

---

## 3. Deployment Checklist

| Step | Status | Notes |
|---|---|---|
| Map screen code (`search/map.tsx`) | ✅ Done | `react-native-maps` MapView + Markers |
| Data layer + hook (`nearbyClinics`, `useNearbyClinics`) | ✅ Done | reuses `api.facilities.nearbyFacilities` |
| Migration: coords on `get_nearby_facilities` (`20260723000000`) | ✅ Code | 🟡 pending `db:push` |
| Migration: structured address + `set_facility_geocode` (`20260724000000`) | ✅ Code | 🟡 pending `db:push` |
| Edge function `geocode-facility` code + `config.toml` | ✅ Done | 🟡 pending deploy |
| `react-native-maps` installed in the workspace | 🟡 Pending | `cd mobile && npx expo install react-native-maps` |
| `db:push` (applies both migrations) | 🟡 Pending | also applies other pending migrations (see tracker 1.8) |
| `supabase functions deploy geocode-facility` | 🟡 Pending | — |
| Edge Function secret `GOOGLE_GEOCODING_API_KEY` | 🟡 Pending | `supabase secrets set …` |
| Database Webhook (facilities INSERT/UPDATE → `geocode-facility`) | 🟡 Pending | dashboard config |
| Google Cloud project + **billing enabled** | 🟡 Pending | required for Maps SDK Android + Geocoding |
| Enable **Geocoding API** (backend key) | 🟡 Pending | for `geocode-facility` |
| Enable **Maps SDK for Android** (mobile key) | 🟡 Pending | for the Android map |
| Android Google Maps key in `app.json` (`android.config.googleMaps.apiKey`) | 🟡 Pending | placeholder present |
| Maps SDK for iOS | 🚫 N/A | iOS uses **Apple Maps** (`PROVIDER_DEFAULT`) — no Google key unless you switch to `PROVIDER_GOOGLE` |
| Android rebuild (native dep) | ❌ Not started | EAS/dev client after install |
| iOS rebuild (native dep) | ❌ Not started | EAS/dev client after install |
| Backfill existing facilities (geocode) | 🟡 Pending | invoke `geocode-facility` with `{facility_id}` per row |
| Production verification | ❌ Not started | see §8 |
| Device testing (Android + iOS) | ❌ Not started | markers, search, directions, states, RTL |

---

## 4. Google Maps Requirements (production)

**Google Cloud project & billing**
- A Google Cloud project with a **billing account enabled**. Maps SDK and Geocoding have free monthly credit but **require billing to be attached** — without it, Android map tiles fail and Geocoding returns `REQUEST_DENIED`.

**APIs to enable**
- **Maps SDK for Android** — renders the map on Android.
- **Geocoding API** — backend address → coordinates (edge function).
- **Maps SDK for iOS** — only if you switch the map to `PROVIDER_GOOGLE`. Current code uses `PROVIDER_DEFAULT` → **Apple Maps on iOS (no Google key/SDK needed)**.

**API keys — who uses which, where stored**
| Key | Used by | Stored in | Restriction |
|---|---|---|---|
| **Android Maps key** | Mobile Android map | `app.json` → `expo.android.config.googleMaps.apiKey` (placeholder present) | Restrict to **Android apps** (package `com.medilink.app` + SHA-1) + **Maps SDK for Android** |
| **iOS Maps key** | *(only if `PROVIDER_GOOGLE`)* | `app.json` → `expo.ios.config.googleMapsApiKey` | Restrict to **iOS apps** (bundle `com.inzint.medilink`) + Maps SDK for iOS. **Not required today.** |
| **Geocoding key** | Backend edge function | Supabase **Edge Function secret** `GOOGLE_GEOCODING_API_KEY` (documented in `.env.example`) | Restrict to **Geocoding API**; server key (no app restriction / IP-restrict if possible). **Never** in the client bundle. |

> Use **separate keys** for the client (Maps SDK) and the server (Geocoding). Never reuse the server geocoding key in the app, and never ship the geocoding key to the client.

**Environment variables**
- `GOOGLE_GEOCODING_API_KEY` (server-only; Supabase function secret).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected into the edge function.

**Files to update**
- `app.json` — replace `android.config.googleMaps.apiKey` placeholder (`REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY`) with the real Android key (and add the iOS key only if switching to Google on iOS).
- `.env.example` already documents `GOOGLE_GEOCODING_API_KEY` (set the real value as a Supabase secret, not in the repo).

**What cannot be completed until billing is enabled**
- Android map tiles won't render (grey map).
- Geocoding calls fail (`REQUEST_DENIED`) → no coordinates stored → no markers.
- iOS map (Apple Maps) **does** render without Google billing, but with **no clinic markers** until geocoding has populated coordinates (which needs billing). So end-to-end is blocked on billing.

---

## 5. Free Alternative — OpenStreetMap / Nominatim (documented only, NOT implemented)

Two independent pieces could each move off Google:

**A) Map tiles (client):**
- react-native-maps renders via Google/Apple providers, not OSM directly. To use OSM you would either: overlay OSM raster tiles via `<UrlTile>` on react-native-maps, **or** switch to a MapLibre-based lib (`@maplibre/maplibre-react-native`) with a free/self-hosted style, **or** render Leaflet in a WebView.
- **Pros:** no Google billing for tiles; open data. **Cons:** OSM tile usage policy discourages heavy use of the public tile server (need a tile provider or self-host); MapLibre is a different SDK (rewrite the map screen); WebView-Leaflet loses native feel. **Effort:** `<UrlTile>` overlay ~0.5 d; MapLibre migration ~2–3 d; WebView ~1–2 d.

**B) Geocoding (backend):**
- Replace the Google call in `geocode-facility` with **Nominatim** (`https://nominatim.openstreetmap.org/search?format=json&countrycodes=om&q=…`).
- **Pros:** free, no billing. **Cons:** **1 req/sec** usage policy + required `User-Agent`/attribution; **no bulk**; weaker accuracy for new/rural Oman addresses; public instance not recommended for production (should self-host Nominatim). **Effort:** ~0.5 d to swap the provider call + add rate-limit/backoff; self-hosting Nominatim is a separate infra task.

**Recommendation:** for production in Oman, Google remains best; use Nominatim only as a stopgap while billing is unavailable — cheapest switch is **geocoding-only** (B), keeping Apple Maps on iOS so no client tiles are needed there.

---

## 6. Current Known Blockers

1. **Google Cloud billing not enabled** → Android tiles + Geocoding blocked (the primary blocker).
2. **`react-native-maps` not installed** in the working env (native dep; `expo install` fails in the CI sandbox — must be installed in a working env) → `search/map.tsx` doesn't compile/run yet (1 typecheck/lint error, isolated to that file).
3. **Migrations un-pushed** (`20260723000000`, `20260724000000`) → RPC lat/lng + address/geocode not live.
4. **Edge function un-deployed** + **`GOOGLE_GEOCODING_API_KEY` unset** → no geocoding.
5. **Database Webhook not configured** → address changes don't auto-geocode.
6. **No coordinates backfilled** for existing facilities → empty map until backfill or new geocodes.
7. **No device testing** (Android/iOS) performed.

---

## 7. Remaining Estimated Work

- **Development remaining:** ~0 (code complete). Optional follow-ups: device-location centring via `expo-location` (~0.5 d); real open/closed via `working_hours` (~2 h); Nominatim fallback if billing delayed (~0.5 d).
- **Deployment remaining:** ~0.5–1 d — `expo install` + Android/iOS rebuild; `db:push`; `functions deploy`; set secret; Google Cloud project/keys/billing; `app.json` Android key; Database Webhook; backfill.
- **Configuration remaining:** ~1–2 h — Google Cloud APIs + key restrictions, Supabase webhook + secret.
- **Testing remaining:** ~0.5 d — device (markers, search, directions, states, RTL) + production verification (§8).

---

## 8. Resume Guide (step-by-step)

1. **Google Cloud:** create/select a project → **enable billing** → enable **Maps SDK for Android** + **Geocoding API** → create two restricted keys (Android app key; server Geocoding key).
2. **Mobile dep:** `cd mobile && npx expo install react-native-maps` → confirm `npm run typecheck` + `npx expo lint` are clean (the 1 `react-native-maps` error disappears).
3. **App config:** set `app.json` → `expo.android.config.googleMaps.apiKey` to the real Android key. (iOS uses Apple Maps — nothing to do unless switching to `PROVIDER_GOOGLE`.)
4. **Native build:** EAS build (or dev client) for Android + iOS (native module added).
5. **Database:** `npm run db:push` (applies the coords + address/geocode migrations, and any other pending ones). `npm run db:types` to regenerate types if desired.
6. **Edge function:** `supabase functions deploy geocode-facility` → `supabase secrets set GOOGLE_GEOCODING_API_KEY=<server key>`.
7. **Webhook:** Supabase dashboard → Database → Webhooks → new webhook on `public.facilities`, events INSERT + UPDATE, type "Supabase Edge Functions" → `geocode-facility`.
8. **Backfill:** for each existing facility with an address, `POST {SUPABASE_URL}/functions/v1/geocode-facility` with `{ "facility_id": "<id>" }` and the service-role bearer. Verify `SELECT id, ST_Y(location::geometry) lat, ST_X(location::geometry) lng, formatted_address, geocoded_at FROM facilities`.
9. **HAMS:** ensure HAMS populates the structured address columns (stop entering coordinates). *(External change.)*
10. **Verify (§9 + device):** create/edit a clinic address → coords appear within seconds; open the mobile Map View → markers at real coordinates; search filters; directions open; states + RTL correct.

---

## 9. Verification

- **No backend functionality missing:** geocoding (edge fn) + coordinate write (RPC) + proximity read (`get_nearby_facilities`) form a complete server-side chain. ✅ (code)
- **No database functionality missing:** address columns + `set_facility_geocode` + coords on the RPC. ✅ (code; pending push)
- **No duplicate APIs:** reused `get_nearby_facilities` (added columns) and `api.facilities.nearbyFacilities`; added only `set_facility_geocode` (new capability, not a duplicate) + the `geocode-facility` function. **No duplicate endpoints.** ✅
- **Existing map APIs backward compatible:** `get_nearby_facilities` signature unchanged (only added return columns); old callers ignore extras. ✅
- **Mobile architecture needs no redesign:** the map reads lat/lng from the RPC exactly as before; the address/geocoding change is entirely server-side. ✅

**Current gates:** backend typecheck **0**; mobile typecheck/lint show exactly **1** error — the `react-native-maps` import in `search/map.tsx` — which resolves on install. No other issues.

---

*Handover complete. The Maps feature is code-complete and paused here; resume via §8 when Google billing + deployment access are available. Development continues with Phase 6 (Remaining Feature Wiring).*
