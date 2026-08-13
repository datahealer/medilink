/**
 * Shared guards for the phone-linking routes: normalisation, country policy, duplicate
 * ownership and rate limiting.
 *
 * Kept out of the route files so `start` and `check` provably apply the SAME rules. The
 * previous custom OTP routes drifted precisely because each re-implemented its own phone
 * resolution and cooldown (`send-otp` used crypto.randomInt and 5 minutes, `resend-otp`
 * used Math.random and 10) — one shared module makes that class of divergence impossible.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";
import { PHONE_COUNTRIES, phoneE164, type PhoneCountry } from "@medilink/shared";

/**
 * Countries MediLink serves. Oman is the market; India is supported because the team tests
 * there and patients travel.
 *
 * An allow-list, not a free-for-all: every accepted country is an SMS destination we pay
 * for, and an unbounded list is an invitation to pump traffic to expensive routes.
 */
export const ALLOWED_PHONE_COUNTRIES: PhoneCountry[] = [PHONE_COUNTRIES.OM, PHONE_COUNTRIES.IN];

export type PhoneRejection = "invalid" | "unsupported_country";

/**
 * Client input → canonical E.164, or a rejection reason.
 *
 * Normalisation is done SERVER-SIDE and the client's string is never trusted, even though
 * the mobile app normalises too. The client check is UX; this one is the rule. A number
 * that reaches Twilio in the wrong shape is either an undeliverable SMS we still pay for,
 * or — worse — a deliverable SMS to the wrong handset.
 */
export function normalisePhone(
  input: unknown
): { ok: true; phone: string } | { ok: false; reason: PhoneRejection } {
  if (typeof input !== "string" || !input.trim()) return { ok: false, reason: "invalid" };
  const raw = input.trim();

  // Try each allowed country. `phoneE164` returns null unless the local part is exactly the
  // right length for that country (+968 → 8 digits, +91 → 10), so a number cannot be
  // silently coerced into a different country's shape.
  for (const country of ALLOWED_PHONE_COUNTRIES) {
    if (raw.startsWith(country.dialCode)) {
      const e164 = phoneE164(raw, country);
      if (e164) return { ok: true, phone: e164 };
      return { ok: false, reason: "invalid" };
    }
  }

  // A "+" with an unrecognised calling code is a real number we simply do not serve —
  // distinct from a malformed one, and worth a different message.
  if (raw.startsWith("+")) return { ok: false, reason: "unsupported_country" };
  return { ok: false, reason: "invalid" };
}

/**
 * Is this number already owned by a DIFFERENT account?
 *
 * ── THIS IS A PRE-FLIGHT, NOT THE GUARANTEE ──
 *
 * The authoritative protection is the UNIQUE constraint on `auth.users.phone`: the Admin
 * API write in `check` fails atomically if another user holds the number, with no
 * time-of-check/time-of-use window. Supabase's own documentation confirms the constraint
 * exists ("Unlike the `phone` column, the `phone_change` column does not enforce
 * uniqueness").
 *
 * This check exists for two lesser but real reasons: it produces a comprehensible error
 * instead of a raw Postgres uniqueness violation, and it refuses BEFORE we pay Twilio to
 * send an SMS that could never be usefully completed.
 *
 * It reads `profiles` (a mirror) rather than `auth.users` because the auth schema is not
 * reachable through PostgREST and `admin.listUsers` is O(n) paginated. A mirror is
 * adequate for a pre-flight; it is explicitly NOT adequate as the guarantee, which is why
 * it is not relied on as one.
 */
export async function phoneOwnedByAnotherUser(
  service: SupabaseClient<Database>,
  phone: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await service
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .eq("phone_verified", true)
    .neq("id", userId)
    .limit(1);
  // Fail OPEN on a query error: the unique constraint still protects correctness, and
  // failing closed here would make an unrelated database hiccup look like "this number is
  // taken", which is both wrong and unactionable for the patient.
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * In-memory sliding-window limiter, keyed by user AND by phone.
 *
 * ⚠️ PER-INSTANCE. On serverless this is bypassable by spreading requests across
 * instances — the same documented limitation as the 2FA limiter in
 * `api/auth/2fa/verify/route.ts`, and it is why Twilio Verify's own per-number throttle is
 * the real backstop rather than this. Recorded as the durable-store item in the backend
 * hardening plan; a shared counter (Redis/Upstash or a DB table) replaces this one map.
 *
 * Two keys, not one: per-user stops an authenticated account being used as an SMS pump,
 * per-phone stops many accounts being pointed at one victim's handset.
 */
interface Window {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Window>();

export interface RateRule {
  max: number;
  windowMs: number;
}
export const PER_USER_SENDS: RateRule = { max: 3, windowMs: 15 * 60 * 1000 };
export const PER_PHONE_SENDS: RateRule = { max: 5, windowMs: 60 * 60 * 1000 };

/** Returns true when the caller is WITHIN the limit (and records the hit). */
export function withinLimit(key: string, rule: RateRule, now: number = Date.now()): boolean {
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  if (entry.count >= rule.max) return false;
  entry.count += 1;
  return true;
}

/** Test seam — the map is module state and would otherwise leak between cases. */
export function __resetRateLimits(): void {
  buckets.clear();
}
