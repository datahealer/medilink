// AUTHENTICATION — universal supabase-js auth calls shared by web + mobile.
// Sign-up / OTP / 2FA side-effects stay server-side in `backend/` (decision #1);
// these are the RLS-neutral client calls both platforms make identically.
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
