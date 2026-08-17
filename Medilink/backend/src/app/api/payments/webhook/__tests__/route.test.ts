import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

/**
 * POST /api/payments/webhook — Thawani payment callback.
 *
 * This is the single most dangerous entry point in the product: a request that gets through
 * marks a payment `paid`, confirms the appointment, generates an invoice containing PHI and
 * emails a receipt. It is also unauthenticated by nature — the caller is a gateway, not a
 * user — so every control is inside the handler.
 *
 * Three controls, layered, and each is asserted here:
 *
 *   1. HMAC signature (optional, defence in depth) — rejected before ANY database work.
 *   2. Thawani re-query (mandatory, authoritative) — the body is never trusted on its own.
 *      This is the payment-bypass fix: a POST carrying a known appointment id used to be
 *      enough to mark a payment paid.
 *   3. Atomic paid-claim — makes duplicate and concurrent deliveries idempotent, so a
 *      retrying gateway cannot double-send receipts or re-run side effects.
 *
 * The deep-detail crypto cases live in lib/payments/__tests__/webhookSignature.test.ts;
 * what this suite proves is that the handler actually WIRES each control in, in the right
 * order, and does no work when one of them says no.
 */

const APPT_ID = "aaaa1111-2222-4333-8444-555566667777";
const SECRET = "whsec_test";

interface Recorder {
  fetches: string[];
  updates: Array<Record<string, unknown>>;
  selects: number;
  emails: number;
  invoices: number;
}

function body(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    event_type: "checkout.completed",
    data: { session_id: "sess_1", client_reference_id: APPT_ID },
    ...over,
  });
}

function sign(raw: string, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

function install(opts: {
  payment?: Record<string, unknown> | null;
  gatewayStatus?: string;
  claimed?: unknown[];
}): Recorder {
  const rec: Recorder = { fetches: [], updates: [], selects: 0, emails: 0, invoices: 0 };

  mock.module("@/lib/supabase/service", {
    namedExports: {
      createServiceSupabase: () => ({
        from: () => {
          const chain: Record<string, unknown> = {};
          Object.assign(chain, {
            select: () => {
              rec.selects += 1;
              return chain;
            },
            update: (row: Record<string, unknown>) => {
              rec.updates.push(row);
              return chain;
            },
            insert: () => chain,
            upsert: () => chain,
            eq: () => chain,
            neq: () => chain,
            in: () => chain,
            single: async () => ({
              data: opts.payment === undefined ? defaultPayment() : opts.payment,
              error: opts.payment === null ? { message: "no rows" } : null,
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            // The atomic paid-claim: `.select()` after `.update()` returns the rows it won.
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: opts.claimed ?? [{ id: "pay_1" }], error: null }),
          });
          return chain;
        },
        auth: { admin: { getUserById: async () => ({ data: { user: { email: null } } }) } },
        rpc: async () => ({ data: null, error: null }),
      }),
    },
  });

  mock.module("@/lib/email/sendInvoice", {
    namedExports: {
      sendInvoiceEmail: async () => {
        rec.emails += 1;
        return { ok: true };
      },
    },
  });
  mock.module("@/lib/email/appointmentEmailForUser", {
    namedExports: { sendAppointmentEmailForUser: async () => ({ ok: true }) },
  });
  mock.module("@/lib/audit/logAudit", {
    namedExports: { logAudit: async () => {}, getClientIp: () => "127.0.0.1" },
  });
  mock.module("@/lib/notifications/notifyPaymentSuccess", {
    namedExports: { notifyPaymentSuccess: async () => {} },
  });
  mock.module("@/lib/payments/ensureInvoice", {
    namedExports: {
      ensureInvoice: async () => {
        rec.invoices += 1;
        return { ok: true, url: "stored", invoiceNumber: "INV-1", outcome: "generated" };
      },
    },
  });

  mock.method(globalThis, "fetch", async (url: string) => {
    rec.fetches.push(String(url));
    return {
      ok: true,
      json: async () => ({ data: { payment_status: opts.gatewayStatus ?? "paid", invoice: "TH-1" } }),
    } as unknown as Response;
  });

  return rec;
}

function defaultPayment(over: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    appointment_id: APPT_ID,
    patient_id: "11111111-2222-4333-8444-555566667777",
    status: "pending",
    gateway_session_id: "sess_1",
    invoice_url: null,
    invoice_number: null,
    amount: 21,
    ...over,
  };
}

async function loadRoute() {
  const mod = await import(`@/app/api/payments/webhook/route?t=${Math.random()}`);
  return mod.POST as (req: unknown) => Promise<Response>;
}

function request(raw: string, headers: Record<string, string> = {}) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    text: async () => raw,
    headers: { get: (n: string) => lower.get(n.toLowerCase()) ?? null },
  };
}

beforeEach(() => {
  mock.reset();
  delete process.env.THAWANI_WEBHOOK_SECRET;
  process.env.THAWANI_BASE_URL = "https://checkout.thawani.om/api/v1";
  process.env.THAWANI_SECRET_KEY = "sk_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.medilink.om";
});

after(() => mock.reset());

describe("signature verification is wired in, and runs first", () => {
  it("401s an unsigned request when a secret IS configured", async () => {
    process.env.THAWANI_WEBHOOK_SECRET = SECRET;
    const rec = install({});

    const res = await (await loadRoute())(request(body()));

    assert.equal(res.status, 401);
    // The decisive assertion: rejection happens before any database or gateway work.
    assert.equal(rec.selects, 0, "must not query payments for an unsigned request");
    assert.deepEqual(rec.fetches, [], "must not call Thawani for an unsigned request");
  });

  it("401s a request signed with the wrong secret", async () => {
    process.env.THAWANI_WEBHOOK_SECRET = SECRET;
    const rec = install({});
    const raw = body();

    const res = await (await loadRoute())(
      request(raw, { "thawani-signature": sign(raw, "wrong-secret") })
    );

    assert.equal(res.status, 401);
    assert.equal(rec.selects, 0);
  });

  it("401s a genuine signature replayed against a TAMPERED body", async () => {
    process.env.THAWANI_WEBHOOK_SECRET = SECRET;
    const rec = install({});
    const original = body();
    const tampered = body({ data: { session_id: "sess_1", client_reference_id: "other-appt" } });

    const res = await (await loadRoute())(
      request(tampered, { "thawani-signature": sign(original) })
    );

    assert.equal(res.status, 401);
    assert.equal(rec.selects, 0);
  });

  it("accepts a correctly signed request", async () => {
    process.env.THAWANI_WEBHOOK_SECRET = SECRET;
    install({});
    const raw = body();

    const res = await (await loadRoute())(request(raw, { "thawani-signature": sign(raw) }));

    assert.notEqual(res.status, 401);
  });

  it("proceeds without a signature when no secret is configured", async () => {
    // Documented, deliberate: the Thawani re-query is the authoritative guard, so an
    // unset secret must not break existing deployments.
    const rec = install({});
    const res = await (await loadRoute())(request(body()));

    assert.notEqual(res.status, 401);
    assert.ok(rec.selects > 0);
  });
});

describe("input validation", () => {
  it("400s when client_reference_id is absent", async () => {
    const rec = install({});
    const res = await (await loadRoute())(request(JSON.stringify({ event_type: "x", data: {} })));

    assert.equal(res.status, 400);
    assert.equal(rec.selects, 0);
  });

  it("400s on an unparseable body rather than throwing", async () => {
    install({});
    const res = await (await loadRoute())(request("<<not json>>"));
    assert.equal(res.status, 400);
  });

  it("404s when no payment matches the appointment", async () => {
    install({ payment: null });
    const res = await (await loadRoute())(request(body()));
    assert.equal(res.status, 404);
  });
});

describe("the body is never trusted — the payment-bypass fix", () => {
  it("re-queries Thawani before finalizing", async () => {
    const rec = install({});
    await (await loadRoute())(request(body()));

    assert.ok(
      rec.fetches.some((u) => u.includes("/checkout/session/sess_1")),
      "must confirm the session with the gateway"
    );
  });

  it("does NOT finalize when the gateway does not report the session as paid", async () => {
    // A forged POST naming a real appointment must not be able to mark it paid.
    const rec = install({ gatewayStatus: "unpaid" });
    const res = await (await loadRoute())(request(body()));
    const json = (await res.json()) as { finalized?: boolean; reason?: string };

    assert.equal(json.finalized, false);
    assert.match(json.reason ?? "", /not paid/i);
    assert.deepEqual(rec.updates, [], "no write when the gateway says unpaid");
    assert.equal(rec.invoices, 0, "no invoice for an unpaid session");
  });

  it("does not finalize a payment that has no gateway session to verify against", async () => {
    const rec = install({ payment: defaultPayment({ gateway_session_id: null }) });
    const res = await (await loadRoute())(request(body()));
    const json = (await res.json()) as { finalized?: boolean };

    assert.equal(json.finalized, false);
    assert.deepEqual(rec.updates, []);
    assert.deepEqual(rec.fetches, [], "nothing to ask the gateway about");
  });
});

describe("duplicate / replayed delivery is idempotent", () => {
  it("skips side effects when another delivery already won the atomic claim", async () => {
    // `claimed: []` models the concurrent case: the conditional UPDATE matched no rows
    // because a parallel delivery flipped the row to paid first.
    const rec = install({ claimed: [] });
    const res = await (await loadRoute())(request(body()));
    const json = (await res.json()) as { received?: boolean; finalized?: boolean; reason?: string };

    assert.equal(res.status, 200, "a duplicate must still be ACKed so the gateway stops retrying");
    assert.equal(json.received, true);
    assert.equal(json.finalized, false);
    assert.match(json.reason ?? "", /already finalized/i);
    assert.equal(rec.emails, 0, "a retried webhook must not re-send the receipt");
    assert.equal(rec.invoices, 0, "a retried webhook must not re-run invoice generation");
  });

  it("acks an already-paid payment without re-charging or re-notifying", async () => {
    const rec = install({ payment: defaultPayment({ status: "paid", invoice_url: "stored" }) });
    const res = await (await loadRoute())(request(body()));

    assert.equal(res.status, 200);
    assert.deepEqual(rec.fetches, [], "no gateway re-query needed for an already-paid payment");
    assert.equal(rec.emails, 0, "no duplicate receipt");
    assert.equal(rec.invoices, 0, "invoice already exists — the worker must not run again");

    // The payment row itself must NOT be re-claimed...
    assert.ok(
      !rec.updates.some((u) => u.status === "paid"),
      "an already-paid payment must not be written again"
    );
    // ...but the appointment confirm DOES run unconditionally. That is the route's real
    // behaviour and it is safe: setting `confirmed` on an already-confirmed row is
    // idempotent and writes no new side effect. Asserted rather than assumed away, so the
    // test documents what actually happens instead of an idealised version of it.
    assert.deepEqual(rec.updates, [{ status: "confirmed" }]);
  });
});
