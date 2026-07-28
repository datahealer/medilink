import type { QueueStatus } from "@/data/types";

import { NON_RETRYABLE_REASONS, pollInterval, shouldRetryQueue } from "../queuePolling";

/**
 * Polling is the correctness floor behind realtime. If these intervals regress,
 * the Live Queue screen goes stale without any visible error — the worst kind of
 * failure for a patient deciding when to walk to the consultation room.
 */
function status(over: Partial<QueueStatus> = {}): QueueStatus {
  return {
    queueItemId: "q-1",
    position: 7,
    peopleAhead: 8,
    nowServingPosition: 5,
    status: "waiting",
    phase: "waiting",
    isCheckedIn: true,
    checkedInAt: null,
    calledAt: null,
    doneAt: null,
    acknowledgedAt: null,
    acknowledgedKind: null,
    isWalkin: false,
    isOnline: true,
    estimatedWaitMinutes: 120,
    avgConsultationMinutes: 15,
    appointment: {
      id: "a-1",
      referenceNumber: null,
      slotDate: null,
      slotStart: null,
      slotEnd: null,
      status: null,
      type: null,
    },
    doctor: null,
    facility: { id: "f-1", name: "Clinic" },
    serverTime: "2026-07-28T09:00:00.000Z",
    ...over,
  };
}

describe("pollInterval", () => {
  it("polls every 30s before any data has arrived", () => {
    expect(pollInterval(undefined)).toBe(30_000);
  });

  it("stops polling entirely once done", () => {
    // A terminal state never changes again; continuing would drain battery and
    // quota indefinitely.
    expect(pollInterval(status({ phase: "done" }))).toBe(false);
  });

  it("polls fastest while called", () => {
    expect(pollInterval(status({ phase: "called", peopleAhead: 0 }))).toBe(10_000);
  });

  it("tightens to 10s within 2 patients of the front", () => {
    expect(pollInterval(status({ peopleAhead: 0 }))).toBe(10_000);
    expect(pollInterval(status({ peopleAhead: 2 }))).toBe(10_000);
  });

  it("uses 30s for 3–5 ahead", () => {
    expect(pollInterval(status({ peopleAhead: 3 }))).toBe(30_000);
    expect(pollInterval(status({ peopleAhead: 5 }))).toBe(30_000);
  });

  it("relaxes to 60s when far back in the queue", () => {
    expect(pollInterval(status({ peopleAhead: 6 }))).toBe(60_000);
    expect(pollInterval(status({ peopleAhead: 40 }))).toBe(60_000);
  });

  it("never returns an interval faster than 10s", () => {
    // Guards against a future edit turning this into a request storm.
    for (const ahead of [0, 1, 2, 3, 5, 6, 100]) {
      const ms = pollInterval(status({ peopleAhead: ahead }));
      if (ms !== false) expect(ms).toBeGreaterThanOrEqual(10_000);
    }
  });

  it("is monotonic — never polls slower as the patient gets closer", () => {
    const intervals = [40, 6, 5, 3, 2, 1, 0].map((peopleAhead) => {
      const ms = pollInterval(status({ peopleAhead }));
      return ms === false ? Number.POSITIVE_INFINITY : ms;
    });
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeLessThanOrEqual(intervals[i - 1] as number);
    }
  });
});

describe("shouldRetryQueue", () => {
  it("does not retry a legitimate terminal answer", () => {
    // Retrying these burns requests and can never succeed.
    for (const reason of NON_RETRYABLE_REASONS) {
      expect(shouldRetryQueue(0, reason)).toBe(false);
    }
  });

  it("retries transient failures up to twice", () => {
    expect(shouldRetryQueue(0, "server_error")).toBe(true);
    expect(shouldRetryQueue(1, "server_error")).toBe(true);
    expect(shouldRetryQueue(2, "server_error")).toBe(false);
  });

  it("retries an offline failure (connectivity may return)", () => {
    expect(shouldRetryQueue(0, "offline")).toBe(true);
  });

  it("retries when the reason is unknown", () => {
    expect(shouldRetryQueue(0, undefined)).toBe(true);
    expect(shouldRetryQueue(2, undefined)).toBe(false);
  });
});
