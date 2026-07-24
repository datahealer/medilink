import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { Doctor, DoctorSearchParams, NewReviewSubmission } from "@/data/types";

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
    // Keep the current results visible while a larger "Load more" window fetches
    // (the query key changes with `limit`), avoiding a full loading flash (QA #13).
    placeholderData: keepPreviousData,
  });
}

/**
 * The user's favourite doctors (QA #6) — composed from existing repos (favourite.list
 * + doctor.get), so no new repository logic and no backend ordering change. Powers the
 * dedicated "Favourites" tab in search; independent of the normal search/pagination.
 */
export function useFavouriteDoctors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["doctors", "favourites"] as const,
    queryFn: async (): Promise<Doctor[]> => {
      const favs = await repositories.favourite.list("doctor");
      const results = await Promise.all(favs.map((f) => repositories.doctor.get(f.targetId)));
      return results.filter((d): d is Doctor => d != null);
    },
    enabled: options?.enabled ?? true,
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

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewReviewSubmission) => repositories.review.submit(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: doctorKeys.reviews(input.doctorId) });
    },
  });
}
