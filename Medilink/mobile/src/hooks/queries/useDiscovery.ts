import { useQuery } from "@tanstack/react-query";

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
