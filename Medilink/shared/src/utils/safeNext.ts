/**
 * Post-authentication redirect validation.
 *
 * Every auth entry point carries a caller-supplied `next` (`/sign-in?next=…`,
 * `/auth/callback?next=…`). That value reaches `NextResponse.redirect()`, so it is an
 * open-redirect sink: a phishing link like `/sign-in?next=https://evil.example` gets
 * the victim to authenticate on the real MediLink domain and then bounces them to an
 * attacker page that looks like a continuation of the login.
 *
 * Rather than blocklisting, this allows exactly one shape: a single-slash, same-origin
 * ABSOLUTE PATH. Everything else collapses to the default.
 *
 * Rejected, and why each matters:
 *   "https://evil.example"   absolute URL — different origin
 *   "//evil.example"         protocol-relative; browsers resolve it as a HOST
 *   "/\evil.example"         WHATWG URL parsing normalises "\" to "/" for special
 *                            schemes, so this is "//evil.example" in disguise
 *   "javascript:alert(1)"    scheme-relative XSS sink
 *   "dashboard"              relative — resolves against the current path, not the root
 *   CR / LF inside the value  header-splitting defence in depth
 *
 * Dependency-free on purpose: it is imported by the Next.js edge/server runtime AND
 * covered by mobile's Jest suite (the only test runner in the monorepo), so it must not
 * pull in anything platform-specific.
 */

/** Absolute same-origin path: one leading slash, not followed by another slash or backslash. */
const SAFE_PATH = /^\/(?![/\\])\S*$/;

/**
 * True when the string contains a C0 control, DEL, or a C1 control.
 *
 * Written as a code-point scan rather than a regex character class on purpose: the
 * equivalent class has to embed raw control bytes or fragile escapes in the source
 * file, and both are easy to corrupt silently in review. This version is unambiguous.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Returns `next` when it is a safe same-origin path, otherwise `fallback`.
 *
 * @param next     untrusted value, typically from a query string
 * @param fallback where to send the user when `next` is absent or unsafe
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string
): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (hasControlChars(next)) return fallback;
  if (!SAFE_PATH.test(next)) return fallback;
  return next;
}
