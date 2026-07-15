// AUTHENTICATION — universal supabase-js auth calls shared by web + mobile.
// Signup + email-OTP verification + password recovery use official Supabase Auth
// directly from the client (no custom OTP table, no service-role signup): both
// platforms make these identical RLS-neutral calls. 2FA side-effects remain in
// `backend/` (staff-only). Profile rows are provisioned by the DB trigger on
// auth.users insert, so client signUp still creates the patient profile.
import type { Session, User } from "@supabase/supabase-js";

import type { DB } from "./client";

export async function signInWithPassword(
  db: DB,
  input: { email: string; password: string }
): Promise<{ user: User; session: Session }> {
  const { data, error } = await db.auth.signInWithPassword(input);
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
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: input.data ? { data: input.data } : undefined,
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
    email: input.email,
    token: input.token,
    type: input.type,
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

/** Re-send the signup confirmation OTP email. */
export async function resendSignupOtp(db: DB, email: string): Promise<void> {
  const { error } = await db.auth.resend({ type: "signup", email });
  if (error) throw error;
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
    email,
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
