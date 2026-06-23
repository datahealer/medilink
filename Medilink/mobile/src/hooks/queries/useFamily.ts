import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { NewFamilyMember } from "@/data/types";

export const familyKeys = {
  list: ["family", "list"] as const,
};

/** The signed-in patient's family members (max 5). */
export function useFamily() {
  return useQuery({
    queryKey: familyKeys.list,
    queryFn: () => repositories.family.list(),
  });
}

export function useAddFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (member: NewFamilyMember) => repositories.family.add(member),
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKeys.list }),
  });
}

export function useUpdateFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<NewFamilyMember> }) =>
      repositories.family.update(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKeys.list }),
  });
}

export function useRemoveFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repositories.family.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: familyKeys.list }),
  });
}
