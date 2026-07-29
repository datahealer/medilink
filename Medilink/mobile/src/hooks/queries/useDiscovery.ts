import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";

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

/** Verified clinics near a point, with real coordinates (Map View, PDF p19). */
export function useNearbyClinics(geo: { lat: number; lng: number; radiusM?: number }) {
  const radiusM = geo.radiusM ?? 50000;
  return useQuery({
    queryKey: discoveryKeys.nearbyClinics(geo.lat, geo.lng, radiusM),
    queryFn: () => repositories.discovery.nearbyClinics({ ...geo, radiusM }),
  });
}
