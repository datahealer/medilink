import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";
import { NEARBY_RADIUS_M } from "@/services/maps/nearby";

/**
 * Read-only discovery data for the dashboard (recently-visited doctors, featured
 * clinics, top specialties). In `mock` mode these are seeded (PDF p14); the real
 * implementation is wired in Batch 2.
 */
export const discoveryKeys = {
  specialties: ["discovery", "specialties"] as const,
  recentDoctors: ["discovery", "recent-doctors"] as const,
  featuredClinics: ["discovery", "featured-clinics"] as const,
  nearbyClinics: (lat: number, lng: number, radiusM: number) =>
    ["discovery", "nearby-clinics", lat, lng, radiusM] as const,
  searchClinics: (term: string) => ["discovery", "search-clinics", term] as const,
  clinic: (id: string) => ["discovery", "clinic", id] as const,
};

export function useSpecialties() {
  return useQuery({
    queryKey: discoveryKeys.specialties,
    queryFn: () => repositories.discovery.listSpecialties(),
  });
}

export function useRecentDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: discoveryKeys.recentDoctors,
    queryFn: () => repositories.discovery.recentDoctors(),
    enabled: options?.enabled ?? true,
  });
}

export function useFeaturedClinics() {
  return useQuery({
    queryKey: discoveryKeys.featuredClinics,
    queryFn: () => repositories.discovery.featuredClinics(),
  });
}

/** Verified clinics whose name matches `term` (clinic search — QA #14). */
export function useSearchClinics(term: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: discoveryKeys.searchClinics(term),
    queryFn: () => repositories.discovery.searchClinics(term),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** A single clinic for the Clinic Detail screen (QA #14). */
export function useClinic(id: string) {
  return useQuery({
    queryKey: discoveryKeys.clinic(id),
    queryFn: () => repositories.discovery.getClinic(id),
    enabled: !!id,
  });
}

/**
 * Verified clinics near a point, with real coordinates (Map View, PDF p19).
 *
 * `enabled` matters here and is not optional plumbing: the map must NOT fire a query
 * before the location attempt has settled, or it queries from the Muscat fallback, paints
 * Omani pins, and then re-queries from the real position — which is how the screen came to
 * show Muscat clinics and a patient pin thousands of kilometres away in the same frame.
 */
export function useNearbyClinics(
  geo: { lat: number; lng: number; radiusM?: number },
  options?: { enabled?: boolean }
) {
  const radiusM = geo.radiusM ?? NEARBY_RADIUS_M;
  return useQuery({
    queryKey: discoveryKeys.nearbyClinics(geo.lat, geo.lng, radiusM),
    queryFn: () => repositories.discovery.nearbyClinics({ ...geo, radiusM }),
    enabled: options?.enabled ?? true,
  });
}
