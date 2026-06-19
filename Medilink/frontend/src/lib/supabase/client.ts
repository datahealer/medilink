"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";

import { env } from "@/lib/env";

let browserClient: SupabaseClient<Database> | null = null;

/** Singleton browser Supabase client (anon key, cookie-backed session via @supabase/ssr). */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );
  }
  return browserClient;
}

export async function signInWithGoogle() {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut() {
  // Best-effort server invalidation — don't let a network error block the browser clear.
  try {
    await fetch("/api/auth/signout", { method: "POST" });
  } catch {}
  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signOut();
  browserClient = null;
}
