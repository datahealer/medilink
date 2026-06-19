import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@medilink/shared";
import { isStaff } from "@medilink/shared";

const MFA_VERIFY_PATH = "/mfa-verify";
// The page where super_admin sets up mandatory 2FA
const SUPER_ADMIN_SECURITY_PATH = "/dashboard/security";

// Paths that must NOT trigger the AAL2 redirect (would cause a redirect loop)
const AAL2_EXEMPT_PREFIXES = [
  "/login",
  "/signup",
  "/mfa-verify",
  "/api/auth",      // all auth API routes (login, 2fa/*, recovery/*)
  "/_next",
  "/favicon",
];

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Always call getUser() — triggers token refresh and writes new cookie
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;

  if (!user) return response;

  const path = request.nextUrl.pathname;
  const isExempt = AAL2_EXEMPT_PREFIXES.some((p) => path.startsWith(p));

  if (!isExempt) {
    // Fetch role + two_factor_enabled once — reused for all checks below
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, two_factor_enabled")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role as string | undefined) ?? "patient";
    const twoFactorEnabled = profile?.two_factor_enabled ?? false;

    if (isStaff(role)) {
      // super_admin: 2FA is mandatory. If not enrolled, force them to set it up first.
      if (role === "super_admin" && !twoFactorEnabled && path !== SUPER_ADMIN_SECURITY_PATH) {
        return NextResponse.redirect(
          new URL(`${SUPER_ADMIN_SECURITY_PATH}?required=true`, request.url)
        );
      }

      // All staff with 2FA enrolled but AAL1 session → must verify TOTP
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.nextLevel === "aal2" && aalData?.currentLevel === "aal1") {
        const redirectUrl = new URL(MFA_VERIFY_PATH, request.url);
        redirectUrl.searchParams.set("from", path);
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Admin-route role guard — reuses already-fetched role (no extra DB call)
    if (path.startsWith("/dashboard/admin")) {
      if (role !== "facility_admin" && role !== "super_admin") {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }
  }

  return response;
}