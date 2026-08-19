import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * GET /api/patients/[id]/medical-history/pdf — who may render a patient's medical history.
 *
 * ── THE TWO DEFECTS THIS PINS ──
 *
 * 1. THE ROUTE let staff read any patient. `patient` and `technician` were scoped, but `doctor`,
 *    `facility_admin` and `super_admin` fell straight through to the Edge Function invoke with
 *    whatever `patient_id` was in the URL. Any doctor could pull the complete medical history of
 *    any patient in the system, including patients they had never treated.
 *
 * 2. THE EDGE FUNCTION had no caller check at all, so the route could be skipped entirely (see
 *    lib/security/__tests__/reportFunctionAuth.test.ts). The route must therefore present the
 *    service-role credential, which is asserted here — if it stops doing so, report generation
 *    breaks closed rather than silently reverting to an unauthenticated function.
 *
 * `super_admin` remains intentionally unscoped: it is a global role by design. That is asserted
 * too, so the distinction is deliberate rather than an oversight someone later "fixes".
 */

const PATIENT_PROFILE_ID = "aaaa1111-2222-4333-8444-555566667777";
const OTHER_PATIENT_ID = "bbbb2222-3333-4444-8555-666677778888";
const USER_ID = "11111111-2222-4333-8444-555566667777";
const DOCTOR_ROW_ID = "cccc3333-4444-4555-8666-777788889999";
const FACILITY_A = "dddd4444-5555-4666-8777-888899990000";
const FACILITY_B = "eeee5555-6666-4777-8888-99990000aaaa";
const SERVICE_KEY = "service-role-key-fixture";

interface Scenario {
  role: string | null;
  /** patient_profiles row visible for (id, user_id) — patient self-ownership. */
  ownsPatientProfile?: boolean;
  /** doctors row for this user. */
  doctorRow?: boolean;
  /** appointments row linking the requested patient to this doctor. */
  doctorTreatedPatient?: boolean;
  /** live facility_admins grants for this user. */
  facilityGrants?: string[];
  /** facilities (from appointments) the requested patient actually attended. */
  patientFacilities?: string[];
  /** technicians row facility, and whether a lab_result links patient+facility. */
  technicianFacility?: string | null;
  technicianHasResult?: boolean;
  invokeFails?: boolean;
}

interface Recorder {
  invoked: Array<{ name: string; body: unknown; authorization: string | undefined }>;
}

function install(s: Scenario): Recorder {
  const rec: Recorder = { invoked: [] };

  // ── The caller's own RLS-scoped client ──
  mock.module("@/lib/supabase/api", {
    namedExports: {
      createApiSupabaseClient: async () => ({
        from(table: string) {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          Object.assign(chain, {
            select: () => chain,
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            is: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            in: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            limit: () => chain,
            maybeSingle: async () => {
              if (table === "profiles") {
                return { data: s.role ? { role: s.role } : null, error: null };
              }
              if (table === "patient_profiles") {
                // Ownership: the row exists only when this user owns that patient profile.
                const ok = s.ownsPatientProfile && filters.id === PATIENT_PROFILE_ID;
                return { data: ok ? { id: PATIENT_PROFILE_ID } : null, error: null };
              }
              if (table === "doctors") {
                return { data: s.doctorRow ? { id: DOCTOR_ROW_ID } : null, error: null };
              }
              if (table === "technicians") {
                return {
                  data: s.technicianFacility ? { facility_id: s.technicianFacility } : null,
                  error: null,
                };
              }
              if (table === "lab_results") {
                return { data: s.technicianHasResult ? { id: "lab" } : null, error: null };
              }
              return { data: null, error: null };
            },
            // facility_admins is read as a LIST (no maybeSingle), so it must be awaitable.
            then: (resolve: (v: unknown) => unknown) =>
              resolve({
                data: (s.facilityGrants ?? []).map((facility_id) => ({ facility_id })),
                error: null,
              }),
          });
          return chain;
        },
      }),
    },
  });

  mock.module("@/lib/auth/api", {
    namedExports: { getAal2UserOrThrow: async () => ({ id: USER_ID }) },
  });

  mock.module("@/lib/env", {
    namedExports: {
      env: {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      },
    },
  });

  // ── The service client: appointment existence checks + the function invoke ──
  mock.module("@/lib/supabase/service", {
    namedExports: {
      createServiceSupabase: () => ({
        from(table: string) {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          Object.assign(chain, {
            select: () => chain,
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            in: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            limit: () => chain,
            maybeSingle: async () => {
              if (table !== "appointments") return { data: null, error: null };
              const requested = filters.patient_id;

              // Doctor path: an appointment for this patient with this doctor.
              if (filters.doctor_id !== undefined) {
                const ok =
                  s.doctorTreatedPatient === true && requested === PATIENT_PROFILE_ID;
                return { data: ok ? { id: "appt" } : null, error: null };
              }

              // Facility-admin path: an appointment for this patient at a granted facility.
              if (Array.isArray(filters.facility_id)) {
                const granted = filters.facility_id as string[];
                const attended = s.patientFacilities ?? [];
                const overlap =
                  requested === PATIENT_PROFILE_ID &&
                  granted.some((g) => attended.includes(g));
                return { data: overlap ? { id: "appt" } : null, error: null };
              }

              return { data: null, error: null };
            },
          });
          return chain;
        },
        functions: {
          invoke: async (name: string, opts: { body: unknown; headers?: Record<string, string> }) => {
            rec.invoked.push({
              name,
              body: opts.body,
              authorization: opts.headers?.Authorization,
            });
            if (s.invokeFails) {
              return { data: null, error: { message: "pdfkit exploded internally" } };
            }
            return { data: { url: "https://project.supabase.co/signed/report.pdf" }, error: null };
          },
        },
      }),
    },
  });

  return rec;
}

async function call(patientId: string) {
  const mod = await import(
    `@/app/api/patients/[id]/medical-history/pdf/route?t=${Math.random()}`
  );
  const GET = mod.GET as (
    req: unknown,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
  return GET({ url: "https://api.test/x" }, { params: Promise.resolve({ id: patientId }) });
}

beforeEach(() => mock.reset());
after(() => mock.reset());

describe("patient isolation", () => {
  it("lets a patient render their OWN history", async () => {
    const rec = install({ role: "patient", ownsPatientProfile: true });
    const res = await call(PATIENT_PROFILE_ID);
    assert.equal(res.status, 200);
    assert.equal(rec.invoked.length, 1);
  });

  it("REFUSES a patient asking for someone else's history", async () => {
    const rec = install({ role: "patient", ownsPatientProfile: false });
    const res = await call(OTHER_PATIENT_ID);
    assert.equal(res.status, 403);
    assert.deepEqual(rec.invoked, [], "must not even reach the generator");
  });
});

describe("doctor scoping — the IDOR this closes", () => {
  it("lets a doctor render the history of a patient they HAVE treated", async () => {
    const rec = install({ role: "doctor", doctorRow: true, doctorTreatedPatient: true });
    const res = await call(PATIENT_PROFILE_ID);
    assert.equal(res.status, 200);
    assert.equal(rec.invoked.length, 1);
  });

  it("REFUSES a doctor with no appointment for that patient", async () => {
    // Before the fix this returned 200 for every patient in the system.
    const rec = install({ role: "doctor", doctorRow: true, doctorTreatedPatient: false });
    const res = await call(PATIENT_PROFILE_ID);
    assert.equal(res.status, 403);
    assert.deepEqual(rec.invoked, []);
  });

  it("REFUSES a doctor-role user with no doctors row at all", async () => {
    const rec = install({ role: "doctor", doctorRow: false });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
    assert.deepEqual(rec.invoked, []);
  });
});

describe("facility isolation", () => {
  it("lets a facility_admin render a patient seen at a facility they administer", async () => {
    const rec = install({
      role: "facility_admin",
      facilityGrants: [FACILITY_A],
      patientFacilities: [FACILITY_A],
    });
    const res = await call(PATIENT_PROFILE_ID);
    assert.equal(res.status, 200);
    assert.equal(rec.invoked.length, 1);
  });

  it("REFUSES a facility_admin when the patient was seen only at ANOTHER facility", async () => {
    const rec = install({
      role: "facility_admin",
      facilityGrants: [FACILITY_A],
      patientFacilities: [FACILITY_B],
    });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
    assert.deepEqual(rec.invoked, [], "cross-tenant read must not reach the generator");
  });

  it("REFUSES a facility_admin holding no live grant (e.g. revoked)", async () => {
    const rec = install({ role: "facility_admin", facilityGrants: [], patientFacilities: [FACILITY_A] });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
    assert.deepEqual(rec.invoked, []);
  });
});

describe("technician scoping is unchanged", () => {
  it("allows a technician with a lab result for that patient at their facility", async () => {
    const rec = install({ role: "technician", technicianFacility: FACILITY_A, technicianHasResult: true });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 200);
    assert.equal(rec.invoked.length, 1);
  });

  it("refuses a technician with no such lab result", async () => {
    const rec = install({ role: "technician", technicianFacility: FACILITY_A, technicianHasResult: false });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
    assert.deepEqual(rec.invoked, []);
  });

  it("refuses a technician with no technicians row", async () => {
    install({ role: "technician", technicianFacility: null });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
  });
});

describe("role gate", () => {
  it("refuses a user with no profile row", async () => {
    install({ role: null });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
  });

  it("refuses an unrecognised role", async () => {
    install({ role: "billing_clerk" });
    assert.equal((await call(PATIENT_PROFILE_ID)).status, 403);
  });

  it("super_admin stays deliberately unscoped — a global role by design", async () => {
    const rec = install({ role: "super_admin" });
    assert.equal((await call(OTHER_PATIENT_ID)).status, 200);
    assert.equal(rec.invoked.length, 1);
  });
});

describe("the invoke presents the service-role credential", () => {
  it("sends Authorization: Bearer <service role key>", async () => {
    // The Edge Function refuses callers that do not. If this regresses, generation fails closed.
    const rec = install({ role: "patient", ownsPatientProfile: true });
    await call(PATIENT_PROFILE_ID);
    assert.equal(rec.invoked[0]!.authorization, `Bearer ${SERVICE_KEY}`);
  });

  it("passes the URL patient id and the VERIFIED caller id, not a client-supplied one", async () => {
    const rec = install({ role: "patient", ownsPatientProfile: true });
    await call(PATIENT_PROFILE_ID);
    assert.deepEqual(rec.invoked[0]!.body, {
      patient_id: PATIENT_PROFILE_ID,
      created_by: USER_ID,
    });
  });
});

describe("failure handling", () => {
  it("does not leak the generator's internal error message", async () => {
    install({ role: "patient", ownsPatientProfile: true, invokeFails: true });
    const res = await call(PATIENT_PROFILE_ID);
    assert.equal(res.status, 500);
    const body = JSON.stringify(await res.json());
    assert.ok(!body.includes("pdfkit"), "internal detail must not reach the client");
    assert.ok(!body.includes("exploded"));
  });
});
