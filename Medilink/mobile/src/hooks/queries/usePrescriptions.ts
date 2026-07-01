import { useMutation, useQuery } from "@tanstack/react-query";

import { repositories } from "@/data";

/** Prescriptions (PDF p30-31). */
export const prescriptionKeys = {
  list: ["prescriptions", "list"] as const,
  detail: (id: string) => ["prescriptions", "detail", id] as const,
};

export function usePrescriptions() {
  return useQuery({
    queryKey: prescriptionKeys.list,
    queryFn: () => repositories.prescription.list(),
  });
}

export function usePrescription(id: string) {
  return useQuery({
    queryKey: prescriptionKeys.detail(id),
    queryFn: () => repositories.prescription.get(id),
    enabled: !!id,
  });
}

/** Mint/reuse a "send to pharmacy" share link on demand. */
export function usePrescriptionShareLink() {
  return useMutation({
    mutationFn: (id: string) => repositories.prescription.shareLink(id),
  });
}

/** Fetch the doctor-generated PDF's signed URL on demand (throws if not generated). */
export function usePrescriptionPdfUrl() {
  return useMutation({
    mutationFn: (id: string) => repositories.prescription.pdfUrl(id),
  });
}
