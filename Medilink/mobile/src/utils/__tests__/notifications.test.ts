import {
  classifyNotification,
  routeForNotification,
  routeForNotificationData,
} from "../notifications";

/**
 * Notification routing decides where a tapped push lands. A wrong destination is a
 * user-visible defect that only ever reproduces on a real device with a real push,
 * which is exactly why it is worth covering here instead of by hand.
 *
 * HAMS owns the push payload (queue contract §3.3); this only classifies whatever
 * it sends, so the tests double as documentation of the payload contract.
 */
describe("classifyNotification", () => {
  it("prefers the explicit data.kind over the DB type column", () => {
    // `type` is constrained to info|warning|error, so `data.kind` is the real signal.
    expect(classifyNotification("info", { kind: "payment" })).toBe("payment");
  });

  it("classifies queue events ahead of the generic appointment match", () => {
    // Ordering matters: "queue_called" also contains no appointment keyword, but a
    // payload like "appointment_queue_called" must still route to the queue.
    expect(classifyNotification(null, { kind: "queue_called" })).toBe("queue");
    expect(classifyNotification("queue_next", null)).toBe("queue");
    expect(classifyNotification(null, { kind: "appointment_queue_called" })).toBe("queue");
  });

  it("classifies appointment lifecycle events", () => {
    for (const kind of [
      "appointment_confirmed",
      "booking_created",
      "reminder_24h",
      "rescheduled",
      "cancelled",
      "checkin_open",
      "check_in",
      "waitlist_offer",
    ]) {
      expect(classifyNotification(null, { kind })).toBe("appointment");
    }
  });

  it("classifies payment, lab, prescription and facility events", () => {
    expect(classifyNotification(null, { kind: "payment_success" })).toBe("payment");
    expect(classifyNotification(null, { kind: "invoice_ready" })).toBe("payment");
    expect(classifyNotification(null, { kind: "refund_issued" })).toBe("payment");
    expect(classifyNotification(null, { kind: "lab_result" })).toBe("lab");
    expect(classifyNotification(null, { kind: "prescription_ready" })).toBe("prescription");
    expect(classifyNotification(null, { kind: "facility_message" })).toBe("facility");
  });

  it("infers appointment from a legacy payload that only carries an id", () => {
    expect(classifyNotification(null, { appointment_id: "abc" })).toBe("appointment");
  });

  it("falls back to general for anything unrecognised", () => {
    // Never guess a destination — the notifications list is always safe.
    expect(classifyNotification(null, null)).toBe("general");
    expect(classifyNotification("something_new", {})).toBe("general");
    expect(classifyNotification(undefined, undefined)).toBe("general");
  });

  it("is case-insensitive", () => {
    expect(classifyNotification("PAYMENT_SUCCESS", null)).toBe("payment");
  });
});

describe("routeForNotification", () => {
  it("deep-links queue events to the live queue screen", () => {
    expect(routeForNotification("queue", "appt-1")).toBe("/appointments/appt-1/queue");
  });

  it("falls back to the list when a queue event carries no appointment id", () => {
    // There is no queue to show without an appointment — never build a broken path.
    expect(routeForNotification("queue", null)).toBe("/appointments");
    expect(routeForNotification("queue")).toBe("/appointments");
  });

  it("routes appointment events to the detail screen when an id is present", () => {
    expect(routeForNotification("appointment", "appt-1")).toBe("/appointments/appt-1");
    expect(routeForNotification("appointment", null)).toBe("/appointments");
  });

  it("routes payments to the appointment when known, else the payments list", () => {
    expect(routeForNotification("payment", "appt-1")).toBe("/appointments/appt-1");
    expect(routeForNotification("payment", null)).toBe("/payments");
  });

  it("routes record-type events to their sections", () => {
    expect(routeForNotification("lab")).toBe("/records/labs");
    expect(routeForNotification("prescription")).toBe("/records/prescriptions");
    expect(routeForNotification("assistant")).toBe("/ai/insights");
    expect(routeForNotification("facility")).toBe("/notifications/messages");
    expect(routeForNotification("general")).toBe("/notifications");
  });
});

describe("routeForNotificationData", () => {
  it("honours an explicit relative data.url above all inference", () => {
    // Lets HAMS aim a push at any screen without a client release.
    expect(routeForNotificationData({ url: "/appointments/x/queue" })).toBe("/appointments/x/queue");
  });

  it("ignores a non-relative url and falls back to inference", () => {
    // An absolute URL would be an open-redirect style navigation into the app.
    expect(routeForNotificationData({ url: "https://evil.example.com", kind: "payment" })).toBe("/payments");
    expect(routeForNotificationData({ url: "javascript:alert(1)", kind: "lab" })).toBe("/records/labs");
  });

  it("derives the queue route from kind + appointment_id", () => {
    expect(routeForNotificationData({ kind: "queue_called", appointment_id: "a1" })).toBe(
      "/appointments/a1/queue"
    );
  });

  it("returns the notifications screen for an empty payload", () => {
    expect(routeForNotificationData(undefined)).toBe("/notifications");
    expect(routeForNotificationData({})).toBe("/notifications");
  });
});
