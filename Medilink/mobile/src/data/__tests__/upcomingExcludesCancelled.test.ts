/**
 * The "upcoming" appointment list must exclude appointments that have already ENDED.
 *
 * QA bug: after a patient successfully cancelled an appointment, the mobile Dashboard
 * Home "Upcoming Appointment" card kept rendering it. The dashboard reads
 * `repositories.appointment.listUpcoming()` → `api.appointments.listMyAppointments(db,
 * "upcoming")`, and that query filtered on `slot_date >= today` ONLY. A cancelled visit
 * booked for next week still satisfies a date-only filter, so it stayed in the list and
 * the card showed it. React Query invalidation was never the problem — it refetched
 * correctly and got the cancelled row back from the server.
 *
 * The mock data layer already filtered on status (`UPCOMING_STATUSES` in
 * `src/data/mock/index.ts`), which is why this only ever reproduced against a real
 * backend. These tests pin the real query to that same contract.
 *
 * Supabase is faked with the same minimal chainable stub the other data-layer tests use,
 * so the assertion is on the filters actually sent rather than on a mock of our own code.
 */
import { api } from "@medilink/shared/mobile";

interface Filter {
  method: string;
  args: unknown[];
}

function makeDb() {
  const filters: Filter[] = [];
  let table: string | null = null;

  const builder: Record<string, unknown> = {};
  // Record the filter chain; every builder method returns `this` so the chain continues.
  for (const m of ["select", "eq", "gte", "lt", "not", "in", "order", "limit", "range", "is"]) {
    builder[m] = (...args: unknown[]) => {
      filters.push({ method: m, args });
      return builder;
    };
  }
  // `listMyAppointments` awaits the builder itself (no .single()), so it must be thenable.
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  builder.maybeSingle = () => Promise.resolve({ data: { id: "patient-1" }, error: null });
  builder.single = () => Promise.resolve({ data: { id: "patient-1" }, error: null });

  const db = {
    from: (t: string) => {
      // getMyPatientProfileId hits patient_profiles first; only record the appointments read.
      table = t;
      if (t === "appointments") filters.length = 0;
      return builder;
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "user-1" } } }, error: null }),
    },
  };

  return { db, filters, lastTable: () => table };
}

type AnyDb = Parameters<typeof api.appointments.listMyAppointments>[0];

/** The `.not("status","in","(...)")` call, if the query applied one. */
function statusExclusion(filters: Filter[]): string | null {
  const f = filters.find((x) => x.method === "not" && x.args[0] === "status");
  return f ? String(f.args[2]) : null;
}

describe("listMyAppointments — upcoming excludes ended appointments", () => {
  it("filters out cancelled, completed and no_show for the upcoming tab", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "upcoming");

    const excluded = statusExclusion(filters);
    expect(excluded).not.toBeNull();
    expect(excluded).toContain("cancelled");
    expect(excluded).toContain("completed");
    expect(excluded).toContain("no_show");
  });

  it("still constrains upcoming to future dates (the status filter is additive)", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "upcoming");

    expect(filters.some((f) => f.method === "gte" && f.args[0] === "slot_date")).toBe(true);
  });

  it("keeps active statuses — the exclusion never names pending/confirmed/checked_in", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "upcoming");

    const excluded = statusExclusion(filters) ?? "";
    for (const active of ["pending", "confirmed", "checked_in"]) {
      expect(excluded).not.toContain(active);
    }
  });

  it("does not drop `approved`, which the appointments UI treats as confirmed", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "upcoming");

    expect(statusExclusion(filters) ?? "").not.toContain("approved");
  });

  /**
   * CONTRACT CHANGE (Upcoming/Past lifecycle fix).
   *
   * The `past` tab used to filter `slot_date < today`. That was replaced by the shared
   * `isUpcomingAppointment` rule applied to the returned rows, because the SQL filter
   * silently dropped two real cases:
   *
   *   • an appointment EARLIER TODAY that has already finished — `slot_date < today` is
   *     false, so it appeared in neither tab;
   *   • a CANCELLED appointment booked for next week — excluded from `upcoming` by status
   *     and from `past` by date, so it also appeared in neither tab.
   *
   * PostgREST cannot express the wall-clock half of the rule (slot_end + grace, in
   * Asia/Muscat), and encoding half of it in SQL is exactly how the dashboard and the
   * appointments screen drifted into two different answers. So `past` now applies no date
   * filter and the shared rule decides.
   */
  it("applies NO date filter to the past tab — the shared lifecycle rule decides", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "past");

    expect(statusExclusion(filters)).toBeNull();
    expect(filters.some((f) => f.method === "lt" && f.args[0] === "slot_date")).toBe(false);
    expect(filters.some((f) => f.method === "gte" && f.args[0] === "slot_date")).toBe(false);
  });

  it("leaves the all tab unfiltered — the Appointments screen splits it client-side", async () => {
    const { db, filters } = makeDb();
    await api.appointments.listMyAppointments(db as unknown as AnyDb, "all");

    expect(statusExclusion(filters)).toBeNull();
    expect(filters.some((f) => f.method === "gte" || f.method === "lt")).toBe(false);
  });
});
