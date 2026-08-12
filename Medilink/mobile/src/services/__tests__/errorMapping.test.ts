import { ApiError } from "../api";

/**
 * Error-message mapping (MED-016 follow-up).
 *
 * `toMessageKey` is module-private, so these assert against the SOURCE. That is deliberate
 * and not laziness: the defect being locked down is a missing branch in a chain of `if`s, and
 * the failure mode is a NEW status code silently falling through to the catch-all again. A
 * behavioural test would need the function exported purely for testing, and would still not
 * notice a future 409 landing on "errors.server".
 */
import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(__dirname, "..", "authService.ts"),
  "utf8"
);
const mapper = source.slice(
  source.indexOf("function toMessageKey"),
  source.indexOf("const e164 =")
);

describe("toMessageKey — status mapping (MED-016)", () => {
  it("maps a transport failure (ApiError status 0) to a NETWORK error, not a server error", () => {
    // apiFetch wraps a fetch rejection or its 20s timeout as ApiError(0) — there is no HTTP
    // response, so blaming the server is wrong and unactionable.
    expect(mapper).toMatch(/err\.status === 0\)\s*return "errors\.network"/);
  });

  it("maps 401/403 to a SESSION error, not a server error", () => {
    // The exact bug: cancel-deletion returned 401 because the delete request had just revoked
    // this device's session, and the screen said "Something went wrong on our side."
    //
    // Reuses the PRE-EXISTING `common.sessionExpired`, which ai/recommendations.tsx and
    // ai/schedule.tsx already show for a 401. An `errors.sessionExpired` duplicate was added
    // and then removed — one string, one key.
    expect(mapper).toMatch(/err\.status === 401 \|\| err\.status === 403\)\s*return "common\.sessionExpired"/);
  });

  it("still maps 5xx to a server error", () => {
    expect(mapper).toMatch(/err\.status >= 500\)\s*return "errors\.server"/);
  });

  it("orders the status checks BEFORE the catch-all, or they can never run", () => {
    const network = mapper.indexOf("err.status === 0");
    const session = mapper.indexOf("err.status === 401");
    const server5xx = mapper.indexOf("err.status >= 500");
    const catchAll = mapper.lastIndexOf('return "errors.server"');
    expect(network).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(-1);
    expect(network).toBeLessThan(catchAll);
    expect(session).toBeLessThan(catchAll);
    expect(server5xx).toBeLessThan(catchAll);
  });

  it("keeps the specific OTP/rate-limit branches ahead of the generic status checks", () => {
    // 429 must stay a rate-limit message even though it is also "not 5xx".
    expect(mapper.indexOf("errors.otpTooMany")).toBeLessThan(mapper.indexOf("err.status === 0"));
  });

  it("ApiError carries the status the mapping keys off", () => {
    // Guards the constructor contract the branches depend on.
    expect(new ApiError(401, "Unauthorized").status).toBe(401);
    expect(new ApiError(0, "Couldn't reach the API server").status).toBe(0);
  });
});

describe("common.sessionExpired — one key, both locales", () => {
  const read = (locale: string) =>
    fs.readFileSync(path.join(__dirname, "..", "..", "i18n", `${locale}.ts`), "utf8");

  it.each(["en", "ar"])("%s defines the key", (locale) => {
    expect(read(locale)).toMatch(/sessionExpired:\s*"/);
  });

  it("defines it EXACTLY ONCE per catalog — no errors.* duplicate", () => {
    for (const locale of ["en", "ar"]) {
      const hits = read(locale).match(/^\s*sessionExpired:\s*"/gm) ?? [];
      expect(hits).toHaveLength(1);
    }
  });

  it("the English copy tells the user to sign in again rather than to retry", () => {
    const en = read("en");
    const line = en.split(/\r?\n/).find((l) => l.includes("sessionExpired:")) ?? "";
    expect(line.toLowerCase()).toContain("sign in");
    expect(line.toLowerCase()).not.toContain("our side");
  });
});

describe("account deletion revokes OTHER devices only (MED-016)", () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      "..", "..", "..", "..",
      "backend", "src", "app", "api", "users", "me", "account", "route.ts"
    ),
    "utf8"
  );

  it('uses signOut scope "others", never "global"', () => {
    // "global" deletes the caller's own session too. A Supabase access token carries a
    // session_id claim that GoTrue validates, so the next request from THIS device — the
    // restore — was rejected with 401 while the token was seconds old.
    expect(route).toMatch(/admin\.signOut\(jwt, "others"\)/);
    expect(route).not.toMatch(/admin\.signOut\(jwt, "global"\)/);
  });

  it("still does not ban the user — the restore flow needs them able to sign in", () => {
    // Match an actual property assignment, not the word: the route deliberately DISCUSSES
    // ban_duration in a comment explaining why banning is the purge job's job.
    expect(route).not.toMatch(/ban_duration\s*:/);
    expect(route).not.toMatch(/updateUserById/);
  });
});
