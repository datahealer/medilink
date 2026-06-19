// Patient data API CONTRACTS (shared by web + mobile). Implementations are the
// re-homed direct-Supabase modules; privileged ops are reached via the backend
// API client. These signatures are the single source of truth for both clients.
import type { DB } from "./client";

export interface PatientApi {
  // direct-Supabase (RLS) — implemented in this package
  profile: { getMine(db: DB): Promise<unknown>; updateMine(db: DB, patch: Record<string, unknown>): Promise<unknown>; };
  family: { list(db: DB): Promise<unknown[]>; add(db: DB, member: Record<string, unknown>): Promise<unknown>; };
  doctors: { search(db: DB, q: { term?: string; specialty?: string; cursor?: string }): Promise<unknown[]>; byId(db: DB, id: string): Promise<unknown>; };
  facilities: { nearby(db: DB, geo: { lat: number; lng: number }): Promise<unknown[]>; availableSlots(db: DB, facilityId: string, date: string): Promise<unknown[]>; };
  appointments: { listMine(db: DB, tab: "upcoming" | "past"): Promise<unknown[]>; book(db: DB, input: Record<string, unknown>): Promise<unknown>; cancel(db: DB, id: string): Promise<unknown>; };
  records: { history(db: DB): Promise<unknown[]>; documents(db: DB): Promise<unknown[]>; };
  labs: { list(db: DB): Promise<unknown[]>; markViewed(db: DB, id: string): Promise<void>; };
  prescriptions: { list(db: DB): Promise<unknown[]>; byId(db: DB, id: string): Promise<unknown>; };
  reviews: { mine(db: DB): Promise<unknown[]>; create(db: DB, input: Record<string, unknown>): Promise<unknown>; };
  notifications: { list(db: DB): Promise<unknown[]>; unreadCount(db: DB): Promise<number>; readAll(db: DB): Promise<void>; };
}

// Privileged operations (reached via backend API, not direct Supabase):
export interface BackendApi {
  payments: { checkout(body: unknown): Promise<unknown>; invoice(id: string): Promise<unknown>; };
  ai: { symptomCheck(body: unknown): Promise<unknown>; suggestDoctor(body: unknown): Promise<unknown>; };
  prescriptions: { generatePdf(id: string): Promise<Blob>; shareLink(id: string): Promise<{ url: string }>; };
  auth: { sendOtp(body: unknown): Promise<unknown>; verifyOtp(body: unknown): Promise<unknown>; };
}
