import { NextResponse } from "next/server";

/**
 * The generic 500 every route falls through to, with the diagnostic kept SERVER-SIDE.
 *
 * ── WHY THIS EXISTS ──
 *
 * Nineteen routes ended with:
 *
 *     return NextResponse.json({ error: err.message }, { status: 500 });
 *
 * `err.message` on a failed Supabase/Postgres call is not a sentence for a patient — it is
 * the database describing itself. Real examples of what that shape leaks:
 *
 *     new row violates row-level security policy for table "patient_documents"
 *     duplicate key value violates unique constraint "uq_appointment_slot"
 *     column profiles.phone_verified does not exist
 *
 * That hands an attacker the table names, column names, constraint names and RLS topology
 * of a database holding patient records, and hands an ordinary patient a message they can
 * do nothing with. Provider errors (Thawani, Groq, Microsoft) are worse still: they can
 * echo request context back.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * It does not remove logging. Operational diagnosis was the reason the original pattern
 * existed, so the full error still reaches the server log, tagged with the route — the only
 * change is that the log is the ONLY place it goes.
 *
 * It also does not touch `authErrorResponse`, which is already correct: known auth errors
 * carry deliberate, safe messages ("Unauthorized") and keep their specific status codes.
 * The intended composition in a route is unchanged:
 *
 *     const authRes = authErrorResponse(err);
 *     if (authRes) return authRes;
 *     return serverErrorResponse(err, "payments/checkout");
 */

/**
 * `shape` mirrors `authErrorResponse` so a route's existing JSON contract is preserved:
 *   "error"   -> { error: "..." }                  (default)
 *   "success" -> { success: false, error: "..." }  (2FA / upload routes)
 */
export type ErrorShape = "error" | "success";

/** Single client-facing string. Deliberately identical for every internal failure — a 500 that varies by cause is an oracle. */
const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Extract everything useful for a log line without assuming the error's type.
 * PostgrestError carries `code`/`details`/`hint`; a plain Error carries `message`/`stack`.
 */
function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return [err.name, code && `code=${code}`, err.message].filter(Boolean).join(" ");
  }
  if (err && typeof err === "object") {
    const e = err as { code?: string; message?: string; details?: string };
    return [e.code && `code=${e.code}`, e.message, e.details].filter(Boolean).join(" ");
  }
  return String(err);
}

/**
 * Log the real error against `route`, return a generic 500 to the client.
 *
 * @param route stable identifier for the log line, e.g. "payments/checkout". Not derived
 *              from the request, so it cannot be influenced by a caller.
 */
export function serverErrorResponse(
  err: unknown,
  route: string,
  shape: ErrorShape = "error"
): NextResponse {
  // Full detail, server-side only. `console.error` is what the rest of the backend uses and
  // is what Vercel captures.
  console.error(`[${route}] unhandled:`, describe(err));
  if (err instanceof Error && err.stack) console.error(`[${route}] stack:`, err.stack);

  const body =
    shape === "success"
      ? { success: false, error: GENERIC_MESSAGE }
      : { error: GENERIC_MESSAGE };

  return NextResponse.json(body, { status: 500 });
}

/** Exported for tests asserting no route returns a database string. */
export const GENERIC_ERROR_MESSAGE = GENERIC_MESSAGE;
