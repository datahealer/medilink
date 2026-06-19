import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@medilink/shared";

import { env } from "@/lib/env";

/**
 * Patient-web session refresh. Runs on every matched request:
 *  - rotates the Supabase auth token and re-writes the cookie, and
 *  - (optionally) gates a small set of authenticated-only route prefixes.
 *
 * No staff/AAL2/role redirects — this app is patient-scope only.
 */

// Routes that require a signed-in patient. Anything else is public.
const PROTECTED_PREFIXES = ["/account", "/appointments", "/records", "/wallet"];

// Never gate these (avoids redirect loops / breaks static + auth flows).
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/api", "/_next", "/favicon"];

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Triggers refresh + cookie write. Must run on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (!user && isProtected && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}
