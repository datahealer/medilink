import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { MedicalHistoryPatch, PhotoAsset, ProfilePatch } from "@/data/types";

/** Query keys (centralised so mutations can invalidate precisely). */
export const patientKeys = {
  profile: ["patient", "profile"] as const,
  medicalHistory: ["patient", "medical-history"] as const,
  appointmentsUpcoming: ["patient", "appointments", "upcoming"] as const,
};

/** Current user's profile: { account, patient } (domain model). */
export function useProfile() {
  return useQuery({
    queryKey: patientKeys.profile,
    queryFn: () => repositories.patient.getProfile(),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => repositories.patient.updateProfile(patch),
    onSuccess: (data) => {
      qc.setQueryData(patientKeys.profile, data);
    },
  });
}

/** Structured medical history (or null if none recorded yet). */
export function useMedicalHistory() {
  return useQuery({
    queryKey: patientKeys.medicalHistory,
    queryFn: () => repositories.medicalHistory.get(),
  });
}

export function useUpsertMedicalHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MedicalHistoryPatch) => repositories.medicalHistory.upsert(patch),
    onSuccess: (data) => {
      qc.setQueryData(patientKeys.medicalHistory, data);
    },
  });
}

/** Upcoming appointments for the dashboard "next visit" card (read-only). */
export function useUpcomingAppointments() {
  return useQuery({
    queryKey: patientKeys.appointmentsUpcoming,
    queryFn: () => repositories.appointment.listUpcoming(),
  });
}

/**
 * Upload a profile photo, then refresh the profile so the new URL shows immediately.
 * `asset` is an expo-image-picker-style local file ref.
 */
export function useUploadProfilePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset: PhotoAsset) => repositories.patient.uploadProfilePhoto(asset),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.profile });
    },
  });
}
