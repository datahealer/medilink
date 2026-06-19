import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createServiceSupabase } from "@/lib/supabase/service";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const STRUCTURED_SYSTEM = `You are a clinical triage assistant. Given the patient's described symptoms, respond ONLY with valid JSON:
{
  "is_medical": true | false,
  "urgency_level": "self-care" | "see-doctor" | "emergency",
  "conditions": ["condition1", "condition2"],
  "home_remedies": ["remedy1", "remedy2"],
  "recommended_action": "brief recommended action",
  "disclaimer": "This is not a medical diagnosis. Always consult a qualified doctor."
}
Rules:
- If the input contains no recognizable medical symptoms, health complaints, or physical conditions (e.g. random words, gibberish, unrelated text) → set is_medical: false, urgency_level: "self-care", conditions: [], home_remedies: []
- Only set is_medical: true when the input describes an actual health concern, symptom, or physical complaint
Urgency rules (only apply when is_medical: true):
- "self-care": minor issues manageable at home (cold, mild rash, minor headache, mild runny nose, mild cough)
- "see-doctor": needs professional evaluation within days (persistent pain, fever > 3 days, skin infections)
- "emergency": requires immediate emergency care (chest pain, difficulty breathing, stroke symptoms, severe injuries)
home_remedies rules:
- For "self-care" urgency: provide 3–5 practical home remedies specific to the symptom (e.g. rest, fluids, steam inhalation for runny nose)
- For "see-doctor" or "emergency": return home_remedies: [] — do not suggest home treatment for serious conditions`;

const EXPLANATION_SYSTEM = `You are a compassionate medical assistant explaining possible conditions to a patient in plain, easy-to-understand language.
Format your ENTIRE response as repeating point + description pairs, like this:

**What it could be**
Brief explanation of the possible condition in simple words.

**Why it happens**
Explain the likely cause in plain language.

**What you should do**
Specific actionable steps the patient can take.

**Home Remedies**
Only include this section for mild/self-care symptoms. List 3–5 practical remedies the patient can try at home right now (e.g. rest, steam inhalation, warm fluids, saline rinse, honey and ginger for sore throat). Skip this section entirely for serious or emergency conditions.

**When to Book a Doctor**
If symptoms are mild, advise booking a General Physician if there is no improvement within 2–3 days, or sooner if symptoms worsen. For serious conditions, recommend seeing a doctor promptly.

**When to seek help**
Clear signs that mean they need immediate medical attention.

**Important reminder**
Always consult a qualified doctor for a proper diagnosis and treatment.

Rules:
- Always use bold **Point** on its own line, followed by the description on the next line.
- Do not use bullet points, numbered lists, or paragraphs — only the point+description format above.
- Use simple, empathetic language. No medical jargon.
- Only include the **Home Remedies** section when the condition is clearly mild and manageable at home.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symptoms, patient_age, patient_gender } = body as {
      symptoms: string;
      patient_age?: number;
      patient_gender?: string;
    };

    if (!symptoms || typeof symptoms !== "string" || !symptoms.trim()) {
      return NextResponse.json({ success: false, error: "Symptoms are required" }, { status: 400 });
    }

    const patientContext = [
      patient_age ? `Patient age: ${patient_age}` : null,
      patient_gender && patient_gender !== "prefer-not" ? `Patient gender: ${patient_gender}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const userMessage = patientContext
      ? `${symptoms}\n\n(${patientContext})`
      : symptoms;

    // Step 1: Quick structured call for urgency + conditions
    const structured = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: STRUCTURED_SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const meta = JSON.parse(structured.choices[0].message.content ?? "{}") as {
      is_medical: boolean;
      urgency_level: string;
      conditions: string[];
      home_remedies: string[];
      recommended_action: string;
      disclaimer: string;
    };

    // Reject non-medical input gracefully before streaming
    if (meta.is_medical === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            "That doesn't look like a medical symptom. Please describe what you're feeling physically — for example, \"I have a headache and fever for 2 days.\"",
        },
        { status: 400 }
      );
    }

    // Step 2: Log anonymized query (no user_id — per spec)
    const supabase = createServiceSupabase();
    await supabase.from("symptom_check_logs").insert({
      symptoms: symptoms.substring(0, 500), // cap length
      urgency: meta.urgency_level,
      conditions: meta.conditions ?? [],
      patient_age: patient_age ?? null,
      patient_gender: patient_gender ?? null,
    });

    // Step 3: Streaming call for detailed explanation
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: EXPLANATION_SYSTEM },
        {
          role: "user",
          content: `Symptoms: ${symptoms}${patientContext ? `\n${patientContext}` : ""}
Possible conditions identified: ${(meta.conditions ?? []).join(", ")}.
Please explain what these conditions are, what might be causing the symptoms, and what the patient should do next.`,
        },
      ],
      stream: true,
      temperature: 0.4,
    });

    // Step 4: Build SSE ReadableStream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        // Send meta event first
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "meta", ...meta })}\n\n`
          )
        );

        // Stream explanation chunks
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", content: text })}\n\n`
              )
            );
          }
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
    console.error("Symptom check error:", err);
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
