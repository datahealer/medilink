import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { getAal2UserOrThrow } from "@/lib/auth/api";
import { authErrorResponse } from "@/lib/auth/authError";

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
      return NextResponse.json({ error: "Google not connected" },
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
    // `slot_date` + `slot_start` are an OMAN wall clock with no zone attached.
    //
    // This previously did `new Date(\`${date}T${time}\`).toISOString()`, which reads the
    // pair in the SERVER's timezone — UTC on Vercel — and then stamped a `Z` offset on
    // it. Google honours the explicit offset in `dateTime` and ignores `timeZone` for
    // the instant, so a 09:00 Oman appointment was filed at 09:00Z = 13:00 Oman: every
    // synced event landed four hours late. The `timeZone` was also "Asia/Kolkata",
    // which is India, not Oman.
    //
    // The fix is to send the wall clock UNCHANGED with no offset and name the zone, the
    // documented Google Calendar pattern for local-time events. No Date object is
    // involved, so no timezone can be inferred by accident.
    const OMAN_TIME_ZONE = "Asia/Muscat";
    const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t.slice(0, 8));
    const startLocal = `${appointment.slot_date}T${hhmmss(appointment.slot_start)}`;
    const endLocal = `${appointment.slot_date}T${hhmmss(appointment.slot_end)}`;

    // Validate the assembled wall clocks without letting a Date parse define the
    // instant — this only proves the shape is RFC3339-local, which is what Google needs.
    const SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if (!SHAPE.test(startLocal) || !SHAPE.test(endLocal)) {
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

      // Local wall clock + named zone: Google resolves the instant in Asia/Muscat.
      // Never send an offset here (`Z` or `+04:00`) — it would override the zone.
      start: {
        dateTime: startLocal,
        timeZone: OMAN_TIME_ZONE,
      },

      end: {
        dateTime: endLocal,
        timeZone: OMAN_TIME_ZONE,
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
    const authRes = authErrorResponse(err, "success");
    if (authRes) return authRes;
    console.error("GOOGLE EVENT ERROR:", err?.response?.data || err);

    return NextResponse.json(
      {
        success: false,
        error: "Google event failed",
      },
      { status: 500 }
    );
  }
}