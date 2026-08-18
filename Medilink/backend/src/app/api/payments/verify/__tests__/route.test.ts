import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * POST /api/payments/verify — the client-side payment finalisation path.
 *
 * ── THE REGRESSION THIS PINS ──
 *
 * `invoiceDownloadUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", …)` THROWS when the base URL is
 * empty. That is deliberate — a misconfigured deploy must not emit `undefined/api/...` — but the
 * throw was UNCAUGHT in this route, so an unset `NEXT_PUBLIC_APP_URL` turned a payment that had
 * already settled into a 500:
 *
 *   • the payment row was already `paid` and the appointment already `confirmed`;
 *   • the patient nevertheless saw a failure on the success screen;
 *   • BOTH emails were lost, because the throw happened before the booking confirmation;
 *   • and the outer catch returned `err.message`, so the client was told
 *     "invoiceDownloadUrl: base URL is empty — set NEXT_PUBLIC_APP_URL".
 *
 * The property asserted here: **once a payment is finalised, NOTHING in the email path may
 * change the HTTP outcome.** Email is a side effect; the money is not.
 */

const APPT_ID = "aaaa1111-2222-4333-8444-555566667777";
const USER_ID = "11111111-2222-4333-8444-555566667777";
const PAYMENT_ID = "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5f";

interface Recorder {
  receipts: Array<{ to: string; link: string }>;
  confirmations: number;
  updates: Array<Record<string, unknown>>;
}

/** Payment starts unpaid + has a gateway session, so this request is the one that finalises it. */
function install(opts: {
  gatewayStatus?: string;
  invoiceUrl?: string | null;
  receiptThrows?: boolean;
  confirmationThrows?: boolean;
  storedInvoiceUrl?: string | null;
  appointmentVisible?: boolean;
}): Recorder {
  const rec: Recorder = { receipts: [], confirmations: 0, updates: [] };

  // The caller's own RLS client. The route reads the appointment through it, which IS the
  // ownership check: an appointment the caller cannot see yields 404.
  mock.module("@/lib/supabase/api", {
    namedExports: {
      createApiSupabaseClient: async () => {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: opts.appointmentVisible === false ? null : { id: APPT_ID },
            error: null,
          }),
        });
        return { from: () => chain };
      },
    },
  });
  mock.module("@/lib/auth/api", {
    namedExports: { getAal2UserOrThrow: async () => ({ id: USER_ID }) },
  });

  mock.module("@/lib/supabase/service", {
    namedExports: {
      createServiceSupabase: () => {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          update: (row: Record<string, unknown>) => {
            rec.updates.push(row);
            return chain;
          },
          insert: () => chain,
          eq: () => chain,
          neq: () => chain,
          maybeSingle: async () => ({
            data: {
              id: PAYMENT_ID,
              appointment_id: APPT_ID,
              patient_id: USER_ID,
              status: "pending",
              gateway_session_id: "sess_1",
              invoice_url: opts.storedInvoiceUrl ?? null,
              invoice_number: null,
              amount: 21,
              currency: "OMR",
              payment_method: "card",
              gateway: "thawani",
              gateway_ref: null,
              created_at: "2026-08-18T00:00:00Z",
            },
            error: null,
          }),
          single: async () => ({ data: { id: APPT_ID, patient_id: USER_ID }, error: null }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: [{ id: PAYMENT_ID }], error: null }),
        });
        return {
          from: () => chain,
          auth: { admin: { getUserById: async () => ({ data: { user: { email: "p@example.test" } } }) } },
          rpc: async () => ({ data: null, error: null }),
        };
      },
    },
  });

  mock.module("@/lib/payments/ensureInvoice", {
    namedExports: {
      ensureInvoice: async () => ({
        ok: opts.invoiceUrl !== null,
        url: opts.invoiceUrl === undefined ? "stored-object" : opts.invoiceUrl,
        invoiceNumber: "INV-1",
        outcome: "generated",
      }),
    },
  });

  mock.module("@/lib/email/sendInvoice", {
    namedExports: {
      sendInvoiceEmail: async (to: string, link: string) => {
        if (opts.receiptThrows) throw new Error("SMTP exploded");
        rec.receipts.push({ to, link });
        return { ok: true };
      },
    },
  });
  mock.module("@/lib/email/appointmentEmailForUser", {
    namedExports: {
      sendAppointmentEmailForUser: async () => {
        if (opts.confirmationThrows) throw new Error("SMTP exploded");
        rec.confirmations += 1;
        return { ok: true };
      },
    },
  });
  mock.module("@/lib/notifications/notifyPaymentSuccess", {
    // The route reads notifResult.success — return the real shape, not undefined.
    namedExports: { notifyPaymentSuccess: async () => ({ success: true }) },
  });

  mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ data: { payment_status: opts.gatewayStatus ?? "paid", invoice: "TH-1" } }),
  }) as never);

  return rec;
}

async function loadRoute() {
  const mod = await import(`@/app/api/payments/verify/route?t=${Math.random()}`);
  return mod.POST as (req: unknown) => Promise<Response>;
}

const request = (body: unknown = { appointment_id: APPT_ID }) => ({ json: async () => body });

beforeEach(() => {
  mock.reset();
  process.env.THAWANI_BASE_URL = "https://checkout.thawani.om/api/v1";
  process.env.THAWANI_SECRET_KEY = "sk_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.medilink.om";
});

after(() => mock.reset());

describe("NEXT_PUBLIC_APP_URL unset — must NOT 500 a settled payment", () => {
  it("returns 200, not 500, when APP_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    install({});
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200, "a finalised payment must never be reported as failed");
  });

  it("still sends the BOOKING CONFIRMATION when the receipt cannot be built", async () => {
    // The worst part of the original bug: the throw happened before this call, so the patient
    // got neither email.
    delete process.env.NEXT_PUBLIC_APP_URL;
    const rec = install({});
    await (await loadRoute())(request());
    assert.equal(rec.confirmations, 1, "confirmation must survive a skipped receipt");
    assert.deepEqual(rec.receipts, [], "no receipt without a base URL to link to");
  });

  it("treats a whitespace-only APP_URL as unset rather than building a broken link", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    const rec = install({});
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200);
    assert.deepEqual(rec.receipts, []);
  });

  it("never leaks the internal error message to the client", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    install({});
    const res = await (await loadRoute())(request());
    const body = JSON.stringify(await res.json());
    assert.ok(!body.includes("NEXT_PUBLIC_APP_URL"), "must not name an env var to the client");
    assert.ok(!body.includes("invoiceDownloadUrl"), "must not leak internal symbols");
  });
});

describe("APP_URL set — the happy path still works", () => {
  it("emails a receipt whose link is the AUTHENTICATED route, not storage", async () => {
    const rec = install({});
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200);
    assert.equal(rec.receipts.length, 1);
    assert.equal(rec.receipts[0]!.link, `https://app.medilink.om/api/payments/${PAYMENT_ID}/invoice`);
    assert.ok(!rec.receipts[0]!.link.includes("/storage/"), "must never be a storage URL");
  });

  it("sends both the receipt and the confirmation", async () => {
    const rec = install({});
    await (await loadRoute())(request());
    assert.equal(rec.receipts.length, 1);
    assert.equal(rec.confirmations, 1);
  });
});

describe("email failures are non-fatal and independent", () => {
  it("a failing receipt does not 500 and does not suppress the confirmation", async () => {
    const rec = install({ receiptThrows: true });
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200);
    assert.equal(rec.confirmations, 1, "one email failing must not block the other");
  });

  it("a failing confirmation does not 500 and does not undo the receipt", async () => {
    const rec = install({ confirmationThrows: true });
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200);
    assert.equal(rec.receipts.length, 1);
  });

  it("no invoice yet: still 200, confirmation still sent, no receipt", async () => {
    const rec = install({ invoiceUrl: null });
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 200);
    assert.equal(rec.receipts.length, 0);
    assert.equal(rec.confirmations, 1);
  });
});

describe("payment and ownership validation are unchanged", () => {
  it("400s a request with no appointment_id", async () => {
    install({});
    const res = await (await loadRoute())(request({}));
    assert.equal(res.status, 400);
  });

  it("404s an appointment the caller cannot see (ownership via the caller's RLS client)", async () => {
    // The appointment is read through supabaseAuth, so RLS decides visibility. This must keep
    // working: it is what stops patient A verifying patient B's payment.
    const rec = install({ appointmentVisible: false });
    const res = await (await loadRoute())(request());
    assert.equal(res.status, 404);
    assert.deepEqual(rec.receipts, [], "no email for an appointment that is not the caller's");
    assert.equal(rec.confirmations, 0);
  });

  it("does NOT finalise when the gateway does not report the session as paid", async () => {
    const rec = install({ gatewayStatus: "unpaid" });
    await (await loadRoute())(request());
    assert.ok(
      !rec.updates.some((u) => u.status === "paid"),
      "the gateway remains the authority on whether money moved"
    );
    assert.deepEqual(rec.receipts, [], "no receipt for an unpaid session");
  });
});
