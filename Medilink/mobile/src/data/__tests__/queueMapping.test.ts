import type { QueueStatusPayload } from "@medilink/shared/mobile";

import { mapQueueStatus, queuePhaseFrom, queueReasonFrom } from "../queueMapping";

/**
 * Queue contract boundary (docs/QUEUE_BACKEND_FOR_MEDILINK.md).
 *
 * HAMS owns every queue calculation. These tests exist to catch two classes of
 * regression that would otherwise only surface in production:
 *   1. a field rename in the payload silently mapping to `undefined`;
 *   2. someone "helpfully" computing position/ETA on the client, which would
 *      diverge from the server and break the ownership boundary.
 */

/** A complete, contract-shaped `waiting` payload (contract §2.1). */
function payload(over: Partial<QueueStatusPayload> = {}): QueueStatusPayload {
  return {
    found: true,
    queue_item_id: "q-1",
    position: 7,
    people_ahead: 2,
    now_serving_position: 5,
    queue_status: "waiting",
    is_waiting: true,
    is_called: false,
    is_done: false,
    is_checked_in: true,
    checked_in_at: "2026-07-28T09:12:04.113Z",
    called_at: null,
    done_at: null,
    acknowledged_at: null,
    acknowledged_kind: null,
    is_walkin: false,
    is_online: true,
    estimated_wait_minutes: 30,
    avg_consultation_minutes: 15,
    appointment: {
      id: "a-1",
      reference_number: "HAMS-4F2A91C7",
      slot_date: "2026-07-28",
      slot_start: "10:00:00",
      slot_end: "10:15:00",
      status: "checked_in",
      type: "in_person",
      checked_in_at: "2026-07-28T09:12:04.113Z",
    },
    doctor: {
      id: "d-1",
      full_name: "Dr. Fatima Al-Said",
      specialty: "Cardiology",
      status: "with_patient",
      status_updated_at: "2026-07-28T09:40:11.002Z",
    },
    facility: { id: "f-1", name: "Muscat Central Clinic" },
    server_time: "2026-07-28T09:42:00.517Z",
    ...over,
  };
}

describe("queuePhaseFrom", () => {
  it("derives phase from the server's flags only", () => {
    expect(queuePhaseFrom({ is_called: false, is_done: false })).toBe("waiting");
    expect(queuePhaseFrom({ is_called: true, is_done: false })).toBe("called");
    expect(queuePhaseFrom({ is_called: false, is_done: true })).toBe("done");
  });

  it("prefers `called` when both flags are set", () => {
    // Defensive: being called is the actionable state, so it must win.
    expect(queuePhaseFrom({ is_called: true, is_done: true })).toBe("called");
  });
});

describe("mapQueueStatus", () => {
  it("maps every field of a waiting payload", () => {
    const s = mapQueueStatus(payload());
    expect(s).toEqual({
      queueItemId: "q-1",
      position: 7,
      peopleAhead: 2,
      nowServingPosition: 5,
      status: "waiting",
      phase: "waiting",
      isCheckedIn: true,
      checkedInAt: "2026-07-28T09:12:04.113Z",
      calledAt: null,
      doneAt: null,
      acknowledgedAt: null,
      acknowledgedKind: null,
      isWalkin: false,
      isOnline: true,
      estimatedWaitMinutes: 30,
      avgConsultationMinutes: 15,
      appointment: {
        id: "a-1",
        referenceNumber: "HAMS-4F2A91C7",
        slotDate: "2026-07-28",
        slotStart: "10:00:00",
        slotEnd: "10:15:00",
        status: "checked_in",
        type: "in_person",
      },
      doctor: {
        id: "d-1",
        fullName: "Dr. Fatima Al-Said",
        specialty: "Cardiology",
        status: "with_patient",
        statusUpdatedAt: "2026-07-28T09:40:11.002Z",
      },
      facility: { id: "f-1", name: "Muscat Central Clinic" },
      serverTime: "2026-07-28T09:42:00.517Z",
    });
  });

  it("passes the server ETA through verbatim and never recomputes it", () => {
    // people_ahead × avg would be 2 × 15 = 30, but the server says 47. HAMS owns
    // the calculation, so 47 must survive. If this ever fails, someone has started
    // computing ETA on the client — a contract violation, not a bug in the test.
    const s = mapQueueStatus(payload({ estimated_wait_minutes: 47 }));
    expect(s.estimatedWaitMinutes).toBe(47);
  });

  it("preserves a zero ETA rather than treating it as missing", () => {
    // `0` is meaningful (you're next / already called) and must not become a
    // falsy-coalesced default.
    const s = mapQueueStatus(payload({ estimated_wait_minutes: 0, people_ahead: 0 }));
    expect(s.estimatedWaitMinutes).toBe(0);
    expect(s.peopleAhead).toBe(0);
  });

  it("keeps position and peopleAhead distinct", () => {
    // `position` is a facility-wide sequence across parallel doctors; only
    // `people_ahead` is doctor-scoped. Conflating them badly overstates the wait.
    const s = mapQueueStatus(payload({ position: 42, people_ahead: 1 }));
    expect(s.position).toBe(42);
    expect(s.peopleAhead).toBe(1);
  });

  it("normalises a missing now_serving_position to null", () => {
    const s = mapQueueStatus(payload({ now_serving_position: null }));
    expect(s.nowServingPosition).toBeNull();
  });

  it("maps a called payload with its acknowledgement", () => {
    const s = mapQueueStatus(
      payload({
        queue_status: "called",
        is_waiting: false,
        is_called: true,
        called_at: "2026-07-28T09:44:00.000Z",
        acknowledged_at: "2026-07-28T09:44:12.881Z",
        acknowledged_kind: "on_my_way",
        estimated_wait_minutes: 0,
        people_ahead: 0,
      })
    );
    expect(s.phase).toBe("called");
    expect(s.status).toBe("called");
    expect(s.acknowledgedKind).toBe("on_my_way");
    expect(s.estimatedWaitMinutes).toBe(0);
  });

  it("maps a done payload", () => {
    const s = mapQueueStatus(
      payload({
        queue_status: "done",
        is_waiting: false,
        is_done: true,
        done_at: "2026-07-28T10:05:00.000Z",
      })
    );
    expect(s.phase).toBe("done");
    expect(s.doneAt).toBe("2026-07-28T10:05:00.000Z");
  });

  it("tolerates a null doctor (unassigned queue item)", () => {
    // Reception walk-ins can be queued without a doctor assigned.
    const s = mapQueueStatus(payload({ doctor: null }));
    expect(s.doctor).toBeNull();
  });

  it("carries serverTime through so the UI never uses device time", () => {
    const s = mapQueueStatus(payload({ server_time: "2026-01-01T00:00:00.000Z" }));
    expect(s.serverTime).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("queueReasonFrom", () => {
  it("passes contract reason codes through unchanged", () => {
    expect(queueReasonFrom(404, "not_in_queue")).toBe("not_in_queue");
    expect(queueReasonFrom(404, "not_checked_in")).toBe("not_checked_in");
    expect(queueReasonFrom(403, "forbidden")).toBe("forbidden");
    expect(queueReasonFrom(500, "server_error")).toBe("server_error");
  });

  it("collapses both auth spellings to one reason", () => {
    // The route says `unauthorized`; the RPC says `unauthenticated`.
    expect(queueReasonFrom(401, "unauthorized")).toBe("unauthorized");
    expect(queueReasonFrom(401, "unauthenticated")).toBe("unauthorized");
  });

  it("treats status 0 as offline, not a server error", () => {
    // apiFetch signals a pre-response transport failure as status 0. Showing
    // "something went wrong" for a dropped connection is misleading.
    expect(queueReasonFrom(0, undefined)).toBe("offline");
  });

  it("falls back to the status code when no body code is present", () => {
    expect(queueReasonFrom(401, undefined)).toBe("unauthorized");
    expect(queueReasonFrom(403, undefined)).toBe("forbidden");
    expect(queueReasonFrom(404, undefined)).toBe("not_in_queue");
  });

  it("defaults to server_error for anything unrecognised", () => {
    expect(queueReasonFrom(500, undefined)).toBe("server_error");
    expect(queueReasonFrom(418, "teapot")).toBe("server_error");
    expect(queueReasonFrom(undefined, undefined)).toBe("server_error");
  });

  it("prefers the body code over the HTTP status", () => {
    // A 404 carrying `not_checked_in` must offer check-in, not "not in queue".
    expect(queueReasonFrom(404, "not_checked_in")).toBe("not_checked_in");
  });
});
