import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * POST /api/payments/checkout — create a Thawani hosted-checkout session.
 *
 * ── THE PROPERTY THAT MATTERS MOST ──
 *
 * **The amount charged is derived on the server and the client-sent amount is ignored.**
 * That is BP-4, and it is the difference between a patient paying the doctor's fee and a
 * patient paying whatever number they put in a request body. The route's own comment says
 * the client `amount` is ignored; nothing was asserting it, so a future refactor that
 * "helpfully" read `body.amount` would have shipped silently.
 *
 * The rest of the suite covers the guards that stop a session being created in a state that
 * cannot settle: unapproved emergency appointments, already-paid appointments, a doctor with
 * no fee, and a deploy whose Thawani configuration cannot produce a payable URL.
 *
 * `@medilink/shared` (feeForType / consultationTotal) and `lib/thawani/checkoutConfig` are
 * deliberately NOT mocked — the real fee-plus-VAT arithmetic and the real configuration
 * rules are part of what is being asserted.
 */

const APPT_ID = "aaaa1111-2222-4333-8444-555566667777";
const USER_ID = "11111111-2222-4333-8444-555566667777";
const FACILITY_ID = "ffff1111-2222-4333-8444-555566667777";

interface Recorder {
  thawaniBodies: unknown[];
  upserts: Array<Record<string, unknown>>;
}

function install(opts: {
  authThrows?: Error;
  appointment?: Record<string, unknown> | null;
  existingPayment?: { status: string } | null;
  thawaniOk?: boolean;
  thawaniJson?: unknown;
  upsertError?: { message: string } | null;
}): Recorder {
  const rec: Recorder = { thawaniBodies: [], upserts: [] };

  mock.module("@/lib/supabase/api", {
    namedExports: {
      createApiSupabaseClient: async () => ({
        from: () => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            single: async () => ({
              data: opts.appointment === undefined ? defaultAppointment() : opts.appointment,
              error: null,
            }),
          };
          return chain;
        },
      }),
    },
  });

  mock.module("@/lib/auth/api", {
    namedExports: {
      getAal2UserOrThrow: async () => {
        if (opts.authThrows) throw opts.authThrows;
        return { id: USER_ID };
      },
    },
  });

  mock.module("@/lib/supabase/service", {
    namedExports: {
      createServiceSupabase: () => ({
        from: () => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: opts.existingPayment ?? null, error: null }),
            upsert: async (row: Record<string, unknown>) => {
              rec.upserts.push(row);
              return { error: opts.upsertError ?? null };
            },
          };
          return chain;
        },
      }),
    },
  });

  // Thawani is a network call; stub global fetch and record what we sent.
  mock.method(globalThis, "fetch", async (_url: string, init: { body?: string }) => {
    rec.thawaniBodies.push(JSON.parse(init?.body ?? "{}"));
    return {
      ok: opts.thawaniOk ?? true,
      json: async () => opts.thawaniJson ?? { data: { session_id: "checkout_sess_123" } },
    } as unknown as Response;
  });

  return rec;
}

/** 20 OMR in-person fee → 20 + 5% VAT = 21.000 → 21000 baisa. */
function defaultAppointment(over: Record<string, unknown> = {}) {
  return {
    id: APPT_ID,
    patient_id: USER_ID,
    facility_id: FACILITY_ID,
    is_emergency: false,
    status: "pending",
    type: "in_person",
    doctors: { fees: { in_person: 20, online: 15 } },
    ...over,
  };
}

async function loadRoute() {
  const mod = await import(`@/app/api/payments/checkout/route?t=${Math.random()}`);
  return mod.POST as (req: unknown) => Promise<Response>;
}

function request(body: unknown) {
  return { json: async () => body };
}

beforeEach(() => {
  mock.reset();
  // A coherent, production-shaped Thawani configuration (hosts must match).
  process.env.THAWANI_BASE_URL = "https://checkout.thawani.om/api/v1";
  process.env.THAWANI_CHECKOUT_BASE_URL = "https://checkout.thawani.om";
  process.env.THAWANI_PUBLISHABLE_KEY = "pk_test_publishable";
  process.env.THAWANI_SECRET_KEY = "sk_test_secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.medilink.om";
});

after(() => mock.reset());

describe("authentication", () => {
  it("401s an unauthenticated caller and creates no Thawani session", async () => {
    const rec = install({ authThrows: new Error("Unauthorized") });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 401);
    assert.deepEqual(rec.thawaniBodies, [], "must not create a session for an anonymous caller");
    assert.deepEqual(rec.upserts, []);
  });

  it("403s when the 2FA step has not been cleared", async () => {
    install({ authThrows: new Error("2FA verification required") });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));
    assert.equal(res.status, 403);
  });
});

describe("input validation", () => {
  it("400s when appointment_id is missing", async () => {
    const rec = install({});
    const res = await (await loadRoute())(request({}));

    assert.equal(res.status, 400);
    assert.deepEqual(rec.thawaniBodies, []);
  });

  it("404s when the appointment is not visible to the caller", async () => {
    // The appointment is read through the caller's own RLS client, so "not found" here
    // also covers "exists but belongs to another patient".
    const rec = install({ appointment: null });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 404);
    assert.deepEqual(rec.thawaniBodies, [], "no session for an appointment we cannot see");
  });
});

describe("BP-4 — the amount is server-derived", () => {
  it("charges the doctor's fee plus 5% VAT", async () => {
    const rec = install({});
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 200);
    // 20 OMR + 5% = 21.000 OMR, sent to Thawani in baisa (×1000).
    const body = rec.thawaniBodies[0] as { products: Array<{ unit_amount: number }> };
    assert.equal(body.products[0].unit_amount, 21000);
    assert.equal(rec.upserts[0].amount, 21);
    assert.equal(rec.upserts[0].currency, "OMR");
  });

  it("IGNORES a client-supplied amount — the whole point of BP-4", async () => {
    const rec = install({});
    // A malicious client asking to pay 0.001 OMR for a 20 OMR consultation.
    const res = await (await loadRoute())(
      request({ appointment_id: APPT_ID, amount: 0.001, total: 0.001 })
    );

    assert.equal(res.status, 200);
    const body = rec.thawaniBodies[0] as { products: Array<{ unit_amount: number }> };
    assert.equal(body.products[0].unit_amount, 21000, "must charge the server-derived amount");
    assert.equal(rec.upserts[0].amount, 21);
  });

  it("prices an online consultation from the online fee, not the in-person one", async () => {
    const rec = install({ appointment: defaultAppointment({ type: "online" }) });
    await (await loadRoute())(request({ appointment_id: APPT_ID }));

    // 15 + 5% = 15.750 OMR
    const body = rec.thawaniBodies[0] as { products: Array<{ unit_amount: number }> };
    assert.equal(body.products[0].unit_amount, 15750);
  });

  it("400s when the doctor has no usable fee instead of charging zero", async () => {
    const rec = install({ appointment: defaultAppointment({ doctors: { fees: null } }) });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 400);
    assert.deepEqual(rec.thawaniBodies, [], "a zero-amount session must never be created");
  });
});

describe("invalid payment state", () => {
  it("400s an emergency appointment that staff have not approved", async () => {
    const rec = install({
      appointment: defaultAppointment({ is_emergency: true, status: "pending" }),
    });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 400);
    assert.deepEqual(rec.thawaniBodies, []);
  });

  it("allows an emergency appointment once approved", async () => {
    install({ appointment: defaultAppointment({ is_emergency: true, status: "approved" }) });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 200);
  });

  it("400s when the appointment is already paid — no double charge", async () => {
    const rec = install({ existingPayment: { status: "paid" } });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 400);
    assert.deepEqual(rec.thawaniBodies, [], "must not create a second session for a paid appointment");
  });

  it("permits a retry when the previous attempt is still pending", async () => {
    install({ existingPayment: { status: "pending" } });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 200);
  });
});

describe("Thawani configuration", () => {
  it("503s a misconfigured deploy BEFORE creating a session — no orphan sessions", async () => {
    // Ordering matters: validating at URL-construction time would leave a real, billable
    // session behind at Thawani for every request from a broken deploy.
    delete process.env.THAWANI_CHECKOUT_BASE_URL;
    const rec = install({});
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 503);
    assert.deepEqual(rec.thawaniBodies, [], "must not reach Thawani when config is unusable");
  });

  it("503s when the API and checkout hosts disagree (the UAT/prod cutover trap)", async () => {
    process.env.THAWANI_BASE_URL = "https://uatcheckout.thawani.om/api/v1";
    process.env.THAWANI_CHECKOUT_BASE_URL = "https://checkout.thawani.om";
    const rec = install({});
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 503);
    assert.deepEqual(rec.thawaniBodies, []);
  });

  it("never leaks a credential or a config detail to the client", async () => {
    delete process.env.THAWANI_CHECKOUT_BASE_URL;
    install({});
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));
    const body = JSON.stringify(await res.json());

    assert.ok(!body.includes("sk_test_secret"));
    assert.ok(!body.includes("pk_test_publishable"));
    assert.ok(!body.includes("THAWANI_CHECKOUT_BASE_URL"), "variable names belong in the server log");
  });
});

describe("gateway and persistence failures", () => {
  it("500s when Thawani rejects the session request", async () => {
    const rec = install({ thawaniOk: false, thawaniJson: { error: "bad request" } });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));

    assert.equal(res.status, 500);
    assert.deepEqual(rec.upserts, [], "no payment row for a session that was never created");
  });

  it("500s when Thawani returns no session id", async () => {
    install({ thawaniJson: { data: {} } });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));
    assert.equal(res.status, 500);
  });

  it("500s when the payment row cannot be written", async () => {
    install({ upsertError: { message: "duplicate key value violates unique constraint" } });
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));
    const body = JSON.stringify(await res.json());

    assert.equal(res.status, 500);
    assert.ok(!body.includes("duplicate key"), "driver detail must not reach the client");
  });
});

describe("the created payment row", () => {
  it("records the caller as the payer and keys on the appointment", async () => {
    const rec = install({});
    await (await loadRoute())(request({ appointment_id: APPT_ID }));

    const row = rec.upserts[0];
    // patient_id must be the AUTH uid — the invoice storage policy and every ownership
    // filter in the payments surface depend on this being the auth user, not a profile id.
    assert.equal(row.patient_id, USER_ID);
    assert.equal(row.appointment_id, APPT_ID);
    assert.equal(row.status, "pending");
    assert.equal(row.gateway, "thawani");
    assert.equal(row.gateway_session_id, "checkout_sess_123");
  });

  it("returns a checkout URL on the configured host with the publishable key", async () => {
    install({});
    const res = await (await loadRoute())(request({ appointment_id: APPT_ID }));
    const body = (await res.json()) as { checkoutUrl: string };

    assert.match(body.checkoutUrl, /^https:\/\/checkout\.thawani\.om\/pay\/checkout_sess_123\?key=/);
    // The secret key must never appear in a client-bound URL.
    assert.ok(!body.checkoutUrl.includes("sk_test_secret"));
  });
});
