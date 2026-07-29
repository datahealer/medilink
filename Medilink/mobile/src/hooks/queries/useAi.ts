import { useMutation, useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { AiScheduleInput } from "@/data/types";

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

/** Conversational AI scheduling (F-41). A mutation — each turn is a fresh request whose
 *  reply carries entity memory the caller feeds back into the next turn. */
export function useScheduleAssist() {
  return useMutation({
    mutationFn: (input: AiScheduleInput) => repositories.ai.scheduleAssist(input),
  });
}
