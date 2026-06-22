import { NextRequest, NextResponse } from "next/server";
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

    const amount =
      (appointment.doctors?.fees as any)?.in_person || 0;

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