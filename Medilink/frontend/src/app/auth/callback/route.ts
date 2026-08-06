import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@medilink/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postSignupDestination } from "@/lib/onboarding";

/**
 * OAuth / email-confirmation callback (PKCE code exchange).
 *
 * Used by Google sign-in (`signInWithGoogle`), by the signup confirmation link
 * (`emailRedirectTo`), and later by Apple. Supabase redirects here with `?code=…`;
 * exchanging it establishes the SSR cookie session that `middleware.ts` then keeps
 * fresh on every request.
 *
 * Two things this route must get right, both previously wrong:
 *
 * 1. ONBOARDING. A social login creates a brand-new patient exactly like a form signup
 *    does — the `hams_handle_new_user` trigger provisions `patient_profiles` with every
 *    clinical field NULL. The email paths route such users through `/dashboard/setup`
 *    via `postSignupDestination()`, but this route used to redirect straight to `next`,
 *    so the very first Google user would land on the dashboard having skipped date of
 *    birth, Civil Number and consent. Mobile has always enforced this
 *    (`app/(app)/_layout.tsx`); web now matches. The DOB-null test is the same
 *    schema-free signal both platforms use.
 *
 * 2. REDIRECT SAFETY. `next` is attacker-controllable via the sign-in link, and it is
 *    interpolated into a redirect. `safeNextPath` constrains it to a same-origin
 *    absolute path; see shared/src/utils/safeNext.ts for the rejected shapes.
 *
 * Ordering matters: onboarding takes precedence over `next`. A first-time patient
 * following a deep link to, say, `/dashboard/appointments` still completes setup first,
 * because a half-provisioned profile breaks those screens under RLS anyway.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Never blocks account access: postSignupDestination() swallows read errors and
      // defaults to /dashboard.
      const destination = await postSignupDestination(supabase);
      return NextResponse.redirect(
        `${origin}${destination === "/dashboard/setup" ? destination : next}`
      );
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
