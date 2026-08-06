/**
 * Redirect allow-listing (shared/src/utils/safeNext.ts).
 *
 * Lives in mobile/ because it is the only workspace with a Jest runner; the module
 * itself is consumed by the Next.js frontend (`/auth/callback`, `/sign-in`). Same
 * arrangement as the shared payments tests — see jest.config.js.
 */
import { safeNextPath } from "@medilink/shared/mobile";

const FALLBACK = "/dashboard";

describe("safeNextPath", () => {
  describe("accepts same-origin absolute paths", () => {
    it.each([
      "/dashboard",
      "/dashboard/appointments",
      "/dashboard/setup",
      "/dashboard/find-doctors/123",
      "/dashboard?tab=upcoming",
      "/dashboard#section",
      "/a",
    ])("keeps %p", (input) => {
      expect(safeNextPath(input, FALLBACK)).toBe(input);
    });
  });

  describe("rejects off-origin and malformed targets", () => {
    it.each([
      ["absolute https URL", "https://evil.example"],
      ["absolute http URL", "http://evil.example/path"],
      ["protocol-relative (browser reads this as a HOST)", "//evil.example"],
      ["backslash variant, normalised to // by WHATWG parsing", "/\\evil.example"],
      ["double backslash", "\\\\evil.example"],
      ["javascript: scheme", "javascript:alert(1)"],
      ["data: scheme", "data:text/html,<script>"],
      ["relative path (resolves against current dir, not root)", "dashboard"],
      ["empty string", ""],
      ["bare fragment", "#hash"],
      ["bare query", "?next=x"],
    ])("rejects %s", (_label, input) => {
      expect(safeNextPath(input, FALLBACK)).toBe(FALLBACK);
    });
  });

  it("rejects CR/LF (header-splitting defence in depth)", () => {
    expect(safeNextPath("/foo\r\n/bar", FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath("/foo\nSet-Cookie: x=1", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects NUL and other control characters", () => {
    expect(safeNextPath("/foo\u0000bar", FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath("/foo\u007F", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects whitespace, which browsers strip before resolving", () => {
    expect(safeNextPath("/ /evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath(" /dashboard", FALLBACK)).toBe(FALLBACK);
  });

  it("falls back for null/undefined", () => {
    expect(safeNextPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("returns the caller's fallback verbatim", () => {
    expect(safeNextPath(null, "/dashboard/setup")).toBe("/dashboard/setup");
  });
});
