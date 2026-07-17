import { NextRequest, NextResponse } from "next/server";
import { feeForType } from "@medilink/shared";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    const { id } = await params;

    const { data: appointment, error } = await supabase
      .from("appointments")
      .select(`
        id,
        patient_id,
        doctor_id,
        type,
        doctors (
          fees
        )
      `)
      .eq("id", id)
      .single();

    if (error || !appointment) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Shared, type-aware consultation fee (single source of truth with checkout).
    const amount = feeForType(
      (appointment.doctors as { fees?: unknown } | null)?.fees,
      appointment.type as string | null
    );

    return NextResponse.json({
      appointment_id: appointment.id,
      amount,
    });

  } catch (err: any) {
    const authRes = authErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}