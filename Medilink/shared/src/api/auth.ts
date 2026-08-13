// AUTHENTICATION — universal supabase-js auth calls shared by web + mobile.
// Signup + email-OTP verification + password recovery use official Supabase Auth
// directly from the client (no custom OTP table, no service-role signup): both
// platforms make these identical RLS-neutral calls. 2FA side-effects remain in
// `backend/` (staff-only). Profile rows are provisioned by the DB trigger on
// auth.users insert, so client signUp still creates the patient profile.
import type { Session, User } from "@supabase/supabase-js";

import { normalizeEmail, normalizeHumanText } from "../utils/normalize";
import type { DB } from "./client";

export async function signInWithPassword(
  db: DB,
  input: { email: string; password: string }
): Promise<{ user: User; session: Session }> {
  // Email is normalized; PASSWORD IS NOT. A leading/trailing space can be a deliberate
  // part of a password, and trimming it here would lock out anyone who set one — see the
  // note on `password` in utils/normalize.ts.
  const { data, error } = await db.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
  });
  if (error) throw error;
  // Supabase returns user+session on success for password grant.
  return { user: data.user, session: data.session };
}

/**
 * Create a new account via Supabase Auth. When the project has email confirmations
 * enabled, `session` is null and Supabase emails a verification OTP; the caller then
 * confirms it with `verifyEmailOtp({ type: "signup" })`. When confirmations are
 * disabled, a live `session` is returned and no email is sent. `data` becomes the
 * user's metadata (read by the `hams_handle_new_user` profile-provisioning trigger).
 */
export async function signUp(
  db: DB,
  input: { email: string; password: string; data?: Record<string, unknown> }
): Promise<{ user: User | null; session: Session | null }> {
  // `full_name` rides along in metadata and the `hams_handle_new_user` trigger copies it
  // straight into `profiles.full_name`, so a padded value here becomes a padded name on
  // every appointment and clinic record. Normalize it at this boundary; leave the rest of
  // `data` alone (callers own their own keys) and never touch `password`.
  const metadata = input.data ? { ...input.data } : undefined;
  if (metadata && typeof metadata.full_name === "string") {
    metadata.full_name = normalizeHumanText(metadata.full_name);
  }
  const { data, error } = await db.auth.signUp({
    email: normalizeEmail(input.email),
    password: input.password,
    options: metadata ? { data: metadata } : undefined,
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

/**
 * Verify an email OTP token. `type` is "signup" (confirm a new account) or "recovery"
 * (password reset). On success Supabase establishes a session on `db`.
 */
export async function verifyEmailOtp(
  db: DB,
  input: { email: string; token: string; type: "signup" | "recovery" | "email" }
): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await db.auth.verifyOtp({
    email: normalizeEmail(input.email),
    // OTP: remove whitespace only. Users paste "123 456" out of an email, and the digits
    // are the whole token — nothing else about the string is reinterpreted.
    token: input.token.replace(/\s+/g, ""),
    type: input.type,
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

/** Re-send the signup confirmation OTP email. */
export async function resendSignupOtp(db: DB, email: string): Promise<void> {
  const { error } = await db.auth.resend({ type: "signup", email: normalizeEmail(email) });
  if (error) throw error;
}

/**
 * F5 Login Simplification — passwordless EMAIL login. Sends a 6-digit login code to
 * an EXISTING account (`shouldCreateUser: false` so this never silently creates one —
 * signup is a separate flow). Verify with `verifyEmailOtp({ type: "email" })`.
 *
 * Enumeration-safe: with `shouldCreateUser: false` Supabase returns success for an
 * unknown email without sending a code, so the UI shows a neutral "if an account
 * exists, a code was sent" message (see F5 §7).
 *
 * The phone counterpart lives below (`signInWithPhoneOtp`) — same GoTrue endpoint,
 * different channel.
 */
export async function signInWithEmailOtp(db: DB, email: string): Promise<void> {
  const { error } = await db.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHONE OTP — Supabase Auth remains the ONLY identity and session provider.
//
// Delivery is Twilio Verify, configured as Supabase's SMS provider in the Supabase
// dashboard. That is the whole integration: NO Twilio SDK, NO Twilio credential and NO
// backend route exists in this repository, and none should ever be added here. GoTrue
// calls Twilio; we call GoTrue. If a Twilio Account SID or Auth Token ever appears in
// this file, the architecture has been broken.
//
// ── THREE FLOWS, THREE `verifyOtp` TYPES ──
//
// Getting the `type` wrong is the single most likely way this integration fails, because
// GoTrue returns a generic "Token has expired or is invalid" for a type mismatch:
//
//   login       signInWithOtp({ phone })   → verifyOtp({ type: "sms" })
//   link/change updateUser({ phone })      → verifyOtp({ type: "phone_change" })
//   signup      (NOT IMPLEMENTED — see below)
//
// ── WHY NOT `linkIdentity()` ──
//
// `linkIdentity()` links an **OAuth** identity (it takes `{ provider }` and drives PKCE).
// Phone is not an OAuth identity — there is no authorization server and no redirect — so
// it cannot attach a number. `updateUser({ phone })` is the sanctioned mechanism, and it
// is unaffected by the `enable_manual_linking` flag (which gates `linkIdentity` only).
//
// ── WHY PHONE-ONLY SIGNUP IS ABSENT ──
//
// `public.profiles.email` is NOT NULL (migration 20260429000002), and both provisioning
// triggers insert `NEW.email` verbatim. A phone-only signup leaves `auth.users.email`
// NULL, so the trigger raises 23502 and the entire signup transaction rolls back. Every
// function below therefore passes `shouldCreateUser: false`: the guarantee is enforced
// HERE, in code, not only by the dashboard's "enable phone signup" toggle — a toggle can
// be flipped by accident, and the failure mode would be an unusable half-created account.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reject anything that is not already canonical E.164.
 *
 * Normalisation is the CALLER's job (`phoneE164` in utils/normalize.ts, which is
 * country-aware for +968 and +91). This is a boundary assertion, not a converter: a
 * silently-coerced number is how a patient ends up receiving someone else's code, and
 * GoTrue's own error for a malformed number is too vague to debug from a bug report.
 */
function assertE164(phone: string): string {
  const value = phone.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error(`Phone number must be E.164 (e.g. +96891234567): received "${value}"`);
  }
  return value;
}

/**
 * PHONE LOGIN — send a 6-digit SMS code to an EXISTING account.
 *
 * Enumeration-safe by the same mechanism as the email flow: `shouldCreateUser: false`
 * makes GoTrue return success for an unknown number without sending anything, so the UI
 * can show one neutral "if an account exists, a code was sent" message either way.
 *
 * Verify with `verifyPhoneOtp` (`type: "sms"`).
 */
export async function signInWithPhoneOtp(db: DB, phone: string): Promise<void> {
  const { error } = await db.auth.signInWithOtp({
    phone: assertE164(phone),
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/**
 * PHONE LOGIN — verify the SMS code. On success GoTrue mints a full session
 * (access + refresh token) on `db`, identical in every respect to an email session, so
 * session restore, Remember Me, RLS and the `(app)` route gate all behave unchanged.
 */
export async function verifyPhoneOtp(
  db: DB,
  input: { phone: string; token: string }
): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await db.auth.verifyOtp({
    phone: assertE164(input.phone),
    // Same rule as the email OTP: strip whitespace only. Users paste "123 456" out of an
    // SMS and the digits are the entire token.
    token: input.token.replace(/\s+/g, ""),
    type: "sms",
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

/**
 * ── WHY THERE IS NO `startPhoneChange` / `verifyPhoneChange` HERE ──
 *
 * ATTACHING a phone to an existing account is deliberately NOT done from the client, and
 * the client-side `updateUser({ phone })` + `verifyOtp({ type: "phone_change" })` pair was
 * written and then REMOVED. Supabase documents the reason:
 *
 *   • `updateUser({ phone })` stages the number in `auth.users.phone_change`, not `phone`.
 *   • `auth.users.phone` is UNIQUE; **`phone_change` is not.**
 *   • At verification GoTrue resolves the user by SEARCHING `phone_change` for the
 *     submitted number — not by the active session — and updates the FIRST match.
 *
 * So an abandoned attempt by user A on a number, followed by a genuine attempt by its real
 * owner B, can confirm that number onto A's account. Supabase's own guidance ("Phone linked
 * to incorrect user ID") is server-side cleanup of stale rows and states there is no
 * client-side workaround. For an app holding PHI that is not an acceptable base to build on.
 *
 * MediLink therefore links phones through `POST /api/auth/phone/{start,check}`, which uses
 * Twilio Verify plus `admin.updateUserById(id, { phone, phone_confirm: true })` — an ATOMIC
 * write to an EXPLICIT user id that never touches `phone_change`. See
 * `backend/src/app/api/auth/phone/` and `mobile/src/services/authService.ts`.
 *
 * LOGIN is unaffected and stays client-side (`signInWithPhoneOtp` / `verifyPhoneOtp` above):
 * that path never writes `phone_change`.
 */

/**
 * Is the CURRENT user's phone number confirmed by Supabase itself?
 *
 * Reads `auth.users.phone_confirmed_at` — the source of truth. `profiles.phone_verified`
 * is a mirror that exists for RLS and display, and the two can drift (the retired
 * `verify-otp` backend route set the mirror without any real SMS ever being sent, so
 * legacy rows may claim verification that never happened).
 */
export async function getPhoneConfirmation(
  db: DB
): Promise<{ phone: string | null; confirmed: boolean }> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { phone: null, confirmed: false };
  const user = data.user as User & { phone_confirmed_at?: string | null };
  return {
    phone: user.phone ? `+${String(user.phone).replace(/^\+/, "")}` : null,
    confirmed: !!user.phone_confirmed_at,
  };
}

/**
 * NATIVE SOCIAL SIGN-IN — exchange a provider ID token for a Supabase session.
 *
 * This is the mobile counterpart to the web's `signInWithOAuth`: instead of a browser
 * redirect, the native SDK (Google Play Services / Apple's ASAuthorization) hands us a
 * signed OIDC ID token, which Supabase verifies against the provider's public keys.
 * There is NO authorization code, NO redirect URI and therefore nothing to add to the
 * Supabase redirect allow-list — which is precisely why it was chosen over a
 * WebBrowser/AuthSession flow for `mobile/` (see docs/GOOGLE_SIGN_IN_SETUP.md).
 *
 * The token's `aud` claim MUST appear in the provider's "Client IDs" list in the
 * Supabase dashboard or verification fails — for Google that means the Web client ID
 * (Android's token audience) and the iOS client ID.
 *
 * `nonce` is the RAW nonce. Apple/Google receive its SHA-256 hash; Supabase re-hashes
 * this value and compares. Passing the hash here instead of the raw string is the
 * single most common way this flow fails, so callers must not pre-hash.
 *
 * Account linking is Supabase's own: when the provider's verified email matches an
 * existing user's CONFIRMED email, the identity is attached to that user and no new
 * `auth.users` row (and therefore no second patient profile) is created. We
 * deliberately implement no linking logic of our own — see the account-collision notes
 * in docs/GOOGLE_SIGN_IN_SETUP.md.
 */
export async function signInWithIdToken(
  db: DB,
  input: { provider: "google" | "apple"; token: string; nonce?: string }
): Promise<{ user: User; session: Session }> {
  const { data, error } = await db.auth.signInWithIdToken({
    provider: input.provider,
    token: input.token,
    ...(input.nonce ? { nonce: input.nonce } : {}),
  });
  if (error) throw error;
  // Supabase returns both on success; guard anyway so a malformed response surfaces
  // as a thrown error rather than an "authenticated" state with no session.
  if (!data.user || !data.session) {
    throw new Error("Identity provider returned no session");
  }
  return { user: data.user, session: data.session };
}

export async function signOut(db: DB): Promise<void> {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

export async function getSession(db: DB): Promise<Session | null> {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser(db: DB): Promise<User | null> {
  const { data, error } = await db.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Send a password-reset email. `redirectTo` is the deep/web link to the reset screen. */
export async function resetPasswordForEmail(
  db: DB,
  email: string,
  redirectTo?: string
): Promise<void> {
  const { error } = await db.auth.resetPasswordForEmail(
    normalizeEmail(email),
    redirectTo ? { redirectTo } : undefined
  );
  if (error) throw error;
}

/** Update the signed-in user's password (e.g. after a recovery link / in settings). */
export async function updatePassword(db: DB, newPassword: string): Promise<void> {
  const { error } = await db.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Subscribe to auth state changes. Returns an unsubscribe fn. */
export function onAuthStateChange(
  db: DB,
  cb: (session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = db.auth.onAuthStateChange((_event, session) => cb(session));
  return () => subscription.unsubscribe();
}
