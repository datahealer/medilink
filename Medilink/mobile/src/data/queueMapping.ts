/**
 * Pure queue mapping — extracted from `data/real/index.ts` so it can be tested
 * without standing up Supabase, SecureStore and env validation.
 *
 * OWNERSHIP BOUNDARY (docs/QUEUE_BACKEND_FOR_MEDILINK.md §6): HAMS owns every
 * queue calculation — position, people_ahead, ETA, ordering, priority. This module
 * RENAMES fields and DERIVES nothing. If a future change makes it compute a queue
 * number, that is a contract violation and the tests here are written to catch it.
 *
 * No runtime imports by design (types only) — keeps it trivially testable and
 * guarantees it can never reach for a network client.
 */
import type { QueueStatusPayload } from "@medilink/shared/mobile";

import type { QueuePhase, QueueStatus, QueueUnavailableReason } from "./types";

/** Reason codes the queue endpoints return verbatim (contract §2.1 / §2.2). */
const PASSTHROUGH_REASONS: QueueUnavailableReason[] = [
  "not_in_queue",
  "not_checked_in",
  "forbidden",
  "server_error",
];

/**
 * Map a failed queue request onto a contract reason code.
 *
 * Takes primitives rather than the `ApiError` instance so the *policy* is pure and
 * testable while the `instanceof` extraction stays at the call site (where the
 * class actually lives).
 *
 * @param status HTTP status (`0` = transport failure before any response — how
 *               `apiFetch` signals "couldn't reach the server").
 * @param code   `error.code` from the response envelope, when present.
 */
export function queueReasonFrom(
  status: number | undefined,
  code: string | undefined
): QueueUnavailableReason {
  if (code && (PASSTHROUGH_REASONS as string[]).includes(code)) {
    return code as QueueUnavailableReason;
  }
  // The backend uses both spellings depending on whether the RPC or the route
  // rejected the call; the UI only needs one.
  if (code === "unauthorized" || code === "unauthenticated") return "unauthorized";

  if (status === 0) return "offline";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_in_queue";
  return "server_error";
}

/**
 * Which UI state to render. Derived ONLY from the server's mutually-exclusive
 * boolean flags — never from timestamps or elapsed time, so a stalled queue looks
 * stalled instead of silently advancing. Unknown future states fall back to
 * `waiting`, which renders a sane screen rather than a blank one.
 */
export function queuePhaseFrom(payload: {
  is_called: boolean;
  is_done: boolean;
}): QueuePhase {
  if (payload.is_called) return "called";
  if (payload.is_done) return "done";
  return "waiting";
}

/** Contract payload → domain model. Pure renaming; no queue arithmetic. */
export function mapQueueStatus(p: QueueStatusPayload): QueueStatus {
  return {
    queueItemId: p.queue_item_id,
    position: p.position,
    peopleAhead: p.people_ahead,
    nowServingPosition: p.now_serving_position ?? null,
    status: p.queue_status,
    phase: queuePhaseFrom(p),
    isCheckedIn: p.is_checked_in,
    checkedInAt: p.checked_in_at,
    calledAt: p.called_at,
    doneAt: p.done_at,
    acknowledgedAt: p.acknowledged_at,
    acknowledgedKind: p.acknowledged_kind,
    isWalkin: p.is_walkin,
    isOnline: p.is_online,
    estimatedWaitMinutes: p.estimated_wait_minutes,
    avgConsultationMinutes: p.avg_consultation_minutes,
    appointment: {
      id: p.appointment.id,
      referenceNumber: p.appointment.reference_number,
      slotDate: p.appointment.slot_date,
      slotStart: p.appointment.slot_start,
      slotEnd: p.appointment.slot_end,
      status: p.appointment.status,
      type: p.appointment.type,
    },
    doctor: p.doctor
      ? {
          id: p.doctor.id,
          fullName: p.doctor.full_name,
          specialty: p.doctor.specialty,
          status: p.doctor.status,
          statusUpdatedAt: p.doctor.status_updated_at,
        }
      : null,
    facility: { id: p.facility.id, name: p.facility.name },
    serverTime: p.server_time,
  };
}
