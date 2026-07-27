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

// STAGE 1 — the "triage director": reads the WHOLE conversation and decides whether we still
// need to ask questions (gathering) or have enough to give responsible guidance (assessment).
const TRIAGE_DIRECTOR_SYSTEM = `You are a careful clinical triage assistant having a CONVERSATION with a patient. Read the ENTIRE conversation so far (every earlier symptom matters — never forget them) and decide the next step. Respond ONLY with valid JSON:
{
  "is_medical": true | false,
  "phase": "gathering" | "assessment",
  "is_emergency": true | false,
  "urgency_level": "self-care" | "see-doctor" | "urgent-24h" | "emergency",
  "conditions": ["plain-language possible cause", "..."],
  "recommended_action": "one short sentence describing what the patient should do next"
}
Rules:
- is_medical: false ONLY if the conversation has no health content at all (gibberish / off-topic). Then set phase:"assessment", urgency_level:"self-care", conditions:[], and recommended_action must gently say you can only help with health symptoms.
- phase "gathering": choose when you still need important clinical detail (location, onset/duration, severity, character, associated symptoms, or relevant history like pregnancy/diabetes) to give SAFE guidance. When the patient has given only a SINGLE, unqualified symptom (e.g. just "chest pain", "headache", "stomach ache") and has NOT yet mentioned any red-flag feature, prefer "gathering" and ask the key clarifying questions first — do not jump straight to emergency on an isolated symptom alone.
- phase "assessment": choose when you already have enough for responsible guidance — OR the moment any emergency red flag appears (then assess IMMEDIATELY, do not keep asking).
- is_emergency + urgency_level "emergency": set as soon as a red flag is present or clearly implied — chest pain radiating to arm/jaw/neck, chest pain WITH sweating / shortness of breath / nausea, stroke signs (face droop, arm weakness, speech difficulty), severe breathing difficulty, anaphylaxis, uncontrolled bleeding, or suicidal intent. When is_emergency is true, phase MUST be "assessment". Never downgrade an emergency to keep chatting.
- urgency_level meaning: "self-care" = manage at home; "see-doctor" = get professional evaluation soon; "urgent-24h" = see a doctor within 24 hours; "emergency" = seek immediate emergency care.
- conditions: 1–4 plain-language possible causes, ONLY when phase is "assessment" and is_medical is true; otherwise [].
- Base every decision on the FULL conversation, not just the last message.`;

// STAGE 2 prompts — generate the human-facing streamed text for the chosen phase.
const GATHERING_SYSTEM = `You are a warm, concise medical assistant gathering information in a chat. Based on the WHOLE conversation, ask ONLY the 1–4 MOST useful follow-up questions to clarify the patient's symptoms.
- Start with a brief acknowledgement (e.g. "Thank you." or "Understood.").
- Then ask focused questions as a short bulleted list, each line starting with "• ".
- Do NOT diagnose or give advice yet. Do NOT repeat anything the patient has already answered.
- Keep it short, human, and in plain language.`;

const ASSESSMENT_SYSTEM = `You are a compassionate medical assistant explaining possible conditions to a patient in plain, easy-to-understand language, using everything shared in the conversation.
Format your ENTIRE response as repeating point + description pairs:

**What it could be**
Brief explanation of the possible condition(s) in simple words.

**Why it happens**
The likely cause in plain language.

**What you should do**
Specific, actionable next steps.

**Home Remedies**
Only include this section for mild/self-care symptoms. List 3–5 practical remedies. Skip entirely for serious or emergency conditions.

**When to seek help**
Clear signs that mean the patient needs prompt or immediate medical attention.

Rules:
- Always put the bold **Heading** on its own line, followed by its description on the next line.
- No bullet points, numbered lists, or long paragraphs — only the heading + description format.
- Simple, empathetic language. No jargon.`;

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

    // ── STAGE 1: triage director decides gathering vs assessment (structured JSON) ──
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
      phase?: "gathering" | "assessment";
      is_emergency?: boolean;
      urgency_level?: string;
      conditions?: string[];
      recommended_action?: string;
    };

    const isMedical = director.is_medical !== false;
    const isEmergency = !!director.is_emergency;
    // Emergencies must be assessed immediately, never left in "gathering".
    const phase: "gathering" | "assessment" = !isMedical
      ? "assessment"
      : isEmergency
        ? "assessment"
        : director.phase === "assessment"
          ? "assessment"
          : "gathering";
    const urgencyLevel = isMedical ? (director.urgency_level ?? "see-doctor") : "self-care";

    // The structured meta the client renders (badge, conditions, CTA). `ask_recommend_doctors`
    // is true only once we've reached a real assessment for a medical issue.
    const meta = {
      type: "meta" as const,
      phase,
      is_medical: isMedical,
      is_emergency: isEmergency,
      urgency_level: urgencyLevel,
      conditions: phase === "assessment" && isMedical ? (director.conditions ?? []) : [],
      recommended_action: director.recommended_action ?? "",
      disclaimer: DISCLAIMER,
      ask_recommend_doctors: phase === "assessment" && isMedical,
    };

    // ── STAGE 2: stream the human-facing text for the chosen phase ──
    const systemForPhase = !isMedical
      ? NON_MEDICAL_SYSTEM
      : phase === "gathering"
        ? GATHERING_SYSTEM
        : ASSESSMENT_SYSTEM;

    const stream = await groqClient().chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemForPhase + (patientContext ? `\n\nPatient context: ${patientContext}.` : "") },
        ...conversation,
      ],
      stream: true,
      temperature: phase === "assessment" ? 0.4 : 0.3,
    });

    // Logging: count every turn toward the rate limit; only record a completed check to
    // symptom_check_logs when we actually produced an assessment.
    await serviceSupabase.from("ai_request_logs").insert({
      user_id: user.id,
      feature: "symptom_check",
      prompt_hash: hashText(conversation[conversation.length - 1].content),
    });
    if (phase === "assessment" && isMedical) {
      await serviceSupabase.from("symptom_check_logs").insert({
        symptoms: conversation.filter((m) => m.role === "user").map((m) => m.content).join(" | ").substring(0, 500),
        urgency: urgencyLevel,
        conditions: meta.conditions,
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
