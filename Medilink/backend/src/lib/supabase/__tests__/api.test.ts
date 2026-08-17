import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * createApiSupabaseClient — how a request's identity reaches Supabase.
 *
 * ── WHY THIS SUITE EXISTS ──
 *
 * This function is the single seam through which every authenticated backend route learns
 * who is calling. It supports two transports:
 *
 *   Authorization: Bearer <jwt>   how mobile authenticates
 *   cookies                       how a SAME-ORIGIN web app authenticates
 *
 * The web app shipped using only the second, while the backend is deployed on a DIFFERENT
 * origin (medilink-backend-five.vercel.app vs the frontend's domain). `@supabase/ssr` sets
 * host-only cookies on the frontend's domain, so the backend received none and every
 * authenticated call answered 401 -- with a healthy CORS preflight, because
 * Access-Control-Allow-Credentials only permits sending cookies the browser already has for
 * that host; it cannot create any. The fix was client-side (frontend/src/lib/backendFetch.ts
 * now attaches the token), and these tests pin the backend behaviour that fix depends on.
 *
 * The property asserted: **when a bearer token is present it is forwarded to Supabase, and
 * cookies are NOT consulted.** If a refactor reversed that precedence, mobile and the
 * now-fixed web app would both silently fall back to cookies that do not exist, and the
 * 401 would return with no failing test anywhere.
 *
 * These are also the tests that would have caught the original bug had they existed: the
 * cookie branch is only correct for a same-origin deployment, which is now documented here.
 */

interface Captured {
  url: string;
  anonKey: string;
  globalHeaders: Record<string, string> | undefined;
  cookiesRead: boolean;
}

const captured: Captured[] = [];
let cookieStoreEntries: Array<{ name: string; value: string }> = [];

function installMocks() {
  mock.module("@supabase/ssr", {
    namedExports: {
      createServerClient: (url: string, anonKey: string, opts: Record<string, unknown>) => {
        const globalOpt = opts.global as { headers?: Record<string, string> } | undefined;
        const cookiesOpt = opts.cookies as { getAll?: () => unknown } | undefined;
        // Calling getAll() is how we detect whether this client is cookie-backed.
        let cookiesRead = false;
        const probe = cookiesOpt?.getAll?.();
        if (Array.isArray(probe) && probe.length > 0) cookiesRead = true;
        captured.push({
          url,
          anonKey,
          globalHeaders: globalOpt?.headers,
          cookiesRead,
        });
        return { __client: true } as unknown;
      },
    },
  });

  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({
        getAll: () => cookieStoreEntries,
        set: () => {},
      }),
    },
  });
}

async function load() {
  const mod = await import(`@/lib/supabase/api?t=${Math.random()}`);
  return mod.createApiSupabaseClient as (req: unknown) => Promise<unknown>;
}

function reqWith(headers: Record<string, string>) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (n: string) => lower.get(n.toLowerCase()) ?? null } };
}

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig";

beforeEach(() => {
  mock.reset();
  captured.length = 0;
  cookieStoreEntries = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-value";
  installMocks();
});

after(() => mock.reset());

describe("bearer token transport (mobile, and now web)", () => {
  it("forwards the token to Supabase as an Authorization header", async () => {
    const create = await load();
    await create(reqWith({ Authorization: `Bearer ${TOKEN}` }));

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!.globalHeaders?.Authorization, `Bearer ${TOKEN}`);
  });

  it("also sends the anon apikey, which Supabase requires alongside a user JWT", async () => {
    const create = await load();
    await create(reqWith({ Authorization: `Bearer ${TOKEN}` }));

    assert.equal(captured[0]!.globalHeaders?.apikey, "anon-key-value");
  });

  it("accepts a lowercase `authorization` header — fetch normalises casing", async () => {
    const create = await load();
    await create(reqWith({ authorization: `Bearer ${TOKEN}` }));

    assert.equal(captured[0]!.globalHeaders?.Authorization, `Bearer ${TOKEN}`);
  });

  it("does NOT consult cookies when a bearer token is present", async () => {
    // The precedence that makes the web fix work: a cross-origin request has no usable
    // cookies, so the header must win outright rather than being merged or overridden.
    cookieStoreEntries = [{ name: "sb-ref-auth-token", value: "stale-cookie-session" }];
    const create = await load();
    await create(reqWith({ Authorization: `Bearer ${TOKEN}` }));

    assert.equal(captured[0]!.cookiesRead, false, "cookies must be ignored when a token is sent");
  });
});

describe("cookie transport (same-origin web only)", () => {
  it("falls back to the cookie store when there is no Authorization header", async () => {
    cookieStoreEntries = [{ name: "sb-ref-auth-token", value: "session" }];
    const create = await load();
    await create(reqWith({}));

    assert.equal(captured[0]!.globalHeaders, undefined, "no bearer header should be set");
    assert.equal(captured[0]!.cookiesRead, true);
  });

  it("still builds a client when the cookie store is EMPTY — the 401 comes later", async () => {
    // This is precisely the deployed cross-origin case: a client is constructed, but it
    // carries no session, so `auth.getUser()` returns null and the route's guard throws
    // "Unauthorized". Asserted so the failure mode is documented rather than mysterious.
    cookieStoreEntries = [];
    const create = await load();
    const client = await create(reqWith({}));

    assert.ok(client, "a client is returned even with no session");
    assert.equal(captured[0]!.globalHeaders, undefined);
  });
});

describe("malformed Authorization headers fall through to cookies", () => {
  it("ignores a header that is not a Bearer scheme", async () => {
    for (const bad of ["Basic dXNlcjpwYXNz", "Token abc", "bearer-no-space", ""]) {
      mock.reset();
      captured.length = 0;
      installMocks();
      const create = await load();
      await create(reqWith(bad ? { Authorization: bad } : {}));
      assert.equal(
        captured[0]!.globalHeaders,
        undefined,
        `"${bad}" must not be treated as a bearer token`
      );
    }
  });
});
