import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * The server-to-server guard on the four report-generating Edge Functions.
 *
 * ── THE DISCLOSURE THIS PINS ──
 *
 * `generate-patient-report` took its subject straight from the request body and ran the query
 * with the service role, which bypasses RLS:
 *
 *     const { patient_id, created_by } = await req.json();
 *     createClient(URL, SUPABASE_SERVICE_ROLE_KEY)
 *
 * with NO caller identity check, NO ownership check and NO role check. The HTTP routes in front
 * of it authorize correctly, but an Edge Function is independently addressable — so any holder of
 * any valid JWT could invoke it directly and skip the route. MediLink patients and HAMS staff
 * share one Supabase Auth project, so "any holder" included every patient. Passing an arbitrary
 * `patient_id` rendered that patient's name, date of birth, blood group, gender, medical
 * histories and appointments into a PDF and published it to a world-readable bucket at a
 * deterministic path. `created_by` was attacker-supplied, so the audit row was forgeable too.
 *
 * The guard asserts the caller holds the service role key. These tests are the reason it cannot
 * quietly regress into "warn and continue", which is how the Thawani webhook gate was once wrong.
 *
 * The module is Deno source, so `globalThis.Deno` is stubbed before each call. No cache-busting
 * re-import is needed — and none is possible here, because the backend loader hook only carries a
 * `?query` through for `@/` specifiers, not for relative ones. It is unnecessary anyway:
 * `requireInternalCaller` reads `Deno.env.get(...)` inside its own body rather than at module
 * scope, so re-stubbing the global between calls is enough to change what it sees.
 */

/** Build a JWT-shaped token whose payload carries the given claims. Signature is irrelevant here:
 *  the platform validates it before our code runs (see the verify_jwt invariant in the module). */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.SIGNATURE`;
}

/** What the Edge runtime injects — deliberately NOT equal to the caller's credential, which is
 *  the production behaviour that broke the first version of this guard. */
const INJECTED_KEY = "INJECTED-CREDENTIAL-FIXTURE-not-a-real-key";
const SERVICE_KEY = jwt({ role: "service_role", ref: "proj", iss: "supabase" });
const USER_JWT = jwt({ role: "authenticated", sub: "user-1" });
const ANON_KEY = jwt({ role: "anon", ref: "proj" });

interface Guard {
  requireInternalCaller: (req: Request, fn: string) => Response | null;
  isUuid: (v: unknown) => boolean;
  REPORT_SIGNED_URL_TTL_SECONDS: number;
}

const guardModule = import("../../../../../supabase/functions/_shared/internalAuth") as unknown as Promise<Guard>;

/** Point the guard at a given fake Deno environment, then hand it back. */
async function load(env: Record<string, string | undefined>): Promise<Guard> {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => env[k] },
  };
  return guardModule;
}

const req = (auth?: string) =>
  new Request("https://edge.test/generate-patient-report", {
    method: "POST",
    headers: auth === undefined ? {} : { Authorization: auth },
  });

let warned: unknown[][] = [];
let errored: unknown[][] = [];

beforeEach(() => {
  warned = [];
  errored = [];
  console.warn = (...a: unknown[]) => void warned.push(a);
  console.error = (...a: unknown[]) => void errored.push(a);
});

describe("requireInternalCaller — refuses everyone but our own backend", () => {
  it("ACCEPTS a bearer byte-identical to the injected credential", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(`Bearer ${INJECTED_KEY}`), "fn"), null);
  });

  it("ACCEPTS a service_role JWT even when it differs from the injected value", async () => {
    /**
     * The regression that reached production. The first guard only compared bytes, and on this
     * project the value the Edge runtime injects is NOT the credential the routes send — so a
     * genuine service-role call was refused 401 and report generation broke. Verified live: the
     * same key that listed the private bucket and signed a URL was rejected by the function.
     */
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(`Bearer ${SERVICE_KEY}`), "fn"), null);
  });

  it("REFUSES an ordinary authenticated user's JWT — the actual attack", async () => {
    // The whole vulnerability: a signed-in patient invoking the function directly.
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(`Bearer ${USER_JWT}`), "fn")?.status, 401);
  });

  it("REFUSES the publishable anon key", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(`Bearer ${ANON_KEY}`), "fn")?.status, 401);
  });

  it("REFUSES any role other than service_role, including invented ones", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const role of ["authenticated", "anon", "admin", "super_admin", "SERVICE_ROLE", "", "postgres"]) {
      assert.equal(
        g.requireInternalCaller(req(`Bearer ${jwt({ role })}`), "fn")?.status,
        401,
        `role=${JSON.stringify(role)} must be refused`
      );
    }
  });

  it("REFUSES a token with no role claim, and a non-string role", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const claims of [{}, { sub: "x" }, { role: 1 }, { role: null }, { role: ["service_role"] }]) {
      assert.equal(g.requireInternalCaller(req(`Bearer ${jwt(claims)}`), "fn")?.status, 401, JSON.stringify(claims));
    }
  });

  it("REFUSES a malformed token that merely CONTAINS the words service_role", async () => {
    // Substring matching would be a bypass; the claim must be parsed, not searched for.
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const t of ["service_role", "a.service_role.c", "not.a.jwt", "..", "x.y", "eyJ.eyJ.z"]) {
      assert.equal(g.requireInternalCaller(req(`Bearer ${t}`), "fn")?.status, 401, t);
    }
  });

  it("REFUSES a missing Authorization header", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(), "fn")?.status, 401);
  });

  it("REFUSES an empty or whitespace-only bearer", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const h of ["Bearer ", "Bearer    ", "Bearer"]) {
      assert.equal(g.requireInternalCaller(req(h), "fn")?.status, 401, h);
    }
  });

  it("REFUSES the right key under the wrong scheme", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const h of [INJECTED_KEY, `Basic ${INJECTED_KEY}`, `bearer ${INJECTED_KEY}`]) {
      assert.equal(g.requireInternalCaller(req(h), "fn")?.status, 401, h);
    }
  });

  it("REFUSES a near-miss, so a truncated comparison cannot pass", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.requireInternalCaller(req(`Bearer ${INJECTED_KEY.slice(0, -1)}`), "fn")?.status, 401);
    assert.equal(g.requireInternalCaller(req(`Bearer ${INJECTED_KEY}x`), "fn")?.status, 401);
  });

  it("FAILS CLOSED with 503 when the key is not configured", async () => {
    // Never "warn and process anyway" — that is exactly how the Thawani webhook gate was wrong.
    const g = await load({});
    assert.equal(g.requireInternalCaller(req(`Bearer ${SERVICE_KEY}`), "fn")?.status, 503);
  });

  it("does not let an empty key match an empty bearer", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: "" });
    // An empty variable is unconfigured, so this must be 503 — not a lucky bypass.
    assert.equal(g.requireInternalCaller(req("Bearer "), "fn")?.status, 503);
  });
});

describe("the refusal leaks nothing", () => {
  it("never returns the key, the token, or the reason", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    const res = g.requireInternalCaller(req(`Bearer ${USER_JWT}`), "fn")!;
    const body = await res.text();
    assert.ok(!body.includes(SERVICE_KEY), "must not echo the service key");
    assert.ok(!body.includes(USER_JWT), "must not echo the caller's token");
    assert.ok(!body.includes("SERVICE_ROLE"), "must not name the variable");
    assert.equal(body, JSON.stringify({ error: "Unauthorized" }));
  });

  it("never logs the key or the presented token", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    g.requireInternalCaller(req(`Bearer ${USER_JWT}`), "fn");
    const logged = JSON.stringify(warned) + JSON.stringify(errored);
    assert.ok(!logged.includes(SERVICE_KEY));
    assert.ok(!logged.includes(USER_JWT));
  });

  it("logs the refusal, so a bypass attempt is never silent", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    g.requireInternalCaller(req(`Bearer ${USER_JWT}`), "generate-patient-report");
    assert.equal(warned.length, 1);
    assert.match(String(warned[0]?.[0]), /generate-patient-report/);
  });
});

describe("isUuid — an id must never be able to be a storage path", () => {
  it("accepts a canonical uuid", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.equal(g.isUuid("aaaa1111-2222-4333-8444-555566667777"), true);
  });

  it("rejects path traversal and separators outright", async () => {
    // The value is interpolated straight into `patients/<id>/medical-history.pdf`.
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    for (const bad of [
      "../../etc/passwd",
      "aaaa1111-2222-4333-8444-555566667777/../../other",
      "aaaa1111-2222-4333-8444-555566667777/x",
      "..",
      "a/b",
    ]) {
      assert.equal(g.isUuid(bad), false, bad);
    }
  });

  it("rejects non-strings, empties and near-misses", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    const bads: unknown[] = [
      undefined, null, 0, 1, {}, [], true, "",
      "aaaa1111-2222-4333-8444-55556666777",
      "aaaa1111-2222-4333-8444-5555666677778",
      "aaaa1111_2222_4333_8444_555566667777",
      "gggg1111-2222-4333-8444-555566667777",
    ];
    for (const bad of bads) {
      assert.equal(g.isUuid(bad), false, JSON.stringify(bad));
    }
  });
});

describe("signed URL lifetime", () => {
  it("is short, because the caller redirects to it immediately", async () => {
    const g = await load({ SUPABASE_SERVICE_ROLE_KEY: INJECTED_KEY });
    assert.ok(g.REPORT_SIGNED_URL_TTL_SECONDS > 0);
    assert.ok(
      g.REPORT_SIGNED_URL_TTL_SECONDS <= 900,
      "a link to a medical record must not be long-lived"
    );
  });
});
