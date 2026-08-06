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
 * Phone OTP is intentionally NOT implemented here — it is blocked on an SMS provider
 * (plan F4 §5); the sign-in UI keeps the Mobile option feature-flagged off.
 */
export async function signInWithEmailOtp(db: DB, email: string): Promise<void> {
  const { error } = await db.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
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
