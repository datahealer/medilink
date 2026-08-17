import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * GET /api/payments/{id}/invoice — the authenticated invoice download.
 *
 * ── WHY THIS SUITE EXISTS ──
 *
 * This route guards PHI. The PDF it serves carries the patient's full name, email address,
 * doctor, facility and amount. It is also the route whose authorization was, until
 * 20260817000000, decorative: it authenticated the caller and filtered on
 * `patient_id = auth.uid()` correctly, then redirected to a PUBLIC storage URL that needed
 * no authorization at all.
 *
 * So the properties asserted here are not "does it return 200". They are:
 *
 *   1. an unauthenticated caller gets nothing;
 *   2. a caller who does not own the payment gets nothing, and cannot tell the difference
 *      between "not yours" and "does not exist";
 *   3. the object that gets signed is derived from the OWNERSHIP-CHECKED payment id, never
 *      from the stored `invoice_url` — so a wrong or tampered row cannot redirect a patient
 *      to somebody else's invoice;
 *   4. nothing internal leaks in an error body.
 *
 * Route handlers could not be tested in this package at all until `test/alias-hooks.mjs`
 * taught the Node test runner to resolve the `@/*` tsconfig paths — which is why the
 * payments surface, the highest-consequence code here, previously had zero coverage.
 */

const PAYMENT_ID = "3f2b1c4d-5e6a-4b7c-8d9e-0a1b2c3d4e5f";
const OTHER_PAYMENT_ID = "99999999-8888-4777-a666-555544443333";
const USER_ID = "11111111-2222-4333-8444-555566667777";
const SIGNED_URL = "https://ref.supabase.co/storage/v1/object/sign/invoices/x.pdf?token=abc";

/** Records what the route asked storage to sign, so we can assert on it. */
interface Recorder {
  signedPaths: string[];
  signedBuckets: string[];
  queriedFilters: Array<Record<string, unknown>>;
}

/**
 * Build the mocked module graph for one scenario.
 *
 * `paymentRow` null models both "no such payment" and "not owned by this caller" — the
 * route reaches both through the same `.eq("id").eq("patient_id")` query, which is exactly
 * why they are indistinguishable to a client.
 */
function install(opts: {
  authThrows?: Error;
  paymentRow?: { id: string; invoice_url: string | null } | null;
  queryError?: { message: string } | null;
  signError?: { message: string } | null;
}): Recorder {
  const rec: Recorder = { signedPaths: [], signedBuckets: [], queriedFilters: [] };

  mock.module("@/lib/supabase/api", {
    namedExports: { createApiSupabaseClient: async () => ({}) },
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
        from() {
          const filters: Record<string, unknown> = {};
          rec.queriedFilters.push(filters);
          const chain = {
            select: () => chain,
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            maybeSingle: async () => ({
              data: opts.paymentRow ?? null,
              error: opts.queryError ?? null,
            }),
          };
          return chain;
        },
        storage: {
          from(bucket: string) {
            rec.signedBuckets.push(bucket);
            return {
              createSignedUrl: async (path: string) => {
                rec.signedPaths.push(path);
                return opts.signError
                  ? { data: null, error: opts.signError }
                  : { data: { signedUrl: SIGNED_URL }, error: null };
              },
            };
          },
        },
      }),
    },
  });

  return rec;
}

/** Import the route fresh so it picks up the mocks installed for this scenario. */
async function loadRoute() {
  const mod = await import(`@/app/api/payments/[id]/invoice/route?t=${Math.random()}`);
  return mod.GET as (req: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
}

function request(url = `https://api.test/api/payments/${PAYMENT_ID}/invoice`) {
  return { nextUrl: new URL(url) };
}

beforeEach(() => {
  mock.reset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.medilink.om";
});

after(() => mock.reset());

describe("authentication", () => {
  it("401s an unauthenticated caller and never touches storage", async () => {
    const rec = install({ authThrows: new Error("Unauthorized") });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.equal(res.status, 401);
    assert.deepEqual(rec.signedPaths, [], "must not sign anything for an anonymous caller");
  });

  it("403s a caller who has not cleared the 2FA step", async () => {
    install({ authThrows: new Error("2FA verification required") });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.equal(res.status, 403);
  });
});

describe("input validation", () => {
  it("404s a non-UUID id BEFORE querying the database or storage", async () => {
    const rec = install({ paymentRow: { id: PAYMENT_ID, invoice_url: "x" } });
    const GET = await loadRoute();

    for (const bad of ["not-a-uuid", "../../secret", "*", "1"]) {
      const res = await GET(request(), { params: Promise.resolve({ id: bad }) });
      assert.equal(res.status, 404, `expected 404 for ${bad}`);
    }

    assert.deepEqual(rec.queriedFilters, [], "a malformed id must not reach the database");
    assert.deepEqual(rec.signedPaths, [], "a malformed id must not reach storage");
  });
});

describe("ownership", () => {
  it("scopes the lookup to BOTH the payment id and the caller", async () => {
    const rec = install({ paymentRow: { id: PAYMENT_ID, invoice_url: "stored" } });
    const GET = await loadRoute();

    await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    // The ownership filter is what makes `id` safe to use as an object address.
    assert.equal(rec.queriedFilters.length, 1);
    assert.deepEqual(rec.queriedFilters[0], { id: PAYMENT_ID, patient_id: USER_ID });
  });

  it("404s when the payment is not the caller's, and signs nothing", async () => {
    // Not-owned and non-existent both surface as a null row from the scoped query.
    const rec = install({ paymentRow: null });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: OTHER_PAYMENT_ID }) });

    assert.equal(res.status, 404);
    assert.deepEqual(rec.signedPaths, []);
  });

  it("gives the SAME 404 body for not-owned and not-found — no existence leak", async () => {
    install({ paymentRow: null });
    const notOwned = await (await loadRoute())(request(), {
      params: Promise.resolve({ id: OTHER_PAYMENT_ID }),
    });
    const notOwnedBody = await notOwned.json();

    mock.reset();
    install({ paymentRow: null });
    const missing = await (await loadRoute())(request(), {
      params: Promise.resolve({ id: PAYMENT_ID }),
    });
    const missingBody = await missing.json();

    assert.equal(notOwned.status, missing.status);
    assert.deepEqual(notOwnedBody, missingBody);
  });
});

describe("invalid payment state", () => {
  it("404s when the payment exists but has no invoice yet", async () => {
    const rec = install({ paymentRow: { id: PAYMENT_ID, invoice_url: null } });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.equal(res.status, 404);
    assert.deepEqual(rec.signedPaths, [], "no invoice means nothing to sign");
  });
});

describe("the signed object is derived from the payment id, not the stored URL", () => {
  it("signs {payment_id}.pdf in the invoices bucket", async () => {
    const rec = install({ paymentRow: { id: PAYMENT_ID, invoice_url: "anything" } });
    const GET = await loadRoute();

    await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.deepEqual(rec.signedBuckets, ["invoices"]);
    assert.deepEqual(rec.signedPaths, [`${PAYMENT_ID}.pdf`]);
  });

  it("IGNORES a tampered invoice_url pointing at another patient's object", async () => {
    // The core containment property. If the route parsed `invoice_url`, this row would
    // hand the caller someone else's invoice. Deriving from the ownership-checked id makes
    // that structurally impossible.
    const rec = install({
      paymentRow: {
        id: PAYMENT_ID,
        invoice_url: `https://ref.supabase.co/storage/v1/object/public/invoices/${OTHER_PAYMENT_ID}.pdf`,
      },
    });
    const GET = await loadRoute();

    await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.deepEqual(rec.signedPaths, [`${PAYMENT_ID}.pdf`]);
    assert.ok(
      !rec.signedPaths.some((p) => p.includes(OTHER_PAYMENT_ID)),
      "must never sign an object named by the stored URL"
    );
  });
});

describe("success responses", () => {
  it("redirects to the signed URL and forbids caching", async () => {
    install({ paymentRow: { id: PAYMENT_ID, invoice_url: "stored" } });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });

    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), SIGNED_URL);
    // A cached redirect to PHI would outlive the signature's TTL in a shared cache.
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });

  it("returns JSON with the url and TTL when format=json", async () => {
    install({ paymentRow: { id: PAYMENT_ID, invoice_url: "stored" } });
    const GET = await loadRoute();

    const res = await GET(
      request(`https://api.test/api/payments/${PAYMENT_ID}/invoice?format=json`),
      { params: Promise.resolve({ id: PAYMENT_ID }) }
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, SIGNED_URL);
    assert.ok(typeof body.expiresIn === "number" && body.expiresIn > 0);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });

  it("runs the identical auth and ownership checks for the json shape", async () => {
    // `format` must only choose the delivery shape, never bypass a check.
    const rec = install({ authThrows: new Error("Unauthorized") });
    const GET = await loadRoute();

    const res = await GET(
      request(`https://api.test/api/payments/${PAYMENT_ID}/invoice?format=json`),
      { params: Promise.resolve({ id: PAYMENT_ID }) }
    );

    assert.equal(res.status, 401);
    assert.deepEqual(rec.signedPaths, []);
  });
});

describe("error handling", () => {
  it("404s when the object cannot be signed, without leaking storage internals", async () => {
    install({
      paymentRow: { id: PAYMENT_ID, invoice_url: "stored" },
      signError: { message: "Object not found: invoices/secret-internal-path.pdf" },
    });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.ok(
      !JSON.stringify(body).includes("secret-internal-path"),
      "storage error detail must stay in the server log"
    );
  });

  it("404s on a database error rather than surfacing the driver message", async () => {
    install({
      paymentRow: null,
      queryError: { message: 'relation "payments" does not exist' },
    });
    const GET = await loadRoute();

    const res = await GET(request(), { params: Promise.resolve({ id: PAYMENT_ID }) });
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.ok(!JSON.stringify(body).includes("relation"));
  });
});
