/**
 * INTEGRATION — Book Appointment flow (critical flow #2).
 *
 * Covers the real repository logic that sits between a screen and the atomic
 * booking RPC. Two behaviours matter and neither is obvious:
 *
 *  1. `book_appointment_atomic` does NOT throw on business failures — it resolves
 *     with `{ success: false, error: <CODE> }`. Anything that treats a resolved
 *     promise as success would show "booked!" for a slot that was never taken.
 *  2. A non-UUID `forFamilyMemberId` is dropped rather than forwarded, because the
 *     RPC would reject the whole booking on a malformed uuid.
 */

// Mock only the shared Supabase/RPC layer; the repository logic under test is real.
jest.mock("@medilink/shared/mobile", () => {
  const actual = jest.requireActual("@medilink/shared/mobile");
  return {
    ...actual,
    api: {
      ...actual.api,
      appointments: {
        ...actual.api.appointments,
        bookAppointment: jest.fn(),
        cancelAppointment: jest.fn(),
        checkInAppointment: jest.fn(),
      },
      profile: {
        ...actual.api.profile,
        getMyProfile: jest.fn(),
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require("@medilink/shared/mobile") as {
  api: {
    appointments: {
      bookAppointment: jest.Mock;
      cancelAppointment: jest.Mock;
      checkInAppointment: jest.Mock;
    };
    profile: { getMyProfile: jest.Mock };
  };
};

// eslint-disable-next-line import/first
import { realRepositories } from "@/data/real";

const repo = realRepositories.appointment;

const VALID_INPUT = {
  doctorId: "11111111-1111-4111-8111-111111111111",
  facilityId: "22222222-2222-4222-8222-222222222222",
  slotDate: "2026-08-01",
  slotStart: "10:00",
  type: "in_person" as const,
};

describe("book appointment", () => {
  it("returns the new appointment id and reference on success", async () => {
    api.appointments.bookAppointment.mockResolvedValueOnce({
      success: true,
      appointment_id: "a-99",
      reference_number: "HAMS-ABC123",
    });

    const booked = await repo.create(VALID_INPUT);

    expect(booked).toEqual({ id: "a-99", reference: "HAMS-ABC123" });
  });

  it("throws with the backend error CODE when the RPC reports a business failure", async () => {
    // The RPC resolves (does not throw) on failure — this is the trap.
    api.appointments.bookAppointment.mockResolvedValueOnce({
      success: false,
      error: "SLOT_TAKEN",
    });

    await expect(repo.create(VALID_INPUT)).rejects.toThrow("SLOT_TAKEN");
  });

  it.each([
    ["outside the booking window", "OUTSIDE_BOOKING_WINDOW"],
    ["a double booking", "ALREADY_BOOKED"],
    ["an unavailable doctor", "DOCTOR_UNAVAILABLE"],
  ])("surfaces %s to the caller", async (_label, code) => {
    api.appointments.bookAppointment.mockResolvedValueOnce({ success: false, error: code });
    await expect(repo.create(VALID_INPUT)).rejects.toThrow(code);
  });

  it("throws when the RPC succeeds but returns no appointment id", async () => {
    // Better a visible error than navigating to a success screen with no booking.
    api.appointments.bookAppointment.mockResolvedValueOnce({ success: true });

    await expect(repo.create(VALID_INPUT)).rejects.toThrow(/appointment id/i);
  });

  it("forwards a valid family-member uuid (booking for a dependent)", async () => {
    api.appointments.bookAppointment.mockResolvedValueOnce({
      success: true,
      appointment_id: "a-1",
    });
    const familyId = "33333333-3333-4333-8333-333333333333";

    await repo.create({ ...VALID_INPUT, forFamilyMemberId: familyId });

    expect(api.appointments.bookAppointment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forFamilyMemberId: familyId })
    );
  });

  it("drops a non-uuid family-member id instead of failing the whole booking", async () => {
    api.appointments.bookAppointment.mockResolvedValueOnce({
      success: true,
      appointment_id: "a-1",
    });

    await repo.create({ ...VALID_INPUT, forFamilyMemberId: "self" });

    expect(api.appointments.bookAppointment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forFamilyMemberId: undefined })
    );
  });

  it("normalises an absent reason to null", async () => {
    api.appointments.bookAppointment.mockResolvedValueOnce({
      success: true,
      appointment_id: "a-1",
    });

    await repo.create(VALID_INPUT);

    expect(api.appointments.bookAppointment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: null })
    );
  });

  it("wraps a transport/RLS throw in an Error with a readable message", async () => {
    api.appointments.bookAppointment.mockRejectedValueOnce({
      message: "permission denied",
      code: "42501",
    });

    await expect(repo.create(VALID_INPUT)).rejects.toThrow(/permission denied/);
  });
});

describe("cancel appointment", () => {
  it("resolves when the RPC reports success", async () => {
    api.appointments.cancelAppointment.mockResolvedValueOnce({ success: true });
    await expect(repo.cancel("a-1", "Feeling better")).resolves.toBeUndefined();
  });

  it("throws the backend reason when cancellation is refused", async () => {
    // e.g. past the cutoff — the patient must not see a false "cancelled".
    api.appointments.cancelAppointment.mockResolvedValueOnce({
      success: false,
      error: "Too late to cancel",
    });

    await expect(repo.cancel("a-1")).rejects.toThrow("Too late to cancel");
  });
});

describe("check-in", () => {
  it("sends the patient's name and phone from their profile", async () => {
    // checkin_my_appointment requires both for the denormalised queue row.
    api.profile.getMyProfile.mockResolvedValueOnce({
      account: { full_name: "Aisha Al Harthy", phone: "91111111" },
    });
    api.appointments.checkInAppointment.mockResolvedValueOnce({ already_checked_in: false });

    await repo.checkIn("a-1");

    expect(api.appointments.checkInAppointment).toHaveBeenCalledWith(expect.anything(), {
      appointmentId: "a-1",
      patientName: "Aisha Al Harthy",
      patientPhone: "91111111",
    });
  });

  it("falls back to empty strings when the profile has no name or phone", async () => {
    api.profile.getMyProfile.mockResolvedValueOnce({ account: {} });
    api.appointments.checkInAppointment.mockResolvedValueOnce({});

    await repo.checkIn("a-1");

    expect(api.appointments.checkInAppointment).toHaveBeenCalledWith(expect.anything(), {
      appointmentId: "a-1",
      patientName: "",
      patientPhone: "",
    });
  });

  it("throws with the backend reason when check-in is rejected", async () => {
    api.profile.getMyProfile.mockResolvedValueOnce({ account: { full_name: "A", phone: "9" } });
    api.appointments.checkInAppointment.mockRejectedValueOnce({
      message: "invalid_status:pending",
    });

    await expect(repo.checkIn("a-1")).rejects.toThrow(/invalid_status:pending/);
  });
});
