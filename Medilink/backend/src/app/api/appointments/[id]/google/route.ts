import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const supabase = await createApiSupabaseClient(req);
    const user = await getAal2UserOrThrow(supabase);

    /* ================= GET GOOGLE TOKENS ================= */
    const { data: integration, error: integrationError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "google_calendar")
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { success: false, error: "Google not connected" },
        { status: 400 }
      );
    }

    /* ================= GET APPOINTMENT ================= */
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .select(`id, slot_date, slot_start, slot_end, doctors(full_name), facilities(name)`)
      .eq("id", id)
      .single();

    if (appointmentError || !appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    /* ================= VALIDATE TIME ================= */
    if (!appointment.slot_date || !appointment.slot_start || !appointment.slot_end) {
      return NextResponse.json(
        { success: false, error: "Invalid appointment time" },
        { status: 400 }
      );
    }

    /* ================= PARSE DATE ================= */
    const start = new Date(`${appointment.slot_date}T${appointment.slot_start}`);
    const end = new Date(`${appointment.slot_date}T${appointment.slot_end}`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date format" },
        { status: 400 }
      );
    }

    /* ================= GOOGLE AUTH ================= */
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
    });

    const calendar = google.calendar({ version: "v3", auth });

    /* ================= CREATE EVENT ================= */
    const event = {
      summary: "Doctor Appointment",
      description: `Doctor: ${appointment.doctors?.full_name || "N/A"}\nFacility: ${appointment.facilities?.name || "N/A"}`,

      start: {
        dateTime: start.toISOString(),
        timeZone: "Asia/Kolkata", // ✅ FIXED
      },

      end: {
        dateTime: end.toISOString(),
        timeZone: "Asia/Kolkata", // ✅ FIXED
      },
    };

    /* ================= INSERT EVENT ================= */
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return NextResponse.json({
      success: true,
      eventId: response.data.id,
    });

  } catch (err: any) {
    console.error("GOOGLE EVENT ERROR:", err?.response?.data || err);

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Google event failed",
      },
      { status: 500 }
    );
  }
}