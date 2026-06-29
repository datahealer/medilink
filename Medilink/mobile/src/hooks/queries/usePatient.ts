import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositories } from "@/data";
import type { AppointmentTab, MedicalHistoryPatch, NewAppointment, PhotoAsset, ProfilePatch } from "@/data/types";

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

/** Appointments for a tab (upcoming / past / all). */
export function useAppointments(tab: AppointmentTab) {
  return useQuery({
    queryKey: ["appointments", "list", tab],
    queryFn: () => repositories.appointment.list(tab),
  });
}

/** A single appointment by id. */
export function useAppointment(id: string) {
  return useQuery({
    queryKey: ["appointments", "detail", id],
    queryFn: () => repositories.appointment.get(id),
    enabled: !!id,
  });
}

/** The caller's payments (newest first) — Payment History (read side). */
export function usePayments() {
  return useQuery({
    queryKey: ["payments", "list"],
    queryFn: () => repositories.payment.list(),
  });
}

/** A single payment by id (Invoice & Receipt). */
export function usePayment(id: string) {
  return useQuery({
    queryKey: ["payments", "detail", id],
    queryFn: () => repositories.payment.get(id),
    enabled: !!id,
  });
}

/** The payment for an appointment (Payment Confirmation after returning from checkout). */
export function usePaymentByAppointment(appointmentId: string) {
  return useQuery({
    queryKey: ["payments", "by-appointment", appointmentId],
    queryFn: () => repositories.payment.getByAppointment(appointmentId),
    enabled: !!appointmentId,
  });
}

/** Create a Thawani hosted-checkout session for an appointment (returns the URL). */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: { appointmentId: string; amount: number }) => repositories.payment.createCheckout(input),
  });
}

/** Available booking slots for a doctor on a given date (YYYY-MM-DD). */
export function useAvailableSlots(params: { doctorId: string; date: string; branchId?: string }) {
  return useQuery({
    queryKey: ["appointments", "slots", params.doctorId, params.date, params.branchId ?? null],
    queryFn: () => repositories.appointment.getSlots(params),
    enabled: !!params.doctorId && !!params.date,
  });
}

/** Create (book) an appointment; refresh the upcoming list on success. */
export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAppointment) => repositories.appointment.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patientKeys.appointmentsUpcoming });
    },
  });
}

/** Invalidate every appointment view after a mutation (list, details, dashboard). */
function invalidateAppointments(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["appointments"] }); // list + detail + slots
  qc.invalidateQueries({ queryKey: patientKeys.appointmentsUpcoming }); // dashboard card
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string }) => repositories.appointment.cancel(vars.id, vars.reason),
    onSuccess: () => invalidateAppointments(qc),
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; slot: { date: string; start: string; end: string } }) =>
      repositories.appointment.reschedule(vars.id, vars.slot),
    onSuccess: () => invalidateAppointments(qc),
  });
}

export function useCheckInAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repositories.appointment.checkIn(id),
    onSuccess: () => invalidateAppointments(qc),
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
