import { createClient } from "@supabase/supabase-js";
import type { Database } from "@medilink/shared";

// Service-role client — bypasses RLS and AAL checks.
// NEVER expose this to the browser. Only import from server-side files (API routes, server actions).
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env variable");
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
