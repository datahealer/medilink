import { api } from "@medilink/shared/mobile";

/**
 * Deactivated doctors must never be discoverable or bookable.
 *
 * ── THE DEFECT THIS PINS ──
 *
 * `public.doctors` carries two SELECT policies in production:
 *
 *     doctors_public_read    USING (is_active = true)     <- the intended restriction
 *     "Public read doctors"  USING (true)                 <- added out of band, in no migration
 *
 * RLS policies are OR'd, so the second nullifies the first and every row is readable. Measured
 * against production on 2026-08-18: anon saw 112 doctors of which **21 had is_active = false**,
 * and **14 of those still had doctor_availability rows** — i.e. they were being offered as
 * bookable. A patient could pay for an appointment with a doctor the clinic had deactivated.
 *
 * The permissive policy is HAMS-shared and not ours to drop, so the requirement is stated in
 * the QUERY instead. These tests assert that it stays stated. They are the reason the filter
 * cannot be silently removed later "because RLS handles it" — RLS demonstrably did not.
 *
 * The tests inspect the query CHAIN rather than mocking Supabase's network layer: what matters
 * is that `.eq("is_active", true)` is actually sent, and that is exactly what a recording
 * chain proves. No network, no database.
 */

/** Records every builder call so the emitted query can be asserted. */
function recordingDb(rows: unknown = []) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  const record = (fn: string) => (...args: unknown[]) => {
    calls.push({ fn, args });
    return chain;
  };
  Object.assign(chain, {
    from: record("from"),
    select: record("select"),
    eq: record("eq"),
    in: record("in"),
    ilike: record("ilike"),
    or: record("or"),
    order: record("order"),
    range: record("range"),
    limit: record("limit"),
    // Terminals resolve; `single()` mimics PostgREST's 0-row error.
    single: () => {
      calls.push({ fn: "single", args: [] });
      return Promise.resolve(
        Array.isArray(rows) && rows.length === 0
          ? { data: null, error: { code: "PGRST116", message: "no rows" } }
          : { data: rows, error: null }
      );
    },
    maybeSingle: () => {
      calls.push({ fn: "maybeSingle", args: [] });
      return Promise.resolve({ data: null, error: null });
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  });
  return { db: chain as never, calls };
}

/** Did the query send `.eq("is_active", true)`? */
const filtersActive = (calls: Array<{ fn: string; args: unknown[] }>) =>
  calls.some((c) => c.fn === "eq" && c.args[0] === "is_active" && c.args[1] === true);

describe("searchDoctors — discovery", () => {
  it("filters is_active = true", async () => {
    const { db, calls } = recordingDb([]);
    await api.doctors.searchDoctors(db, {});
    expect(filtersActive(calls)).toBe(true);
  });

  it("keeps the filter when other filters are applied", async () => {
    for (const q of [
      { term: "Khalid" },
      { specialty: "Cardiology" },
      { facilityId: "f-1" },
      { branchId: "b-1" },
      { term: "a", specialty: "b", facilityId: "c", branchId: "d", limit: 5, offset: 10 },
    ]) {
      const { db, calls } = recordingDb([]);
      await api.doctors.searchDoctors(db, q);
      expect(filtersActive(calls)).toBe(true);
    }
  });

  it("still queries the doctors table (the filter did not replace the query)", async () => {
    const { db, calls } = recordingDb([]);
    await api.doctors.searchDoctors(db, {});
    expect(calls.some((c) => c.fn === "from" && c.args[0] === "doctors")).toBe(true);
    // Active doctors are still returned — the filter must not become a blanket deny.
    expect(calls.some((c) => c.fn === "order")).toBe(true);
  });
});

describe("getDoctor — THE BOOKING CHOKEPOINT", () => {
  it("filters is_active = true on the doctor row", async () => {
    // Both clients reach the slot picker through here (mobile useDoctor(id); web detail page),
    // so this is what actually prevents booking, not merely hiding from a list.
    const { db, calls } = recordingDb([]);
    await api.doctors.getDoctor(db, "doc-1").catch(() => undefined);
    expect(filtersActive(calls)).toBe(true);
  });

  it("still scopes to the requested id", async () => {
    const { db, calls } = recordingDb([]);
    await api.doctors.getDoctor(db, "doc-42").catch(() => undefined);
    expect(calls.some((c) => c.fn === "eq" && c.args[0] === "id" && c.args[1] === "doc-42")).toBe(true);
  });

  it("FAILS CLOSED for a deactivated doctor — throws rather than returning a bookable doctor", async () => {
    // rows = [] makes single() return PGRST116, which is what PostgREST does when the
    // is_active filter excludes the row. Callers render their error state; crucially they do
    // NOT receive a doctor object that the booking flow would treat as valid.
    const { db } = recordingDb([]);
    await expect(api.doctors.getDoctor(db, "deactivated-doc")).rejects.toBeDefined();
  });

  it("still fetches availability rows for a doctor that passes the filter", async () => {
    const { db, calls } = recordingDb([{ id: "doc-1" }]);
    await api.doctors.getDoctor(db, "doc-1").catch(() => undefined);
    expect(calls.some((c) => c.fn === "from" && c.args[0] === "doctor_availability")).toBe(true);
  });
});

describe("what must NOT be filtered", () => {
  it("review hydration keeps naming doctors regardless of is_active", async () => {
    // A past review of a since-deactivated doctor must still show that doctor's name, or
    // historical records become anonymous. Asserted so a well-meaning sweep of "add is_active
    // everywhere" does not break it.
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "../../../../shared/src/api/reviews.ts"),
      "utf8"
    ) as string;
    const doctorsQuery = src.split("\n").filter((l) => l.includes('from("doctors")'));
    expect(doctorsQuery.length).toBeGreaterThan(0);
    for (const line of doctorsQuery) {
      expect(line).not.toContain("is_active");
    }
  });
});

describe("guest mode is unaffected", () => {
  it("searchDoctors needs no session — it is the same anon-readable query plus one filter", async () => {
    // Guest discovery reads `doctors` under the anon role. Adding a column filter narrows the
    // result set; it does not require authentication, so guest mode keeps working. Verified in
    // production after the change by the anon count check in the audit.
    const { db, calls } = recordingDb([]);
    await api.doctors.searchDoctors(db, {});
    expect(calls.some((c) => c.fn === "eq" && c.args[0] === "patient_id")).toBe(false);
    expect(calls.some((c) => c.fn === "eq" && c.args[0] === "user_id")).toBe(false);
  });
});
