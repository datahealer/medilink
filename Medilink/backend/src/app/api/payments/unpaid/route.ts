import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { data: patient } = await supabase
      .from("patient_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    const APPT_SELECT = `
      id, slot_date, slot_start, payment_status, is_emergency, status,
      doctors ( full_name, fees )
    `;

    // Non-emergency: any unpaid appointment
    const { data: normalAppts } = await supabase
      .from("appointments")
      .select(APPT_SELECT)
      .eq("patient_id", patient.id)
      .eq("payment_status", "unpaid")
      .eq("is_emergency", false)
      .order("slot_date", { ascending: false });

    // Emergency: only those approved by staff (not yet paid)
    const { data: emergencyAppts } = await (supabase as any)
      .from("appointments")
      .select(APPT_SELECT)
      .eq("patient_id", patient.id)
      .eq("is_emergency", true)
      .eq("status", "approved")
      .eq("payment_status", "unpaid")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      appointments: [...(normalAppts ?? []), ...(emergencyAppts ?? [])],
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}