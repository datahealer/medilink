import { useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";

/** AI features (PDF p26-27) — doctor recommendations + AI visit summary. */
export const aiKeys = {
  suggest: (symptoms: string) => ["ai", "suggest", symptoms] as const,
  visitSummary: ["ai", "visit-summary"] as const,
};

export function useSuggestedDoctors(symptoms: string) {
  return useQuery({
    queryKey: aiKeys.suggest(symptoms),
    queryFn: () => repositories.ai.suggestDoctors(symptoms),
    enabled: !!symptoms,
  });
}

export function useVisitSummary() {
  return useQuery({
    queryKey: aiKeys.visitSummary,
    queryFn: () => repositories.ai.latestVisitSummary(),
  });
}
