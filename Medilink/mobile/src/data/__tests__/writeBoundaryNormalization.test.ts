/**
 * The write boundary normalizes, not just the forms.
 *
 * These tests bypass every screen and Zod schema and call `shared/src/api/*` directly with
 * padded payloads — which is exactly what a direct API call, a future screen that forgets
 * to trim, or the web app would do. Before this change these calls persisted
 * `"    Satyam    "` verbatim, because all the trimming lived in the UI.
 *
 * Supabase is faked with the smallest chainable stub that records what would have been
 * written, so the assertion is on the actual payload rather than on a mock of our own
 * normalizer.
 */
import { api } from "@medilink/shared/mobile";

/** Captures the object handed to insert/update/upsert. */
interface Captured {
  table: string | null;
  payload: Record<string, unknown> | null;
  rpc: { name: string; args: Record<string, unknown> } | null;
}

function makeDb() {
  const captured: Captured = { table: null, payload: null, rpc: null };

  // Every query-builder method returns `this`, and the terminal ones resolve. Only the
  // shapes shared/src/api actually calls are implemented.
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ["select", "eq", "is", "order", "limit", "not", "ilike", "range", "in"]) {
    builder[m] = chain;
  }
  builder.single = () => Promise.resolve({ data: { id: "row-1" }, error: null });
  builder.maybeSingle = () => Promise.resolve({ data: { id: "row-1" }, error: null });
  builder.insert = (payload: Record<string, unknown>) => {
    captured.payload = payload;
    return builder;
  };
  builder.update = (payload: Record<string, unknown>) => {
    captured.payload = payload;
    return builder;
  };
  builder.upsert = (payload: Record<string, unknown>) => {
    captured.payload = payload;
    return builder;
  };

  const db = {
    from: (table: string) => {
      captured.table = table;
      return builder;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      captured.rpc = { name, args };
      return Promise.resolve({ data: { success: true, appointment_id: "a-1" }, error: null });
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "user-1" } } }, error: null }),
    },
  };

  return { db, captured };
}

/** `getMyPatientProfileId` reads patient_profiles first; the stub above satisfies it. */
type AnyDb = Parameters<typeof api.family.addFamilyMember>[0];

describe("family.addFamilyMember", () => {
  it("normalizes a padded name instead of storing it", async () => {
    const { db, captured } = makeDb();
    await api.family.addFamilyMember(db as unknown as AnyDb, {
      full_name: "    Satyam    ",
      relation: "spouse",
    });
    expect(captured.table).toBe("family_members");
    expect(captured.payload?.full_name).toBe("Satyam");
  });

  it("collapses accidental internal runs but keeps real words apart", async () => {
    const { db, captured } = makeDb();
    await api.family.addFamilyMember(db as unknown as AnyDb, {
      full_name: "  Satyam    Kumar  ",
      relation: "spouse",
    });
    expect(captured.payload?.full_name).toBe("Satyam Kumar");
  });

  it("rejects a whitespace-only name rather than writing padding", async () => {
    const { db } = makeDb();
    await expect(
      api.family.addFamilyMember(db as unknown as AnyDb, {
        full_name: "     ",
        relation: "spouse",
      })
    ).rejects.toThrow(/at least 2 characters/i);
  });

  it("keeps a valid Arabic name intact", async () => {
    const { db, captured } = makeDb();
    await api.family.addFamilyMember(db as unknown as AnyDb, {
      full_name: "  عائشة الحارثي  ",
      relation: "spouse",
    });
    expect(captured.payload?.full_name).toBe("عائشة الحارثي");
  });
});

describe("profile.updateMyProfile", () => {
  it("normalizes the account name and nulls a padded-empty optional field", async () => {
    const { db, captured } = makeDb();
    await api.profile.updateMyProfile(db as unknown as AnyDb, {
      full_name: "   Satyam Kumar   ",
      address: "    ",
    });
    // `profiles` is written first; the last capture is the patient_profiles patch.
    expect(captured.payload?.address).toBeNull();
  });

  it("refuses to blank a required name via padding", async () => {
    const { db } = makeDb();
    await expect(
      api.profile.updateMyProfile(db as unknown as AnyDb, { full_name: "   " })
    ).rejects.toThrow(/cannot be empty/i);
  });
});

describe("records.upsertMedicalHistory", () => {
  it("drops whitespace-only list entries and de-duplicates what trimming reveals", async () => {
    const { db, captured } = makeDb();
    await api.records.upsertMedicalHistory(db as unknown as AnyDb, {
      allergies: ["  Penicillin  ", "Penicillin", "   ", "Aspirin"],
    });
    expect(captured.payload?.allergies).toEqual(["Penicillin", "Aspirin"]);
  });

  it("keeps newlines in clinical notes but strips padding", async () => {
    const { db, captured } = makeDb();
    await api.records.upsertMedicalHistory(db as unknown as AnyDb, {
      notes: "  asthma  \n  since 2019  ",
    });
    expect(captured.payload?.notes).toBe("asthma\nsince 2019");
  });

  it("stores a whitespace-only note as null, not as spaces", async () => {
    const { db, captured } = makeDb();
    await api.records.upsertMedicalHistory(db as unknown as AnyDb, { notes: "    " });
    expect(captured.payload?.notes).toBeNull();
  });
});

describe("records.addDocument", () => {
  it("normalizes the title and rejects a blank one", async () => {
    const { db, captured } = makeDb();
    await api.records.addDocument(db as unknown as AnyDb, {
      name: "   Blood Test   ",
      type: "report",
      file_url: "user-1/123.pdf",
      file_type: "application/pdf",
    });
    expect(captured.payload?.name).toBe("Blood Test");

    const second = makeDb();
    await expect(
      api.records.addDocument(second.db as unknown as AnyDb, {
        name: "   ",
        type: "report",
        file_url: "user-1/123.pdf",
        file_type: "application/pdf",
      })
    ).rejects.toThrow(/cannot be empty/i);
  });
});

describe("appointments.bookAppointment", () => {
  it("passes a normalized reason and turns a blank one into undefined", async () => {
    const { db, captured } = makeDb();
    await api.appointments.bookAppointment(db as unknown as AnyDb, {
      doctorId: "d-1",
      facilityId: "f-1",
      slotDate: "2026-08-10",
      slotStart: "10:00",
      type: "in_person",
      reason: "   chest pain   ",
    });
    expect(captured.rpc?.args.p_reason).toBe("chest pain");

    const second = makeDb();
    await api.appointments.bookAppointment(second.db as unknown as AnyDb, {
      doctorId: "d-1",
      facilityId: "f-1",
      slotDate: "2026-08-10",
      slotStart: "10:00",
      type: "in_person",
      reason: "     ",
    });
    expect(second.captured.rpc?.args.p_reason).toBeUndefined();
  });
});

describe("reviews.createReview", () => {
  it("normalizes review prose and nulls a whitespace-only body", async () => {
    const { db, captured } = makeDb();
    await api.reviews.createReview(db as unknown as AnyDb, {
      targetType: "doctor",
      targetId: "d-1",
      rating: 5,
      reviewText: "   Very helpful   ",
    });
    expect(captured.payload?.review_text).toBe("Very helpful");

    const second = makeDb();
    await api.reviews.createReview(second.db as unknown as AnyDb, {
      targetType: "doctor",
      targetId: "d-1",
      rating: 5,
      reviewText: "    ",
    });
    expect(second.captured.payload?.review_text).toBeNull();
  });
});
