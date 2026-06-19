import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import * as chrono from "chrono-node";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Fast-path: clearly off-topic inputs skipped without an LLM call
const CLEARLY_OFF_TOPIC =
  /\b(weather|football|soccer|cricket|news|recipe|joke|stock|crypto|price of|translate|capital of|who is|president|movie|song|2\s*\+\s*2|math|algebra|coding|python|javascript)\b/i;

function filterByTimeRange(slots: { slot_start: string; slot_end: string }[], range: string) {
  if (range === "any") return slots;
  return slots.filter((s) => {
    const t = s.slot_start;
    if (range === "morning") return t < "12:00";
    if (range === "afternoon") return t >= "12:00" && t < "17:00";
    if (range === "evening") return t >= "17:00";
    return true;
  });
}

// Bug A fix: chrono-node can't reliably parse "day after tomorrow" without "the"
function normalizeDatePhrase(phrase: string): string {
  return phrase
    .replace(/\bthe day after tomorrow\b/gi, "in 2 days")
    .replace(/\bday after tomorrow\b/gi, "in 2 days");
}

// Bug B fix: toISOString() converts to UTC — use local date parts instead
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type IntentResult = {
  intent: "BOOK_APPOINTMENT" | "ASK_DATE" | "GENERAL_QUERY";
  doctor_type: string | null;
  date_phrase: string | null;
  time_preference: "morning" | "afternoon" | "evening" | "any";
  needs_clarification: boolean;
  clarification_question: string | null;
};

type PendingEntities = {
  doctor_type?: string | null;
  date_phrase?: string | null;
  time_preference?: string;
};

type DoctorResult = {
  doctor: { id: string; full_name: string; specialty: string; avg_rating: number | null; fees: number | null };
  available_slots: { slot_start: string; slot_end: string }[];
  slot_date: string;
  booking_url: string;
  time_fallback: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const query: string = body.query;
    const patientLocation: { lat: number; lng: number } | undefined = body.patient_location;
    const history: { role: "user" | "assistant"; content: string }[] = body.history ?? [];
    const clientDate: string | undefined = body.client_date;
    const pendingEntities: PendingEntities = body.pending_entities ?? {};

    if (!query?.trim()) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    // Build today reference from client local time (avoids UTC server offset)
    const todayRaw = clientDate?.match(/^\d{4}-\d{2}-\d{2}$/)
      ? clientDate
      : new Date().toISOString().split("T")[0];
    const baseDate = new Date(todayRaw + "T00:00:00");
    const todayStr = todayRaw;

    // ── STAGE 0: Fast-path for clearly off-topic inputs ───────────────────────
    if (CLEARLY_OFF_TOPIC.test(query)) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question:
            "I'm only able to help with booking doctor appointments. What type of doctor do you need, and when would you like to visit?",
          extracted_entities: pendingEntities,
        },
      });
    }

    const serviceSupabase = createServiceSupabase();

    // Fetch real specialty names from DB for LLM to match against
    const { data: specialtyRows } = await serviceSupabase.from("doctors").select("specialty");
    const availableSpecialties = [
      ...new Set((specialtyRows ?? []).map((r) => r.specialty).filter(Boolean)),
    ] as string[];

    // ── STAGE 1: Intent Classification + Entity Extraction ────────────────────

    // Build 8-day reference so LLM doesn't do mental calendar math (which produces wrong results)
    const dateReference: string[] = [];
    for (let i = 0; i <= 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const iso = toLocalDateString(d);
      const name = DAY_NAMES[d.getDay()];
      if (i === 0) dateReference.push(`${iso} = today (${name})`);
      else if (i === 1) dateReference.push(`${iso} = tomorrow (${name})`);
      else if (i === 2) dateReference.push(`${iso} = day after tomorrow (${name})`);
      else dateReference.push(`${iso} = ${name}`);
    }

    const systemPrompt = `You are an AI Scheduling Assistant for a healthcare platform.
Today is ${todayStr} (${DAY_NAMES[baseDate.getDay()]}).

Exact date reference (NEVER do calendar arithmetic — use these directly):
${dateReference.join("\n")}

Available doctor specialties in this system:
${availableSpecialties.length > 0 ? availableSpecialties.join(", ") : "General Physician, Cardiologist, Dermatologist, Pediatrician, Orthopedic, Ophthalmologist, Gastroenterologist, Psychiatrist, Dentist"}

Return ONLY valid JSON — no markdown, no extra text:
{
  "intent": "BOOK_APPOINTMENT" | "ASK_DATE" | "GENERAL_QUERY",
  "doctor_type": "<exact specialty from available list or null>",
  "date_phrase": "<raw date phrase EXACTLY as user said, e.g. 'next Monday', 'tomorrow', 'April 30', 'after 2 weeks', or null>",
  "time_preference": "morning" | "afternoon" | "evening" | "any",
  "needs_clarification": true | false,
  "clarification_question": "<question string or null>"
}

Rules (apply in order):
1. User asks about today's date, day, or time → intent: ASK_DATE, needs_clarification: false
2. Non-scheduling question (math, weather, general knowledge) → intent: GENERAL_QUERY, needs_clarification: false
3. If intent is BOOK_APPOINTMENT:
   a. Date refers to the past (e.g. "yesterday", past month) → needs_clarification: true, date_phrase: null, clarification_question: "That date has already passed. Please provide a future date for your appointment."
   b. Doctor type is missing or unclear → needs_clarification: true, doctor_type: null, clarification_question: "What type of doctor do you need? For example: Cardiologist, Dermatologist, General Physician."
   c. Date is missing → needs_clarification: true, date_phrase: null, clarification_question: "When would you like the appointment? For example: tomorrow, next Monday, or a specific date."
   d. Both present and not past → needs_clarification: false
4. Body-part hints (map ONLY if specialty is in available list):
   skin/rash/acne → Dermatologist | eyes/vision → Ophthalmologist
   stomach/gut/digestion/abdomen → Gastroenterologist | teeth/dental/tooth → Dentist
   bones/joints/fracture/back/knee → Orthopedic | children/child/baby/infant/kids → Pediatrician
   mental/anxiety/depression/stress → Psychiatrist
   HEART/CHEST AMBIGUITY RULE: For vague or mild heart/chest symptoms (e.g. "heart pain", "chest pain", "chest discomfort", "my heart hurts", "heart issue", "book something for my heart") → needs_clarification: true, doctor_type: null, clarification_question: "Are you looking for a cardiologist or a general physician? For serious symptoms like palpitations or severe chest pain, a cardiologist is recommended. For a general check-up or mild discomfort, a general physician is usually the right choice."
   HEART/CHEST → Cardiologist ONLY when user explicitly says severe/serious symptoms: palpitation, heart attack, arrhythmia, rapid heartbeat, fainting, or explicitly asks for a cardiologist.
5. No match in available specialties → needs_clarification: true, ask user for specialty
6. NEVER assume or guess doctor_type — must be stated or clearly body-part implied
7. CRITICAL for date_phrase: copy the EXACT words the user said — do NOT convert to a day name, do NOT convert to YYYY-MM-DD, do NOT do any date arithmetic. "day after tomorrow" → date_phrase: "day after tomorrow" (never "Monday" or a date). "next week" → "next week". "after 2 weeks" → "after 2 weeks".
IMPORTANT: If the current user message contains absolutely NO date, time, day name, or relative time expression → always set date_phrase: null and needs_clarification: true regardless of any other context or conversation history.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: query },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    let parsed: IntentResult;
    try {
      parsed = JSON.parse(completion.choices[0].message.content ?? "{}") as IntentResult;
    } catch {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question: "I didn't quite understand that. Could you try: \"I need a cardiologist tomorrow morning\"?",
          extracted_entities: pendingEntities,
        },
      });
    }

    // ── STAGE 2: Routing ──────────────────────────────────────────────────────

    if (parsed.intent === "ASK_DATE") {
      return NextResponse.json({
        success: true,
        data: {
          type: "info",
          message: `Today is ${DAY_NAMES[baseDate.getDay()]}, ${todayStr}.`,
          extracted_entities: pendingEntities,
        },
      });
    }

    if (parsed.intent === "GENERAL_QUERY") {
      // Mini LLM call for health-adjacent queries (warm, natural response)
      let reply = "I'm here to help you book doctor appointments. What type of doctor do you need, and when would you like to visit?";
      try {
        const followUp = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are a friendly healthcare scheduling assistant. You can ONLY help with booking doctor appointments.
If the user asks something outside scheduling, respond warmly in 1-2 sentences and gently guide them to book an appointment. Do NOT give medical advice. Do NOT be robotic.`,
            },
            { role: "user", content: query },
          ],
          temperature: 0.5,
          max_tokens: 80,
        });
        reply = followUp.choices[0].message.content ?? reply;
      } catch {
        // If mini call fails, use static reply
      }
      return NextResponse.json({
        success: true,
        data: { type: "clarifying_question", question: reply, extracted_entities: pendingEntities },
      });
    }

    // ── Merge with pendingEntities (client-side entity memory) ────────────────
    // Don't inherit stale doctor_type when LLM flagged needs_clarification — it means
    // the current message has a doctor resolution problem (e.g. specialty not in DB)
    const finalDoctorType = parsed.doctor_type ??
      (parsed.needs_clarification ? null : (pendingEntities.doctor_type ?? null));
    const finalDatePhrase = parsed.date_phrase ?? pendingEntities.date_phrase ?? null;
    const finalTimePreference = (parsed.time_preference ?? pendingEntities.time_preference ?? "any") as string;

    const currentEntities: PendingEntities = {
      doctor_type: finalDoctorType,
      date_phrase: finalDatePhrase,
      time_preference: finalTimePreference,
    };

    // Bug C fix (server guard): if no date after merge, always ask — never default to today
    if (!finalDatePhrase) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question:
            parsed.clarification_question ??
            "When would you like to book? For example: tomorrow, next Monday, or a specific date.",
          extracted_entities: currentEntities, // doctor_type preserved for next turn
        },
      });
    }

    // ── Parse date with chrono-node (deterministic) ───────────────────────────
    // Bug A fix: normalize before passing to chrono
    const chronoParsed = chrono.parseDate(normalizeDatePhrase(finalDatePhrase), baseDate, { forwardDate: true });

    if (!chronoParsed) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question: `I couldn't understand "${finalDatePhrase}" as a date. Could you provide a specific date? For example: "tomorrow", "next Monday", or "April 30".`,
          extracted_entities: { ...currentEntities, date_phrase: null },
        },
      });
    }

    // Bug B fix: use local date parts instead of toISOString() to avoid UTC offset stripping a day
    const preferredDate = toLocalDateString(chronoParsed);

    // Hard validation: reject past dates
    if (preferredDate < todayStr) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question: "That date has already passed. Please provide a future date for your appointment.",
          // Bug E fix: clear ALL entities on past-date rejection — no stale doctor bleeding into next message
          extracted_entities: { doctor_type: null, date_phrase: null, time_preference: "any" },
        },
      });
    }

    // Handle clarification needed (after merging entities)
    if (parsed.needs_clarification && !finalDoctorType) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question:
            parsed.clarification_question ??
            "Could you tell me what type of doctor you need and your preferred date?",
          extracted_entities: currentEntities,
        },
      });
    }

    // Guard: if after merge we still have no doctor type, ask
    if (!finalDoctorType) {
      return NextResponse.json({
        success: true,
        data: {
          type: "clarifying_question",
          question:
            parsed.clarification_question ??
            "What type of doctor do you need? For example: Cardiologist, Dermatologist, General Physician.",
          extracted_entities: currentEntities,
        },
      });
    }

    const specialty = finalDoctorType;
    const timeRange = finalTimePreference;

    // ── STAGE 3: DB Slot Query ────────────────────────────────────────────────
    let doctorQuery = serviceSupabase
      .from("doctors")
      .select("id, full_name, specialty, avg_rating, fees, branch_id")
      .eq("specialty", specialty)
      .limit(10);

    if (patientLocation) {
      const { data: nearbyBranches } = await serviceSupabase.rpc("nearby_branches", {
        user_lat: patientLocation.lat,
        user_lng: patientLocation.lng,
        radius_meters: 20000,
      });
      if (nearbyBranches != null && (nearbyBranches as { id: string }[]).length > 0) {
        const branchIds = (nearbyBranches as { id: string }[]).map((b) => b.id);
        doctorQuery = doctorQuery.in("branch_id", branchIds);
      }
    }

    const { data: doctors } = await doctorQuery;

    if (!doctors || doctors.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          type: "no_results",
          message: `No doctors found for "${specialty}". Try a different specialty or contact the clinic directly.`,
          next_available: null,
          next_available_doctor: null,
          next_available_url: null,
        },
      });
    }

    // Try preferred date + next 3 days
    const datesToTry = [preferredDate];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(preferredDate + "T12:00:00");
      d.setDate(d.getDate() + i);
      datesToTry.push(toLocalDateString(d));
    }

    const results: DoctorResult[] = [];
    let earliestNextAvailable: { date: string; doctorName: string; doctorId: string } | null = null;

    for (const doc of doctors) {
      let foundDate: string | null = null;
      let foundSlots: { slot_start: string; slot_end: string }[] = [];
      let usedTimeFallback = false;

      for (const date of datesToTry) {
        const { data: slots } = await serviceSupabase.rpc("get_available_slots", {
          p_doctor_id: doc.id,
          p_date: date,
          p_include_walkin: false,
        });
        const validSlots = (slots ?? []).filter((s) => s.slot_start !== null && s.slot_end !== null);

        // Pass 1: preferred time range
        let filtered = filterByTimeRange(validSlots, timeRange);

        // Pass 2: fallback to any time if preferred has no slots
        if (filtered.length === 0 && timeRange !== "any" && validSlots.length > 0) {
          filtered = validSlots.slice(0, 6);
          usedTimeFallback = true;
        }

        if (filtered.length > 0) {
          foundDate = date;
          foundSlots = filtered.slice(0, 6);
          break;
        }
      }

      if (foundDate) {
        results.push({
          doctor: {
            id: doc.id,
            full_name: doc.full_name,
            specialty: doc.specialty ?? "",
            avg_rating: doc.avg_rating,
            fees: typeof doc.fees === "number" ? doc.fees : null,
          },
          available_slots: foundSlots,
          slot_date: foundDate,
          booking_url: `/dashboard/dashboardpages/patient/book?doctorId=${doc.id}`,
          time_fallback: usedTimeFallback,
        });
      } else {
        // No slots in 4-day window — find next available date for this doctor
        try {
          const lastDate = datesToTry[datesToTry.length - 1];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: nextSlotRow } = await (serviceSupabase as any)
            .from("appointment_slots")
            .select("slot_date")
            .eq("doctor_id", doc.id)
            .gt("slot_date", lastDate)
            .order("slot_date", { ascending: true })
            .limit(10)
            .single();

          const typedSlotRow = nextSlotRow as { slot_date?: string } | null;
          if (typedSlotRow?.slot_date) {
            const candidate = { date: typedSlotRow.slot_date, doctorName: doc.full_name, doctorId: doc.id };
            if (!earliestNextAvailable || candidate.date < earliestNextAvailable.date) {
              earliestNextAvailable = candidate;
            }
          }
        } catch {
          // non-critical
        }
      }

      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          type: "no_results",
          message: `No available slots for "${specialty}" in the next 4 days.`,
          next_available: earliestNextAvailable?.date ?? null,
          next_available_doctor: earliestNextAvailable?.doctorName ?? null,
          next_available_url: earliestNextAvailable
            ? `/dashboard/dashboardpages/patient/book?doctorId=${earliestNextAvailable.doctorId}&date=${earliestNextAvailable.date}`
            : null,
        },
      });
    }

    // Sort: preferred date first, then by rating
    results.sort((a, b) => {
      if (a.slot_date === preferredDate && b.slot_date !== preferredDate) return -1;
      if (b.slot_date === preferredDate && a.slot_date !== preferredDate) return 1;
      return (b.doctor.avg_rating ?? 0) - (a.doctor.avg_rating ?? 0);
    });

    return NextResponse.json({
      success: true,
      data: {
        type: "results",
        extracted_intent: {
          specialty,
          preferred_date: preferredDate,
          preferred_time_range: timeRange,
        },
        results: results.slice(0, 3),
        // Bug D fix: keep doctor_type so "next Monday" follow-ups work — only clear date_phrase
        extracted_entities: { doctor_type: specialty, date_phrase: null, time_preference: timeRange },
      },
    });
  } catch (err: unknown) {
    console.error("schedule-assist error:", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { success: false, error: "AI rate limit reached. Please try again in a moment." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
