import { NextResponse } from "next/server";

/**
 * Maps errors thrown by the auth guards (getUserOrThrow / getAal2UserOrThrow
 * in `@/lib/auth/api`) to their correct HTTP status code.
 *
 * Returns a ready NextResponse for a KNOWN auth error, or `null` for anything
 * else — so the caller falls through to its own existing generic 500 handling
 * unchanged.
 *
 * `shape` preserves each route's existing JSON body convention:
 *   "error"   -> { error: <message> }                  (default)
 *   "success" -> { success: false, error: <message> }  (2FA / upload routes)
 */
const AUTH_ERROR_STATUS: Record<string, number> = {
  Unauthorized: 401,
  "2FA verification required": 403,
};

export function authErrorResponse(
  err: unknown,
  shape: "error" | "success" = "error"
): NextResponse | null {
  const message = err instanceof Error ? err.message : "";
  const status = AUTH_ERROR_STATUS[message];
  if (!status) return null;

  const body =
    shape === "success"
      ? { success: false, error: message }
      : { error: message };

  return NextResponse.json(body, { status });
}
