import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { FavouriteTargetKind } from "@/data/types";

/** Favourites (PDF p20) — save/unsave doctors and clinics. */
export const favouriteKeys = {
  list: (kind?: FavouriteTargetKind) => ["favourites", "list", kind ?? "all"] as const,
  is: (targetType: FavouriteTargetKind, targetId: string) =>
    ["favourites", "is", targetType, targetId] as const,
};

export function useFavourites(kind?: FavouriteTargetKind) {
  return useQuery({
    queryKey: favouriteKeys.list(kind),
    queryFn: () => repositories.favourite.list(kind),
  });
}

export function useIsFavourite(
  target: { targetId: string; targetType: FavouriteTargetKind },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: favouriteKeys.is(target.targetType, target.targetId),
    queryFn: () => repositories.favourite.isFavourite(target),
    // Favourites are auth-only; callers pass `enabled: !isGuest` so a guest viewing a
    // public doctor profile never fires the (failing) authenticated query.
    enabled: !!target.targetId && (options?.enabled ?? true),
  });
}

export function useToggleFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: { targetId: string; targetType: FavouriteTargetKind }) =>
      repositories.favourite.toggle(target),
    onSuccess: (next, target) => {
      qc.setQueryData(favouriteKeys.is(target.targetType, target.targetId), next);
      qc.invalidateQueries({ queryKey: ["favourites", "list"] });
    },
  });
}
