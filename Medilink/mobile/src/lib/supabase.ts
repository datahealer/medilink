import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared/mobile";

import { env } from "@/config/env";
import { SecureStoreAdapter } from "@/lib/secureStore";

/**
 * Mobile Supabase client. Same project / anon key / RLS as web — the only
 * difference is session persistence (OS keychain via SecureStore) and that the
 * session travels as a bearer token rather than an SSR cookie.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // no URL-based session detection on native
    },
  }
);

// Only auto-refresh while the app is in the foreground (official RN pattern).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/**
 * Current access token for authenticating backend (Next.js API) calls.
 *
 * `getSession()` returns the session persisted in SecureStore WITHOUT a network round-trip,
 * so its `access_token` can be stale — e.g. right after the app resumes, before the
 * auto-refresh timer fires. Direct Supabase (RLS) queries tolerate this because the client
 * refreshes as part of the request, but backend REST calls (AI, payments, PDFs) carry this
 * token as a raw `Authorization: Bearer` header — a stale one is rejected with 401, which is
 * exactly what made every AI feature fail while RLS-backed screens kept working. Proactively
 * refresh when the token is missing or within 60s of expiry so bearer calls always carry a
 * valid credential.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const isExpiringSoon = !expiresAtMs || expiresAtMs - Date.now() < 60_000;
  if (isExpiringSoon) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) return refreshed.session.access_token;
    // Refresh failed (offline / revoked refresh token) — fall back to whatever we have.
  }
  return session.access_token ?? null;
}
