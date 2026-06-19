"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";


let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    browserClient = createBrowserClient<Database>(
      supabaseUrl,
      supabaseAnonKey
    );
  }

  return browserClient;
}

// ✅ GOOGLE LOGIN
export async function signInWithGoogle() {
  const supabase = createBrowserSupabaseClient();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;
}

// ✅ APPLE LOGIN
export async function signInWithApple() {
  const supabase = createBrowserSupabaseClient();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;
}

// ✅ SIGN OUT
export async function signOut() {
  // Best-effort server invalidation — don't let a network error block the browser clear
  try { await fetch("/api/auth/signout", { method: "POST" }); } catch {}

  // Clear browser session, then destroy the singleton so the next user
  // gets a completely fresh client with no cached state from the previous session.
  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signOut();
  browserClient = null;
}