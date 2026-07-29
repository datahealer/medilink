import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // 1. Authenticate the caller (same cookie session as GET /api/payments).
    const supabaseAuth = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabaseAuth);

    // 2. Service client + OWNERSHIP filter — payments.patient_id is the auth user
    //    id (see payments/route.ts and the webhook note). Scoping the lookup to the
    //    caller closes the previous IDOR (any id was previously downloadable).
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("payments")
      .select("invoice_url")
      .eq("id", id)
      .eq("patient_id", user.id)
      .maybeSingle();

    if (error || !data?.invoice_url) {
      // Same 404 whether the payment is missing or not owned — no existence leak.
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.redirect(data.invoice_url);
  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}