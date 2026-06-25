import { create } from "zustand";

/**
 * In-progress appointment booking draft — a CLIENT-ONLY flow buffer shared across
 * the three booking steps (schedule → review → success). Not persisted: a booking
 * is transient until confirmed. `confirm()` mints a mock confirmation (id + totals)
 * for the success screen; the real Thawani payment + create-appointment call will
 * replace `confirm()` in the dynamic-integration phase.
 */
export interface ConfirmedBooking {
  id: string;
  fee: number;
  vat: number;
  total: number;
}

interface BookingState {
  doctorId: string | null;
  doctorName: string;
  specialty: string;
  facility: string;
  initials: string;
  fee: number; // OMR
  clinicId: string | null;
  clinicName: string;
  clinicMeta: string;
  dateId: string | null;
  dateLabel: string;
  slot: string | null;
  patientId: string | null; // null = primary account ("You")
  patientName: string;
  reason: string;
  confirmed: ConfirmedBooking | null;

  start: (d: { doctorId: string; doctorName: string; specialty: string; facility: string; initials: string; fee: number }) => void;
  setSchedule: (s: { clinicId: string; clinicName: string; clinicMeta: string; dateId: string; dateLabel: string; slot: string }) => void;
  setPatient: (id: string | null, name: string) => void;
  setReason: (reason: string) => void;
  confirm: () => ConfirmedBooking;
  reset: () => void;
}

const initial = {
  doctorId: null,
  doctorName: "",
  specialty: "",
  facility: "",
  initials: "",
  fee: 0,
  clinicId: null,
  clinicName: "",
  clinicMeta: "",
  dateId: null,
  dateLabel: "",
  slot: null,
  patientId: null,
  patientName: "",
  reason: "",
  confirmed: null,
};

/** OMR is quoted to 3 decimals; VAT is 5%. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  ...initial,

  start: (d) =>
    set((s) =>
      // Preserve an in-progress draft for the same doctor; otherwise reset for a new one.
      s.doctorId === d.doctorId ? { ...d } : { ...initial, ...d }
    ),

  setSchedule: (sched) => set({ ...sched }),
  setPatient: (patientId, patientName) => set({ patientId, patientName }),
  setReason: (reason) => set({ reason }),

  confirm: () => {
    const { fee } = get();
    const vat = round3(fee * 0.05);
    const total = round3(fee + vat);
    // Mock booking reference (real id comes from the create-appointment API later).
    const id = `ML-${10000 + Math.floor(Math.random() * 89999)}`;
    const confirmed: ConfirmedBooking = { id, fee, vat, total };
    set({ confirmed });
    return confirmed;
  },

  reset: () => set({ ...initial }),
}));
