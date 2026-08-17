import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";
import { serverErrorResponse } from "@/lib/http/serverError";
import { invoiceDownloadUrl } from "@/lib/payments/invoiceObject";

export async function GET(req: NextRequest) {
  try {
    // ✅ 1. Get user (auth client)
    const supabaseAuth = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabaseAuth);

    // ✅ 2. Service client (bypass RLS)
    const supabase = createServiceSupabase();

    const { searchParams } = new URL(req.url);

    // ✅ Status filter
    const rawStatus = searchParams.get("status");

    const allowedStatus = [
      "unpaid",
      "pending",
      "paid",
      "failed",
      "refunded",
      "partial_refund",
    ] as const;

    type PaymentStatus = typeof allowedStatus[number];

    let status: PaymentStatus | null = null;

    if (rawStatus && allowedStatus.includes(rawStatus as PaymentStatus)) {
      status = rawStatus as PaymentStatus;
    }

    // ✅ 3. Query payments (IMPORTANT FILTER)
    let query = supabase
      .from("payments")
      .select(`
        id,
        amount,
        currency,
        status,
        created_at,
        invoice_url,
        profiles!payments_patient_id_fkey (
          full_name,
          email
        ),
        appointment:appointment_id (
          for_family_member_id,
          family_member:for_family_member_id ( full_name, relation )
        )
      `)
      .eq("patient_id", user.id) // 🔥 MANUAL SECURITY
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Payments fetch error:", error);
      throw error;
    }

    /**
     * Never hand a client the raw `invoice_url`.
     *
     * It is a PUBLIC storage link to a PDF containing the patient's name, email, doctor,
     * facility and amount. Returning it put an unauthenticated PHI URL into every client
     * bundle's memory, every browser devtools Network tab, and anywhere those clients chose
     * to persist or share it.
     *
     * The field keeps its name and its null-ness — clients already use it as "is there an
     * invoice?" and render a disabled button when null — but the VALUE becomes the
     * authenticated download route. Existing consumers keep working unchanged and become
     * safe by default rather than needing to be individually corrected.
     */
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const rows = (data || []).map((row) => ({
      ...row,
      invoice_url: row.invoice_url && appUrl ? invoiceDownloadUrl(appUrl, row.id) : null,
    }));

    return NextResponse.json(rows);

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("API ERROR:", err);
    return serverErrorResponse(err, "payments");
  }
}