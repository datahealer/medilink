// QUEUE — patient-facing live queue state.
//
// OWNERSHIP BOUNDARY (docs/QUEUE_BACKEND_FOR_MEDILINK.md §6):
//   HAMS owns the queue state machine, position arithmetic, ETA, ordering,
//   priority, status transitions, authorisation and the push trigger.
//   MediLink owns the patient UI only.
//
// This module therefore contains NO queue logic. It carries:
//   1. TypeScript types mirroring the `get_my_queue_position()` payload, so web
//      and mobile describe the contract identically in one place.
//   2. The realtime channel helper (contract §2.3).
//
// The queue-status READ is deliberately NOT here: it goes through the backend
// route `GET /api/patients/me/queue-status`, which is the single read surface
// MediLink consumes. Do not add a direct `.rpc("get_my_queue_position")` call —
// that would create a second, drift-prone path to the same data.
import type { DB } from "./client";

/** `queue_items.status` — HAMS-owned enum (`queue_status`). */
export type QueueItemStatus = "waiting" | "called" | "done" | "expired";

/** Acknowledgement kinds accepted by `acknowledge_queue_call()` (contract §2.2). */
export type QueueAcknowledgeKind = "seen" | "on_my_way";

/** Error codes returned by both queue endpoints (contract §2.1 / §2.2). */
export type QueueErrorCode =
  | "not_in_queue"
  | "not_checked_in"
  | "not_in_active_queue"
  | "forbidden"
  | "unauthorized"
  | "unauthenticated"
  | "invalid_kind"
  | "validation_error"
  | "server_error";

/**
 * `data` payload of `GET /api/patients/me/queue-status` (contract §2.1).
 *
 * Every number here is computed server-side. Never recompute `people_ahead` or
 * `estimated_wait_minutes` on the client — HAMS scopes `people_ahead` to the
 * same doctor and counts `called` rows as ahead, and that rule must not be
 * duplicated.
 */
export interface QueueStatusPayload {
  found: true;
  queue_item_id: string;
  /** Facility-wide sequence. Display only — it is NOT "3rd in line". */
  position: number;
  /** Doctor-scoped count of patients ahead. The number patients actually care about. */
  people_ahead: number;
  /** Integer position currently with the doctor, or null. Never an identity. */
  now_serving_position: number | null;
  queue_status: QueueItemStatus;
  is_waiting: boolean;
  is_called: boolean;
  is_done: boolean;
  is_checked_in: boolean;
  checked_in_at: string | null;
  called_at: string | null;
  done_at: string | null;
  acknowledged_at: string | null;
  acknowledged_kind: QueueAcknowledgeKind | null;
  is_walkin: boolean;
  is_online: boolean;
  /** `people_ahead × avg_consultation_minutes`; 0 once called. */
  estimated_wait_minutes: number;
  avg_consultation_minutes: number;
  appointment: {
    id: string;
    reference_number: string | null;
    slot_date: string | null;
    slot_start: string | null;
    slot_end: string | null;
    status: string | null;
    type: string | null;
    checked_in_at: string | null;
  };
  doctor: {
    id: string;
    full_name: string | null;
    specialty: string | null;
    /** `doctors.status` — available | with_patient | on_break | unavailable. */
    status: string | null;
    status_updated_at: string | null;
  } | null;
  facility: { id: string; name: string | null };
  /** Authoritative clock. Drive countdowns from this, never from device time. */
  server_time: string;
}

/** `data` payload of `POST /api/patients/me/queue-status/acknowledge` (contract §2.2). */
export interface QueueAcknowledgePayload {
  success: true;
  queue_item_id: string;
  queue_status: QueueItemStatus;
  acknowledged_kind: QueueAcknowledgeKind;
  first_acknowledgement: boolean;
  acknowledged_at: string;
}

/** Envelope both queue endpoints return. */
export type QueueEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: QueueErrorCode | string; message: string } };

/**
 * Subscribe to the caller's own queue row (contract §2.3).
 *
 * Enabled by migration `20260728000001` (queue_items → `supabase_realtime`,
 * REPLICA IDENTITY FULL) and scoped by the `queue_items_patient_read` RLS policy
 * from `20260728000002`, so only the patient's own row is ever delivered.
 *
 * INVALIDATION SIGNAL ONLY. The row carries no `people_ahead` and no ETA, so
 * `onChange` must re-call `GET /api/patients/me/queue-status` rather than read
 * the payload. Nothing about the queue may be derived here.
 *
 * Returns an unsubscribe function; always call it on unmount/background.
 */
export function subscribeToMyQueue(
  db: DB,
  appointmentId: string,
  onChange: () => void
): () => void {
  const channel = db
    .channel(`my-queue:${appointmentId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "queue_items",
        filter: `appointment_id=eq.${appointmentId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    void db.removeChannel(channel);
  };
}
