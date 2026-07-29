import { NextRequest, NextResponse } from "next/server";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createServiceSupabase } from "@/lib/supabase/service";
import { GROQ_MODEL, describeAiError, exposeAiDetail, groqClient } from "@/lib/ai/groq";
import { createHash } from "crypto";

// Vercel: this route makes a structured call plus a streamed (SSE) Groq completion;
// raise the function timeout above the low default so streaming can complete.
export const maxDuration = 60;

// A conversational symptom checker gets ~1 request PER TURN, so the old 5/hr ceiling would
// kill a normal chat after a few messages. 40/turn per hour is plenty for a thorough triage
// while still capping abuse/cost.
const RATE_LIMIT_PER_HOUR = 40;

const DISCLAIMER =
  "This information is AI-generated and is not a medical diagnosis. Always consult a qualified healthcare professional.";

type ChatTurn = { role: "user" | "assistant"; content: string };

function hashText(text: string) {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

// STAGE 1 — the "triage director": reads the WHOLE conversation and classifies it. It does
// NOT decide whether to answer — the assistant ALWAYS answers with value. It only supplies the
// deterministic signals the UI needs: is this medical, is it an emergency, and how urgent.
const TRIAGE_DIRECTOR_SYSTEM = `You are a clinical triage classifier. Read the ENTIRE conversation (every symptom mentioned so far matters — never forget earlier ones) and respond ONLY with valid JSON:
{
  "is_medical": true | false,
  "is_emergency": true | false,
  "urgency_level": "self-care" | "see-doctor" | "urgent-24h" | "emergency"
}
Rules:
- is_medical: false ONLY if the conversation has no health content at all (gibberish / off-topic).
- is_emergency + urgency_level "emergency": set as soon as a red flag is present or clearly implied — chest pain radiating to arm/jaw/neck, chest pain WITH sweating / shortness of breath / nausea, stroke signs (face droop, arm weakness, speech difficulty), severe breathing difficulty, anaphylaxis, uncontrolled bleeding, sudden vision loss, or suicidal intent.
- Escalate urgency as the picture worsens or new concerning features appear: new/worsening BLURRED or DECLINING VISION → at least "urgent-24h"; a symptom persisting for WEEKS or clearly worsening → at least "see-doctor".
- urgency_level meaning: "self-care" = manage at home; "see-doctor" = professional evaluation soon; "urgent-24h" = within 24 hours; "emergency" = immediate emergency care.
- Base every decision on the FULL conversation, not just the last message.`;

// STAGE 2 — the assistant ALWAYS answers with value in this exact structure. It never replies
// with questions alone; a single optional follow-up question may come only at the very end.
const CONSULTATION_SYSTEM = `You are MediLink's AI medical assistant in an ongoing chat with a patient — talk like a caring clinician on a messaging app, NOT like a questionnaire. After EVERY meaningful message you MUST provide value; NEVER reply with questions alone.

Use the ENTIRE conversation (all symptoms so far — never forget earlier ones). Reply in EXACTLY this structure, in warm, plain, non-technical language, using markdown headings:

**What I understood**
One short sentence restating what the patient has told you so far (include how long it's lasted and every symptom mentioned).

**Possible causes**
• <Cause 1> — one short plain-language explanation
• <Cause 2> — one short plain-language explanation
• <Cause 3> — one short plain-language explanation
(Give 2–4 causes, most relevant first.)

**Most likely**
Say: "Based on the current information, the most likely cause is <X>." Then, on the next line: "This is not a diagnosis." If a NEW detail shifts the likelihood, say so explicitly (e.g. "The itching makes allergic conjunctivitis more likely.").

**Recommendation**
What the patient should do next. If symptoms have lasted weeks, are severe, or are worsening, recommend the appropriate specialist BY NAME (e.g. an ophthalmologist for eye problems). For emergencies, tell them to seek immediate/emergency care now.

Then, ONLY if ONE specific missing detail would meaningfully change the assessment, add ONE short question on its own final line, starting with "One quick question: ". Ask AT MOST one, and skip it entirely if nothing important is missing.

Rules:
- NEVER send a message that is only questions — every reply must contain the four sections above.
- Use ONLY the bold **Headings** + "• " bullets shown; no numbered lists, no long paragraphs.
- Always re-incorporate every earlier symptom and update causes / most-likely / recommendation when the patient adds anything new.
- Keep each part brief and easy to read.`;

const NON_MEDICAL_SYSTEM = `You are a friendly medical assistant. The user has not described a health symptom. In 1–2 warm sentences, gently explain that you can only help with health symptoms, and invite them to describe what they're feeling physically. Do not diagnose anything.`;

export async function POST(req: NextRequest) {
  try {
    // Authenticate — every AI route requires a signed-in user.
    const supabase = await createApiSupabaseClient(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      messages: rawMessages,
      symptoms,
      patient_age,
      patient_gender,
    } = body as {
      messages?: ChatTurn[];
      symptoms?: string; // legacy single-shot support
      patient_age?: number;
      patient_gender?: string;
    };

    // Normalize into a conversation. Legacy callers send a single `symptoms` string; the chat
    // client sends the full `messages` history so the AI never forgets earlier symptoms.
    const conversation: ChatTurn[] = Array.isArray(rawMessages) && rawMessages.length > 0
      ? rawMessages
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }))
      : symptoms && typeof symptoms === "string" && symptoms.trim()
        ? [{ role: "user", content: symptoms.trim() }]
        : [];

    if (conversation.length === 0 || conversation[conversation.length - 1].role !== "user") {
      return NextResponse.json(
        { success: false, error: "A user message is required." },
        { status: 400 }
      );
    }

    // Rate limit — per user per hour (chat-friendly ceiling).
    const serviceSupabase = createServiceSupabase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await serviceSupabase
      .from("ai_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", "symptom_check")
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: `Rate limit exceeded. You can make ${RATE_LIMIT_PER_HOUR} AI requests per hour.` },
        { status: 429 }
      );
    }

    const patientContext = [
      patient_age ? `Patient age: ${patient_age}` : null,
      patient_gender && patient_gender !== "prefer-not" ? `Patient gender: ${patient_gender}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    // ── STAGE 1: triage classifier (structured JSON) — signals only, never gates the answer ──
    const directorMessages = [
      { role: "system" as const, content: TRIAGE_DIRECTOR_SYSTEM + (patientContext ? `\n\nKnown patient context: ${patientContext}.` : "") },
      ...conversation,
    ];
    const structured = await groqClient().chat.completions.create({
      model: GROQ_MODEL,
      messages: directorMessages,
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const director = JSON.parse(structured.choices[0].message.content ?? "{}") as {
      is_medical?: boolean;
      is_emergency?: boolean;
      urgency_level?: string;
    };

    const isMedical = director.is_medical !== false;
    const isEmergency = !!director.is_emergency;
    const urgencyLevel = isMedical ? (director.urgency_level ?? "see-doctor") : "self-care";
    // The assistant ALWAYS gives a full assessment for any medical message (never a
    // questions-only "gathering" reply), so a medical turn always carries the urgency badge,
    // disclaimer, and the "Recommend Doctors / Continue Chat" offer.
    const phase = "assessment" as const;

    const meta = {
      type: "meta" as const,
      phase,
      is_medical: isMedical,
      is_emergency: isEmergency,
      urgency_level: urgencyLevel,
      conditions: [] as string[], // possible causes now live inline in the consultation text
      recommended_action: "",
      disclaimer: DISCLAIMER,
      ask_recommend_doctors: isMedical,
    };

    // ── STAGE 2: stream the always-structured consultation (or a gentle non-medical redirect) ──
    const systemForPhase = isMedical ? CONSULTATION_SYSTEM : NON_MEDICAL_SYSTEM;

    const stream = await groqClient().chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemForPhase + (patientContext ? `\n\nPatient context: ${patientContext}.` : "") },
        ...conversation,
      ],
      stream: true,
      temperature: 0.4,
    });

    // Logging: count every turn toward the rate limit; record a symptom-check row for every
    // medical turn (each one is a full assessment now).
    await serviceSupabase.from("ai_request_logs").insert({
      user_id: user.id,
      feature: "symptom_check",
      prompt_hash: hashText(conversation[conversation.length - 1].content),
    });
    if (isMedical) {
      await serviceSupabase.from("symptom_check_logs").insert({
        symptoms: conversation.filter((m) => m.role === "user").map((m) => m.content).join(" | ").substring(0, 500),
        urgency: urgencyLevel,
        conditions: [],
        patient_age: patient_age ?? null,
        patient_gender: patient_gender ?? null,
      });
    }

    // ── STAGE 3: SSE ReadableStream (meta first, then streamed text, then [DONE]) ──
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(meta)}\n\n`));
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`));
            }
          }
        } catch (streamErr) {
          const info = describeAiError(streamErr);
          console.error(`Symptom check stream error [${info.code}]:`, info.detail);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: info.clientMessage })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const info = describeAiError(err);
    console.error(`Symptom check error [${info.code}]:`, info.detail, err);
    return NextResponse.json(
      { success: false, error: info.clientMessage, ...(exposeAiDetail() ? { code: info.code, detail: info.detail } : {}) },
      { status: info.httpStatus }
    );
  }
}
