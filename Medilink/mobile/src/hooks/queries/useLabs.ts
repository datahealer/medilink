import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";

/** Lab Results — reports list, report detail with analytes, and analyte trends (PDF p29-30). */
export const labKeys = {
  list: ["labs", "list"] as const,
  detail: (id: string) => ["labs", "detail", id] as const,
  trend: (code: string) => ["labs", "trend", code] as const,
  signedUrl: (path: string) => ["labs", "signedUrl", path] as const,
};

export function useLabResults() {
  return useQuery({
    queryKey: labKeys.list,
    queryFn: () => repositories.lab.list(),
  });
}

export function useLabResult(id: string | undefined) {
  return useQuery({
    queryKey: labKeys.detail(id ?? ""),
    queryFn: () => repositories.lab.get(id as string),
    enabled: !!id,
  });
}

/** Time series for one analyte code (oldest→newest). Enabled only when a code is provided. */
export function useAnalyteTrend(analyteCode: string | undefined, limit?: number) {
  return useQuery({
    queryKey: labKeys.trend(analyteCode ?? ""),
    queryFn: () => repositories.lab.trend(analyteCode as string, limit),
    enabled: !!analyteCode,
  });
}

/** Signed URL for the report file (Download PDF / Share). Enabled once a path is known. */
export function useLabResultSignedUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: labKeys.signedUrl(storagePath ?? ""),
    queryFn: () => repositories.lab.signedUrl(storagePath as string),
    enabled: !!storagePath,
    staleTime: 4 * 60 * 1000, // signed URLs live ~5 min; refetch before expiry
  });
}

export function useMarkLabViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repositories.lab.markViewed(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: labKeys.list }),
  });
}
