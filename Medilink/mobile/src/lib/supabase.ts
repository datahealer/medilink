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

/** Current access token for authenticating backend (Next.js API) calls. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
