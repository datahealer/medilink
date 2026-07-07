# Map View — Implementation Specification (DEFERRED / future task)

> **Status:** Module 3 of the post-integration pass. The **nearby-clinics data source is real and
> ready** (PostGIS geo column + `get_nearby_facilities` RPC + shared `nearbyFacilities`). The Map View
> screen was **not connected** because it needs pieces that don't exist yet: a **client map SDK**, a
> **device-location library**, and a **per-clinic fee** for the price pins. Feeding real clinics into
> the current static map stand-in would invent pin positions ("map data"), which is disallowed. The
> static stand-in is retained until the items below land. No backend/API and no map data were invented.

## What already exists (real, ready to use)
- **`facilities.location geography(Point, 4326)`** — PostGIS point (migration `20260325071208_f14_facility_upgrade`). `branches.location` too (`20260401051240`).
- **`get_nearby_facilities(p_lat, p_lng, p_radius_m)`** RPC → `TABLE(id, name, type, address, services, rating, review_count, is_verified, cover_photo_url, phone, distance_km)`; filters `status='active' AND is_verified AND location IS NOT NULL AND ST_DWithin(...)` and only facilities that have doctors. (`get_nearby_branches` also exists.)
- **`shared/src/api/facilities.ts` → `nearbyFacilities(db, { lat, lng, radiusM })`** wraps the RPC. Also `listFacilities`, `getFacility`.

So the backend can already return real nearby clinics with distance. The gaps are on the client and in the pin/fee data.

## Gaps to complete the approved Map View (Design Doc p19)
The design is a **real map**: "Clinics near me", **OMR price pins**, a **user-location marker**, and a **bottom-sheet doctor card**.

### 1. Client map SDK — BLOCKING (native)
No map library is installed (`react-native-maps` / `expo-maps` / mapbox absent). A real map + geographic pins require a native module → an Expo **dev-client / EAS rebuild**. Decision needed: `react-native-maps` (Google/Apple) vs `expo-maps`.

### 2. Device location — BLOCKING (native)
No `expo-location`. `get_nearby_facilities` needs the user's `lat/lng`; without a location lib there is no real "near me" origin (and no user-location marker). Adds a runtime permission.

### 3. Price pins have no fee source — BACKEND
The design pins show a consultation fee ("OMR 25"), but **facilities have no fee** (fees are per-doctor). Options:
- **(Recommended)** extend `get_nearby_facilities` to also return `min_fee_omr` — the minimum in-person consultation fee among the facility's active doctors — so each pin can show a representative price; **or**
- change the pin to show **distance / rating** instead of a price (design change).

### 4. Facility geodata must be populated — DATA
The RPC requires `location IS NOT NULL`. Verify facilities actually have coordinates seeded; otherwise "near me" returns empty. Provider onboarding should capture facility lat/lng.

### 5. Bottom-sheet card — design vs data
The design shows a **doctor** card on pin tap, but the map is **facility-based**. Either show a **facility card** (name, type, distance, rating) or have the RPC/companion query return a **representative doctor** per facility.

## Mobile wiring (once §1–§4 are ready)
- Implement `doctorRepo.mapClinics` (or a new `facilityRepo.nearby`) via `api.facilities.nearbyFacilities(supabase, { lat, lng, radiusM })` using the device location from `expo-location`.
- Render pins on the real map SDK; open the bottom-sheet on pin tap.
- Flip the hybrid so `mapClinics` is real. `useMapClinics` already exists.

## Until implemented
The Map View keeps its **static stand-in** — no real pins are plotted, because without a map SDK any placement would be invented. The nearby-facilities RPC + shared function are ready to feed a real map the moment the client deps land.

## Rollout
1. Adopt a map SDK + `expo-location` (client; dev-client/EAS rebuild).
2. Add `min_fee_omr` (or drop price → distance/rating) to `get_nearby_facilities`; ensure facility `location` is populated.
3. Wire `mapClinics` → `nearbyFacilities`; render pins + bottom-sheet; flip hybrid.
