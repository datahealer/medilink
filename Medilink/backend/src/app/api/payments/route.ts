import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

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

    return NextResponse.json(data || []);

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    console.error("API ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}