/**
 * Tests for the Microsoft Entra client-credentials token helper.
 *
 * Runner: Node's built-in test runner, which executes TypeScript directly via type
 * stripping — no jest/vitest/babel dependency added to the backend for this.
 *
 *   cd backend && npm test
 *
 * `fetch` is stubbed on globalThis rather than injected, because the point is to verify the
 * real request shape the helper builds (URL, grant type, scope, body encoding) and not a
 * paraphrase of it through an abstraction.
 *
 * Imports carry an explicit `.ts` extension: Node's ESM resolver does no extension guessing.
 * Application code keeps extensionless imports so the Next build is unaffected.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  __resetTokenCacheForTests,
  describeTokenError,
  getAccessToken,
  invalidateAccessToken,
  readOAuthConfig,
  SMTP_OAUTH_SCOPE,
} from "../microsoftOAuth.ts";

const FULL_ENV = {
  MICROSOFT_TENANT_ID: "tenant-abc",
  MICROSOFT_CLIENT_ID: "client-abc",
  MICROSOFT_CLIENT_SECRET: "secret-value-never-logged",
};

const realFetch = globalThis.fetch;

/** Record every call so request shape and call COUNT can both be asserted. */
type Call = { url: string; body: URLSearchParams };
let calls: Call[] = [];

function stubFetch(
  responder: (call: Call, n: number) => { status: number; json: unknown }
): void {
  calls = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      body: new URLSearchParams(String(init?.body ?? "")),
    };
    calls.push(call);
    const { status, json } = responder(call, calls.length);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    } as Response;
  }) as typeof fetch;
}

function tokenResponse(accessToken: string, expiresIn = 3600) {
  return { status: 200, json: { access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" } };
}

beforeEach(() => {
  __resetTokenCacheForTests();
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ── 1. Token acquisition ─────────────────────────────────────────────────── */

test("acquires a token with the client-credentials grant and the Exchange scope", async () => {
  stubFetch(() => tokenResponse("token-1"));

  const result = await getAccessToken(FULL_ENV, 1_000_000);

  assert.equal(result.accessToken, "token-1");
  assert.equal(result.expiresAt, 1_000_000 + 3600 * 1000);
  assert.equal(calls.length, 1);

  const call = calls[0]!;
  assert.equal(
    call.url,
    "https://login.microsoftonline.com/tenant-abc/oauth2/v2.0/token",
    "must post to the tenant-scoped v2.0 token endpoint"
  );
  assert.equal(call.body.get("grant_type"), "client_credentials");
  assert.equal(call.body.get("client_id"), "client-abc");
  assert.equal(
    call.body.get("scope"),
    "https://outlook.office365.com/.default",
    "SMTP needs the Exchange Online resource — a Graph token is rejected"
  );
  assert.equal(SMTP_OAUTH_SCOPE, "https://outlook.office365.com/.default");
});

test("a missing expires_in yields a SHORT lifetime, never an assumed hour", async () => {
  // Guessing long here means authenticating with a dead token later.
  stubFetch(() => ({ status: 200, json: { access_token: "token-x" } }));
  const result = await getAccessToken(FULL_ENV, 0);
  assert.ok(result.expiresAt <= 600 * 1000, "should be conservative, not 3600s");
});

/* ── 2-4. Missing configuration, reported by NON-SECRET name ──────────────── */

for (const [label, key] of [
  ["tenant ID", "MICROSOFT_TENANT_ID"],
  ["client ID", "MICROSOFT_CLIENT_ID"],
  ["client secret", "MICROSOFT_CLIENT_SECRET"],
] as const) {
  test(`missing ${label} is reported by name and makes no network call`, async () => {
    stubFetch(() => tokenResponse("should-not-be-requested"));
    const env = { ...FULL_ENV, [key]: undefined };

    const parsed = readOAuthConfig(env);
    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.ok === false && parsed.missing, [key]);

    await assert.rejects(() => getAccessToken(env, 0), new RegExp(key));
    assert.equal(calls.length, 0, "must not call Microsoft when config is incomplete");
  });
}

test("a blank (whitespace-only) secret counts as missing", async () => {
  const parsed = readOAuthConfig({ ...FULL_ENV, MICROSOFT_CLIENT_SECRET: "   " });
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.ok === false && parsed.missing, ["MICROSOFT_CLIENT_SECRET"]);
});

test("all three missing are reported together, not one at a time", () => {
  const parsed = readOAuthConfig({});
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.ok === false && parsed.missing, [
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
  ]);
});

/* ── 5. Caching ───────────────────────────────────────────────────────────── */

test("caches the token — a second call inside its lifetime makes no new request", async () => {
  stubFetch((_c, n) => tokenResponse(`token-${n}`));

  const first = await getAccessToken(FULL_ENV, 0);
  const second = await getAccessToken(FULL_ENV, 60_000);

  assert.equal(first.accessToken, "token-1");
  assert.equal(second.accessToken, "token-1", "must reuse the cached token");
  assert.equal(calls.length, 1, "exactly one token request");
});

test("concurrent callers share ONE in-flight request", async () => {
  // A burst of appointment emails must not trigger a token request each — Entra rate-limits.
  stubFetch((_c, n) => tokenResponse(`token-${n}`));

  const [a, b, c] = await Promise.all([
    getAccessToken(FULL_ENV, 0),
    getAccessToken(FULL_ENV, 0),
    getAccessToken(FULL_ENV, 0),
  ]);

  assert.equal(calls.length, 1, "three concurrent callers, one request");
  assert.equal(a.accessToken, "token-1");
  assert.equal(b.accessToken, "token-1");
  assert.equal(c.accessToken, "token-1");
});

/* ── 6. Refresh before expiry (the requirement that matters most) ─────────── */

test("refreshes BEFORE expiry, using the safety margin", async () => {
  stubFetch((_c, n) => tokenResponse(`token-${n}`, 3600));

  const first = await getAccessToken(FULL_ENV, 0);
  assert.equal(first.accessToken, "token-1");
  assert.equal(first.expiresAt, 3600 * 1000);

  // 3500s in: not yet expired, but inside the 5-minute margin. Must refresh anyway —
  // handing out a token with seconds left is how a send fails mid-connection.
  const refreshed = await getAccessToken(FULL_ENV, 3_500_000);
  assert.equal(refreshed.accessToken, "token-2", "should have refreshed inside the margin");
  assert.equal(calls.length, 2);

  // Comfortably inside the new token's life → cached again.
  const cached = await getAccessToken(FULL_ENV, 3_600_000);
  assert.equal(cached.accessToken, "token-2");
  assert.equal(calls.length, 2, "no further request while fresh");
});

test("a token still outside the margin is NOT refreshed", async () => {
  stubFetch((_c, n) => tokenResponse(`token-${n}`, 3600));
  await getAccessToken(FULL_ENV, 0);
  // 3000s in — 600s left, outside the 300s margin.
  const still = await getAccessToken(FULL_ENV, 3_000_000);
  assert.equal(still.accessToken, "token-1");
  assert.equal(calls.length, 1);
});

test("invalidateAccessToken forces a fresh token on the next call", async () => {
  // This is the path nodemailer triggers via renew=true after an auth failure; without it a
  // revoked token would be replayed until the process restarted.
  stubFetch((_c, n) => tokenResponse(`token-${n}`, 3600));

  await getAccessToken(FULL_ENV, 0);
  assert.equal(calls.length, 1);

  invalidateAccessToken();

  const renewed = await getAccessToken(FULL_ENV, 1000);
  assert.equal(renewed.accessToken, "token-2", "renewal must bypass the cache");
  assert.equal(calls.length, 2);
});

test("a failed request is not cached — the next call retries", async () => {
  stubFetch((_c, n) =>
    n === 1
      ? { status: 401, json: { error: "invalid_client", error_description: "AADSTS7000215: bad secret" } }
      : tokenResponse("token-recovered")
  );

  await assert.rejects(() => getAccessToken(FULL_ENV, 0));
  const recovered = await getAccessToken(FULL_ENV, 0);
  assert.equal(recovered.accessToken, "token-recovered");
});

/* ── 7-8. No secret and no token may reach a log ──────────────────────────── */

test("no access token and no client secret appears in any console output", async () => {
  const SECRET = FULL_ENV.MICROSOFT_CLIENT_SECRET;
  const TOKEN = "super-secret-access-token-value";
  stubFetch(() => tokenResponse(TOKEN));

  const captured: string[] = [];
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  for (const key of Object.keys(originals) as (keyof typeof originals)[]) {
    console[key] = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  }
  try {
    const result = await getAccessToken(FULL_ENV, 0);
    assert.equal(result.accessToken, TOKEN);
    invalidateAccessToken();
    // And on the failure path, which is where a naive implementation dumps the response.
    __resetTokenCacheForTests();
    stubFetch(() => ({
      status: 400,
      json: { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided" },
    }));
    await assert.rejects(() => getAccessToken(FULL_ENV, 0));
  } finally {
    Object.assign(console, originals);
  }

  const all = captured.join("\n");
  assert.ok(!all.includes(TOKEN), "access token must never be logged");
  assert.ok(!all.includes(SECRET), "client secret must never be logged");
});

test("thrown error messages carry no secret and no token", async () => {
  const SECRET = FULL_ENV.MICROSOFT_CLIENT_SECRET;
  stubFetch(() => ({
    status: 401,
    json: {
      error: "invalid_client",
      // Simulate a provider echoing the secret back — the helper must not propagate it.
      error_description: `AADSTS7000215: Invalid client secret provided: ${SECRET}`,
    },
  }));

  const error = await getAccessToken(FULL_ENV, 0).then(
    () => null,
    (e: unknown) => e as Error
  );
  assert.ok(error, "should reject");
  assert.ok(
    !error!.message.includes(SECRET),
    "a mapped AADSTS message must be emitted instead of the raw description"
  );
  assert.match(error!.message, /AADSTS7000215/);
});

/* ── Error mapping ────────────────────────────────────────────────────────── */

test("maps the Microsoft error codes that matter to actionable text", () => {
  const cases: [string, RegExp][] = [
    ["AADSTS7000215", /invalid client secret/i],
    ["AADSTS700016", /application not found/i],
    ["AADSTS7000222", /EXPIRED/i],
    ["AADSTS900023", /tenant not found/i],
    ["AADSTS500011", /resource principal/i],
    ["AADSTS65001", /admin consent/i],
  ];
  for (const [code, expected] of cases) {
    const described = describeTokenError(401, {
      error: "invalid_client",
      error_description: `${code}: something went wrong\r\nTrace ID: x`,
    });
    assert.match(described, expected, `${code} should be explained`);
  }
});

test("an unrecognised error still produces a single-line, non-empty message", () => {
  const described = describeTokenError(500, { error: "temporarily_unavailable" });
  assert.equal(described, "temporarily_unavailable");
  assert.ok(!described.includes("\n"));
});

test("error_codes array is honoured, not just the description text", () => {
  const described = describeTokenError(401, { error: "invalid_client", error_codes: [7000215] });
  assert.match(described, /invalid client secret/i);
});
