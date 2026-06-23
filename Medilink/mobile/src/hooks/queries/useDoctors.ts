import { useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { DoctorSearchParams } from "@/data/types";

/** Doctor search / profile / reviews (PDF flows 05–06). Mock-backed in dev. */
export const doctorKeys = {
  search: (params: DoctorSearchParams) => ["doctors", "search", params] as const,
  detail: (id: string) => ["doctors", "detail", id] as const,
  reviews: (id: string) => ["doctors", "reviews", id] as const,
  mapClinics: ["doctors", "map-clinics"] as const,
};

export function useDoctors(params: DoctorSearchParams = {}) {
  return useQuery({
    queryKey: doctorKeys.search(params),
    queryFn: () => repositories.doctor.search(params),
  });
}

export function useDoctor(id: string) {
  return useQuery({
    queryKey: doctorKeys.detail(id),
    queryFn: () => repositories.doctor.get(id),
    enabled: !!id,
  });
}

export function useDoctorReviews(id: string) {
  return useQuery({
    queryKey: doctorKeys.reviews(id),
    queryFn: () => repositories.doctor.reviews(id),
    enabled: !!id,
  });
}

export function useMapClinics() {
  return useQuery({
    queryKey: doctorKeys.mapClinics,
    queryFn: () => repositories.doctor.mapClinics(),
  });
}
