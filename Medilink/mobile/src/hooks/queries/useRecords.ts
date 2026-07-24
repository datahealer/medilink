import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { NewDocumentUpload } from "@/data/types";

/** Document Vault (PDF p28-29) — `patient_documents` + the `patient-docs` bucket. */
export const documentKeys = {
  list: ["documents", "list"] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  signedUrl: (path: string | undefined) => ["documents", "url", path] as const,
};

export function useDocuments() {
  return useQuery({
    queryKey: documentKeys.list,
    queryFn: () => repositories.document.list(),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => repositories.document.get(id),
    enabled: !!id,
  });
}

/** Short-lived signed URL for previewing/downloading a stored object. */
export function useDocumentSignedUrl(filePath: string | undefined) {
  return useQuery({
    queryKey: documentKeys.signedUrl(filePath),
    queryFn: () => repositories.document.signedUrl(filePath as string),
    enabled: !!filePath,
    staleTime: 50 * 60 * 1000, // signed URLs live ~1h; refetch well before expiry
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewDocumentUpload) => repositories.document.upload(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.list }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repositories.document.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.list }),
  });
}

/**
 * File a paid invoice PDF into the Document Vault (type "invoice"), idempotently: it
 * first checks the vault for a document with the same name and skips the upload if it's
 * already there, so re-opening the invoice never creates duplicates. Downloads the PDF
 * from its (public) invoice URL and re-stores it in the private patient-docs bucket so
 * the vault's signed-URL view/download/share works like any other document.
 */
export function useSaveInvoiceToVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { invoiceUrl: string; name: string; appointmentId?: string | null }) => {
      const existing = await repositories.document.list();
      if (existing.some((d) => d.type === "invoice" && d.name === input.name)) return null;
      return repositories.document.upload({
        name: input.name,
        type: "invoice",
        asset: { uri: input.invoiceUrl, name: `${input.name}.pdf`, mimeType: "application/pdf" },
        linkedAppointmentId: input.appointmentId ?? null,
      });
    },
    onSuccess: (res) => {
      if (res) qc.invalidateQueries({ queryKey: documentKeys.list });
    },
  });
}
