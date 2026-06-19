import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@medilink/shared";

import { env } from "@/lib/env";

/** Request-scoped SSR Supabase client. Reads/writes auth cookies; respects RLS. */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignored when called outside a mutable request scope (e.g. RSC render).
        }
      },
    },
  });
}
