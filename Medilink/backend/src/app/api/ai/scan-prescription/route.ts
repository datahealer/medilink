import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import sharp from "sharp";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { aiRateLimitMessage, isAiRateLimited, recordAiRequest } from "@/lib/ai/rateLimit";

// Vercel: sharp image compression + a Groq vision call can exceed the low default
// timeout; give it headroom.
export const maxDuration = 60;

// The most expensive AI route we have: an image upload, a sharp resize, and a *vision*
// completion. It was authenticated but unbounded, so one signed-in account could run the
// Groq bill up indefinitely. Lower than symptom-check's 40/hr because this is per-scan
// rather than per-chat-turn, but high enough to absorb the retries the route itself invites
// — a blurry photo comes back 422 "reupload a clearer image".
const RATE_LIMIT_PER_HOUR = 10;

// Reject oversized uploads before spending memory or CPU on them.
//
// 4 MB sits deliberately under Vercel's ~4.5 MB serverless request-body limit, so an
// oversized upload gets this explicit 413 instead of the platform's opaque rejection. The
// route downscales to 1024px/JPEG-80 anyway, so a larger original buys no accuracy — any
// client should compress before uploading rather than lean on this ceiling.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Lazy init: `next build` imports route modules for page-data collection, and the Groq
// SDK throws on an empty key at construction. Creating the client on first request keeps
// the build working without GROQ_API_KEY present, while runtime behavior is unchanged.
let _groq: Groq | null = null;
function groqClient(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const EXTRACTION_PROMPT = `You are an AI agent responsible for extracting structured medical prescription data from a prescription image.

You operate in a production healthcare system. Accuracy and safety are critical.

PRIMARY TASK:
Extract only clearly readable medication information from the prescription image.

STRICT CONSTRAINTS:
- Never guess, infer, or hallucinate medicine names, dosages, or instructions.
- Do not complete partial or unclear words.
- If the image is empty, noisy, blurry, or too low quality to read reliably → set status to NOT_READABLE.
- If confidence in extraction is low → set status to NOT_READABLE.
- Do not generate plausible-looking data.

VALIDATION LOGIC:
- Only include medications that are explicitly visible and readable in the image.
- Ignore uncertain or partially visible entries.
- Do not include duplicates or invalid entries.

FAIL-SAFE BEHAVIOR:
If ANY ambiguity exists in the image quality or content, prefer NOT_READABLE over incorrect output.

SYSTEM PRIORITY:
Safety > Accuracy > Completeness

Return ONLY valid JSON — no markdown, no explanation:
{
  "status": "OK" | "NOT_READABLE",
  "medications": [
    { "name": string, "dosage": string, "frequency": string, "duration": string }
  ],
  "doctor_name": string | null,
  "date": string | null,
  "raw_text": string
}
If a field is not visible, use an empty string "". The medications array must never be null.
If status is NOT_READABLE, return an empty medications array, null for doctor_name and date, and empty string for raw_text.`;

type ExtractedMedication = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
};

type AIResponse = {
  status?: "OK" | "NOT_READABLE";
  medications: ExtractedMedication[];
  doctor_name: string | null;
  date: string | null;
  raw_text: string;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Coarse guard first, on the declared body size: `req.formData()` buffers the entire
    // request, so checking Content-Length up front avoids pulling a huge payload into memory
    // just to measure it. Multipart framing makes this slightly larger than the file itself,
    // so it is a cheap outer bound only — `file.size` below is the precise check.
    const declaredLength = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES * 1.1) {
      return NextResponse.json(
        { success: false, error: "Image is too large. Please upload an image under 4 MB." },
        { status: 413 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No image provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "File must be an image" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image is too large. Please upload an image under 4 MB." },
        { status: 413 }
      );
    }

    // Quota check comes after the free validations above so malformed spam is rejected
    // without a DB round trip, but before sharp and the vision call — the two costly steps.
    if (await isAiRateLimited(user.id, "prescription_scan", RATE_LIMIT_PER_HOUR)) {
      return NextResponse.json(
        { success: false, error: aiRateLimitMessage(RATE_LIMIT_PER_HOUR) },
        { status: 429 }
      );
    }

    // Compress image with sharp — max 1024px, JPEG quality 80
    const arrayBuffer = await file.arrayBuffer();
    const compressed = await sharp(Buffer.from(arrayBuffer))
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64 = compressed.toString("base64");

    // Count the attempt before the paid call, so a scan that reaches Groq and then fails
    // (timeout, unparseable JSON, 422 NOT_READABLE) still consumes quota — it consumed cost.
    await recordAiRequest(user.id, "prescription_scan");

    // Call Groq vision model
    const completion = await groqClient().chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      // model: "meta-llama/llama-4-scout-17b-16e-instruct",
      // model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const rawContent = completion.choices[0].message.content ?? "{}";

    // Strip markdown code fences if model wraps JSON
    const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let aiResult: AIResponse;
    try {
      aiResult = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not parse prescription. Please try a clearer image." },
        { status: 422 }
      );
    }

    if (aiResult.status === "NOT_READABLE") {
      return NextResponse.json(
        { success: false, error: "The image is blurry. Please reupload a clearer image." },
        { status: 422 }
      );
    }

    if (!Array.isArray(aiResult.medications)) {
      aiResult.medications = [];
    }

    // Validate each medication name against drug_names table (case-insensitive)
    const medicationsWithRecognized = await Promise.all(
      aiResult.medications.map(async (med) => {
        if (!med.name?.trim()) return { ...med, recognized: false };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("drug_names") 
          .select("name")
          .ilike("name", med.name.trim())
          .maybeSingle();

        return { ...med, recognized: !!data };
      })
    );

    const unrecognized_count = medicationsWithRecognized.filter((m) => !m.recognized).length;

    return NextResponse.json({
      success: true,
      data: {
        medications: medicationsWithRecognized,
        doctor_name: aiResult.doctor_name ?? null,
        date: aiResult.date ?? null,
        unrecognized_count,
        image_data: `data:image/jpeg;base64,${base64}`,
      },
    });
  } catch (err: unknown) {
    console.error("AI scan-prescription error:", err);
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
