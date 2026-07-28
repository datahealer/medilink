import { ApiError } from "@/services/api";
import { QueueUnavailableError } from "@/data/types";

/**
 * INTEGRATION — Queue Status flow (critical flow #4).
 *
 * Exercises the REAL repository code path end to end with only the HTTP transport
 * mocked: request shape → contract envelope → error-code mapping → domain model.
 * That is the seam where MediLink meets the HAMS queue backend, so a regression
 * here is a production defect the unit tests cannot catch on their own.
 */
// Mock ONLY the transport. `ApiError` stays the real class so the production
// `instanceof ApiError` branch in the repository is genuinely exercised.
jest.mock("@/services/api", () => ({
  ...jest.requireActual("@/services/api"),
  apiFetch: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiFetch } = require("@/services/api") as { apiFetch: jest.Mock };

// Safe as a static import: babel-plugin-jest-hoist lifts the jest.mock call above
// every import, so the repository binds the mocked transport as it loads.
// eslint-disable-next-line import/first
import { realRepositories } from "@/data/real";

function queueRepo() {
  return realRepositories.queue;
}

const OK_PAYLOAD = {
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
};

describe("queue status — read", () => {
  it("requests the single contract endpoint with the appointment id", async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: OK_PAYLOAD });
    const repo = queueRepo();

    await repo.getStatus("a-1");

    // The Queue screen must consume ONLY this endpoint.
    expect(apiFetch).toHaveBeenCalledWith("/api/patients/me/queue-status?appointment_id=a-1");
  });

  it("URL-encodes the appointment id", async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: OK_PAYLOAD });
    const repo = queueRepo();

    await repo.getStatus("a 1/b");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/patients/me/queue-status?appointment_id=a%201%2Fb"
    );
  });

  it("maps a successful envelope into the domain model", async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: OK_PAYLOAD });
    const repo = queueRepo();

    const status = await repo.getStatus("a-1");

    expect(status.queueItemId).toBe("q-1");
    expect(status.peopleAhead).toBe(2);
    expect(status.phase).toBe("waiting");
    expect(status.estimatedWaitMinutes).toBe(30);
    expect(status.doctor?.fullName).toBe("Dr. Fatima Al-Said");
    expect(status.serverTime).toBe("2026-07-28T09:42:00.517Z");
  });

  it("surfaces not_checked_in so the UI can offer check-in", async () => {
    // Persistent (not ...Once): the two assertions below each invoke getStatus.
    apiFetch.mockRejectedValue(
      new ApiError(404, "…", { success: false, error: { code: "not_checked_in", message: "…" } })
    );
    const repo = queueRepo();

    await expect(repo.getStatus("a-1")).rejects.toBeInstanceOf(QueueUnavailableError);
    await expect(repo.getStatus("a-1")).rejects.toMatchObject({ reason: "not_checked_in" });
  });

  it("surfaces not_in_queue distinctly from not_checked_in", async () => {
    apiFetch.mockRejectedValue(
      new ApiError(404, "…", { success: false, error: { code: "not_in_queue", message: "…" } })
    );
    const repo = queueRepo();

    await expect(repo.getStatus("a-1")).rejects.toMatchObject({ reason: "not_in_queue" });
  });

  it("maps a transport failure to offline rather than a server error", async () => {
    // apiFetch signals "couldn't reach the server" as status 0.
    apiFetch.mockRejectedValue(new ApiError(0, "Couldn't reach the API server", { url: "…" }));
    const repo = queueRepo();

    await expect(repo.getStatus("a-1")).rejects.toMatchObject({ reason: "offline" });
  });

  it("maps a 403 to forbidden without leaking whether the appointment exists", async () => {
    apiFetch.mockRejectedValue(
      new ApiError(403, "…", { success: false, error: { code: "forbidden", message: "…" } })
    );
    const repo = queueRepo();

    await expect(repo.getStatus("someone-elses-appointment")).rejects.toMatchObject({
      reason: "forbidden",
    });
  });

  it("honours a 200 body that still reports failure", async () => {
    // Defensive: trust the envelope, not just the HTTP status.
    apiFetch.mockResolvedValueOnce({
      success: false,
      error: { code: "not_in_queue", message: "…" },
    });
    const repo = queueRepo();

    await expect(repo.getStatus("a-1")).rejects.toMatchObject({ reason: "not_in_queue" });
  });
});

describe("queue status — acknowledge", () => {
  it("POSTs the appointment id and kind to the acknowledge endpoint", async () => {
    apiFetch.mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        queue_item_id: "q-1",
        queue_status: "called",
        acknowledged_kind: "on_my_way",
        first_acknowledgement: true,
        acknowledged_at: "2026-07-28T09:44:12.881Z",
      },
    });
    const repo = queueRepo();

    await repo.acknowledge({ appointmentId: "a-1", kind: "on_my_way" });

    expect(apiFetch).toHaveBeenCalledWith("/api/patients/me/queue-status/acknowledge", {
      method: "POST",
      body: JSON.stringify({ appointment_id: "a-1", kind: "on_my_way" }),
    });
  });

  it("sends the 'seen' kind verbatim", async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { success: true } });
    const repo = queueRepo();

    await repo.acknowledge({ appointmentId: "a-1", kind: "seen" });

    expect(apiFetch.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ appointment_id: "a-1", kind: "seen" })
    );
  });

  it("throws when there is no active queue entry to acknowledge", async () => {
    apiFetch.mockRejectedValue(
      new ApiError(409, "…", {
        success: false,
        error: { code: "not_in_active_queue", message: "…" },
      })
    );
    const repo = queueRepo();

    // 409 has no status-based mapping, so it lands on server_error — the UI shows a
    // retryable failure, which is correct for a transient race with reception.
    await expect(
      repo.acknowledge({ appointmentId: "a-1", kind: "seen" })
    ).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it("does not swallow failures (the UI must not show a false confirmation)", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "…", null));
    const repo = queueRepo();

    await expect(repo.acknowledge({ appointmentId: "a-1", kind: "on_my_way" })).rejects.toThrow();
  });
});
