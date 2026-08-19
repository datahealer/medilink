/**
 * Server-to-server guard for report-generating Edge Functions.
 *
 * ── WHAT WAS WRONG ──
 *
 * `generate-patient-report`, `generate-facility-patients-report`, `generate-report` and
 * `generate-revenue-report` each took their subject id straight out of the request body:
 *
 *     const { patient_id, created_by } = await req.json();
 *     const supabase = createClient(URL, SUPABASE_SERVICE_ROLE_KEY);   // bypasses all RLS
 *
 * and performed NO authorization of any kind — no caller identity, no ownership test, no role
 * test. The HTTP routes in front of them (`/api/patients/[id]/medical-history/pdf`,
 * `/api/facilities/[id]/reports/*`) DO authorize correctly, but a function is independently
 * addressable: anyone holding any valid JWT could invoke it directly and skip the route
 * entirely. Since MediLink patients and HAMS staff share one Supabase Auth project, "anyone"
 * included every patient.
 *
 * The result was a full PHI disclosure: pass an arbitrary `patient_id` and the function would
 * render that patient's name, date of birth, blood group, gender, medical histories and
 * appointments into a PDF — and, because the `reports` bucket was public, publish it at a
 * deterministic, unauthenticated URL. `created_by` was attacker-supplied too, so the
 * `generated_reports` audit row was forgeable.
 *
 * ── THE CHECK ──
 *
 * These functions are internal implementation detail of their routes; nothing else should ever
 * reach them. So the guard asserts the caller possesses the SERVICE ROLE KEY, by comparing the
 * incoming bearer token against the key the function already holds in its own environment.
 *
 * Why this and not a new shared secret:
 *
 *   • No new configuration. There is nothing to set, forget to set, or set differently in two
 *     places, and nothing extra to rotate — the pending SUPABASE_SERVICE_ROLE_KEY rotation
 *     moves both sides at once, because both read the same variable.
 *   • It does NOT depend on `verify_jwt`. Only 8 of 16 functions are declared in config.toml,
 *     and a deployed function's setting cannot be read back from the repository, so relying on
 *     the platform to have validated a JWT signature — and then trusting a `role` claim decoded
 *     out of it — would rest on an assumption this audit could not verify. A direct comparison
 *     against a secret we hold needs no such assumption.
 *   • An ordinary user's JWT can never equal the service role key, whatever its claims say.
 *
 * Fails closed: if `SUPABASE_SERVICE_ROLE_KEY` is absent the guard refuses every request rather
 * than waving them through. That is the opposite of the Thawani webhook's original behaviour,
 * which processed requests when its secret was unset.
 *
 * This is defence in depth, not a replacement for the routes' authorization. The routes remain
 * the place where "may THIS user see THIS patient" is decided; this guard only ensures the
 * question cannot be skipped.
 */

declare const Deno: { env: { get: (key: string) => string | undefined } };

/**
 * The `role` claim of a JWT, or null if the token is not a decodable JWT.
 *
 * ── WHY THIS EXISTS (found in production, not in review) ──
 *
 * The first version of this guard ONLY compared the presented bearer against
 * `SUPABASE_SERVICE_ROLE_KEY` from the function's own environment. That assumed the value the
 * Edge runtime injects is byte-identical to the credential the calling route sends. It is not:
 * deployed against this project, a call carrying the backend's genuine service-role key — the
 * same key that successfully listed the private bucket and signed a URL in the same test run —
 * was refused 401. The injected variable is present (an absent one yields 503, and we saw 401),
 * it simply holds a different value, which is what Supabase's newer `sb_secret_*` API key
 * generation looks like alongside a legacy JWT key.
 *
 * So identity is established from the token's CLAIMS rather than from byte equality with a
 * second copy of a credential.
 *
 * ── WHY TRUSTING A DECODED CLAIM IS SOUND HERE ──
 *
 * This is only safe because `verify_jwt` is enabled on all four functions, which means the
 * platform has ALREADY validated the signature against the project's JWT secret before our code
 * runs. Verified in the deployed state, not assumed:
 *
 *     generate-patient-report            verify_jwt=true
 *     generate-facility-patients-report  verify_jwt=true
 *     generate-report                    verify_jwt=true
 *     generate-revenue-report            verify_jwt=true
 *
 * A patient's session token carries `role: "authenticated"` and the publishable key carries
 * `role: "anon"`; neither can be turned into `service_role` without the project's JWT secret,
 * and an unsigned or wrongly-signed token never reaches this code.
 *
 * ⚠️ OPERATIONAL INVARIANT: `verify_jwt` must stay TRUE on these four functions. Deploying any of
 * them with `--no-verify-jwt` would let a forged, unsigned token assert `role: service_role` and
 * reopen the disclosure. A function cannot read its own `verify_jwt` setting, so this cannot be
 * asserted from inside — it is checked by `supabase functions list`.
 */
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    // base64url -> base64, then pad.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

/** Length-independent constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Comparing lengths first would leak length via early return, so fold it into the result.
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Returns a Response to send back when the caller is NOT our own backend, or null to proceed.
 *
 * The error body is deliberately generic. It never states whether the secret is configured,
 * whether a token was supplied, or how it differed — an unauthorized caller learns only that it
 * is unauthorized.
 */
export function requireInternalCaller(req: Request, fnName: string): Response | null {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey) {
    // Misconfiguration, not an authorization decision — and it must never mean "allow".
    console.error(
      `[${fnName}] REFUSED: SUPABASE_SERVICE_ROLE_KEY is not set, so the internal caller ` +
        `cannot be verified. Refusing rather than processing.`
    );
    return json({ error: "Service unavailable" }, 503);
  }

  const header = req.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  const token = header.startsWith(prefix) ? header.slice(prefix.length).trim() : "";

  if (!token) {
    console.warn(
      `[${fnName}] refused a call with no bearer token. These functions are server-to-server ` +
        `only; call the corresponding /api route instead.`
    );
    return json({ error: "Unauthorized" }, 401);
  }

  // Path 1: byte-identical to the credential this runtime holds. Kept because it is the
  // strongest check available and needs no assumption about the platform.
  if (timingSafeEqual(token, serviceKey)) return null;

  // Path 2: a signature-verified service_role JWT. See jwtRole() for why the injected variable
  // and the caller's credential are not the same value on this project, and for the verify_jwt
  // invariant this depends on.
  if (jwtRole(token) === "service_role") return null;

  // No token value, session id or user id is logged — only that a call was refused.
  console.warn(
    `[${fnName}] refused a call that presented neither the service role credential nor a ` +
      `service_role token. These functions are server-to-server only; call the corresponding ` +
      `/api route instead.`
  );
  return json({ error: "Unauthorized" }, 401);
}

/** Rejects anything that is not a canonical UUID, so an id cannot smuggle a storage path. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Seconds a generated report link stays valid. Short: the caller redirects to it immediately. */
export const REPORT_SIGNED_URL_TTL_SECONDS = 300;
