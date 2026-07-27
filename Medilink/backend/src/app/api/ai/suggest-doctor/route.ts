import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import Groq from "groq-sdk";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { createHash } from "crypto";

// Vercel: raise the function timeout above the low default to cover the AI call.
export const maxDuration = 30;

// Lazy init: `next build` imports route modules for page-data collection, and the Groq
// SDK throws on an empty key at construction. Creating the client on first request keeps
// the build working without GROQ_API_KEY present, while runtime behavior is unchanged.
let _groq: Groq | null = null;
function groqClient(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

type AIResult = {
  is_medical: boolean;
  ai_reasoning: string;
  urgency_level: "low" | "medium" | "high" | "emergency";
  suggested_specialties: string[];
};

function hashSymptoms(symptoms: string) {
  return createHash("sha256").update(symptoms.trim().toLowerCase()).digest("hex");
}

function getAIAndDoctors(symptoms: string) {
  const hash = hashSymptoms(symptoms);

  return unstable_cache(
    async () => {
      const supabase = createServiceSupabase();

      // Step 1: Fetch real specialty names from DB so AI picks exact values
      const { data: specialtyRows } = await supabase
        .from("doctors")
        .select("specialty");

      const availableSpecialties = [
        ...new Set(
          (specialtyRows ?? []).map((r) => r.specialty).filter(Boolean)
        ),
      ] as string[];

      // Step 2: Call Groq with real DB specialty names injected into system prompt
      const systemPrompt = `You are a clinical triage assistant. Read the patient's symptoms and pick the most relevant specialties from the exact list below.
Rules:
- If the input contains no recognizable medical symptoms, health complaints, or physical conditions (e.g. random words, gibberish, unrelated text) → set is_medical: false, urgency_level: "low", suggested_specialties: [], ai_reasoning: "No medical symptoms detected."
- Only set is_medical: true when the input describes an actual health concern, symptom, or physical complaint.
- You MUST only return specialty names that appear VERBATIM in this list: ${availableSpecialties.join(", ")}.
- Do NOT invent, rephrase, or alter specialty names — copy them exactly as written above.
- Pick 1–3 most relevant specialties. If none match well, return the closest one from the list.
- Return ONLY valid JSON: { "is_medical": boolean, "ai_reasoning": string, "urgency_level": "low"|"medium"|"high"|"emergency", "suggested_specialties": string[] }`;

      const completion = await groqClient().chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: symptoms },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const aiResult: AIResult = JSON.parse(
        completion.choices[0].message.content ?? "{}"
      );

      // Step 3: Match doctors across ALL suggested specialties, CASE-INSENSITIVELY
      // (the freetext `doctors.specialty` column varies in casing/whitespace vs. the
      // AI's output), and RANK by rating — never filter by `status` (all doctors are
      // bookable; availability, if needed, is a ranking signal, not a filter).
      const specialties = (aiResult.suggested_specialties ?? [])
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0 && !s.includes(",")); // commas break the PostgREST or() grammar

      let doctors: Array<Record<string, unknown>> = [];
      if (specialties.length > 0) {
        const orFilter = specialties.map((s) => `specialty.ilike.${s}`).join(",");
        const { data } = await supabase
          .from("doctors")
          .select("id, full_name, specialty, avg_rating, fees, profile_photo_url, status")
          .or(orFilter)
          .order("avg_rating", { ascending: false, nullsFirst: false })
          .limit(10);
        doctors = data ?? [];
      }

      return {
        is_medical: aiResult.is_medical !== false,
        ai_reasoning: aiResult.ai_reasoning,
        urgency_level: aiResult.urgency_level,
        suggested_specialties: aiResult.suggested_specialties,
        recommended_doctors: (doctors ?? []).map((doc) => ({
          ...doc,
          booking_url: `/dashboard/dashboardpages/patient/book?doctorId=${doc.id}`,
        })),
      };
    },
    [`suggest-doctor-${hash}`],
    { revalidate: 3600 }
  )();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { symptoms } = await req.json();
    if (!symptoms || typeof symptoms !== "string" || !symptoms.trim()) {
      return NextResponse.json({ success: false, error: "Symptoms are required" }, { status: 400 });
    }

    const serviceSupabase = createServiceSupabase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await serviceSupabase
      .from("ai_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", "doctor_suggestion")
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. You can make 5 AI requests per hour." },
        { status: 429 }
      );
    }

    const normalizedSymptoms = symptoms.trim().toLowerCase();
    const data = await getAIAndDoctors(normalizedSymptoms);

    if (!data.is_medical) {
      return NextResponse.json(
        {
          success: false,
          error:
            "That doesn't look like a medical symptom. Please describe what you're feeling physically — for example, \"I have a headache and fever for 2 days.\"",
        },
        { status: 400 }
      );
    }

    await serviceSupabase.from("ai_request_logs").insert({
      user_id: user.id,
      feature: "doctor_suggestion",
      prompt_hash: hashSymptoms(symptoms),
    });

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error("AI suggest-doctor error:", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { success: false, error: "AI rate limit reached. Please try again in a moment." },
        { status: 429 }
      );
    }
    if (message.includes("503") || message.toLowerCase().includes("service unavailable")) {
      return NextResponse.json(
        { success: false, error: "AI service temporarily unavailable. Please try again." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
