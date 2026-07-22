import { create } from "zustand";

/**
 * In-progress appointment booking draft — a CLIENT-ONLY flow buffer shared across
 * the three booking steps (schedule → review → success). Not persisted: a booking
 * is transient until confirmed. The real appointment is created via
 * repositories.appointment.create() (book_appointment_atomic RPC) on the review
 * screen; `confirm(id)` records that real id + the displayed totals for the
 * success screen. (Payment remains mock — a Thawani step lands in a later batch.)
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
  /** Real facility id the booking targets (doctor's facility; clinic picker is cosmetic). */
  facilityId: string | null;
  dateId: string | null;
  dateLabel: string;
  slot: string | null; // display label, e.g. "10:30 AM"
  slotStart: string | null; // raw "HH:MM" sent to the booking RPC
  patientId: string | null; // null = primary account ("You")
  patientName: string;
  reason: string;
  confirmed: ConfirmedBooking | null;

  start: (d: { doctorId: string; doctorName: string; specialty: string; facility: string; initials: string; fee: number }) => void;
  setSchedule: (s: { clinicId: string; clinicName: string; clinicMeta: string; facilityId: string; dateId: string; dateLabel: string; slot: string; slotStart: string }) => void;
  setPatient: (id: string | null, name: string) => void;
  setReason: (reason: string) => void;
  /** Record the real appointment id (+ computed totals) for the success screen. */
  confirm: (id: string) => ConfirmedBooking;
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
  facilityId: null,
  dateId: null,
  dateLabel: "",
  slot: null,
  slotStart: null,
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

  confirm: (id) => {
    const { fee } = get();
    const vat = round3(fee * 0.05);
    const total = round3(fee + vat);
    const confirmed: ConfirmedBooking = { id, fee, vat, total };
    set({ confirmed });
    return confirmed;
  },

  reset: () => set({ ...initial }),
}));
