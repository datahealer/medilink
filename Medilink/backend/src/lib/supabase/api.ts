import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@medilink/shared";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createApiSupabaseClient(req: NextRequest): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");
            
  // ✅ If mobile request (Bearer token)
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");

    return createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
          },
        },
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
      }
    );
  }

  // ✅ Fallback (web cookies)
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch {}
          });
        },
      },
    }
  );
}