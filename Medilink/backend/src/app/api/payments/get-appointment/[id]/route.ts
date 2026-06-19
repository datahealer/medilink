import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

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
      .eq("id", params.id)
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}