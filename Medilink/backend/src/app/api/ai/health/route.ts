import { NextResponse } from "next/server";
import { GROQ_MODEL, describeAiError, groqClient, groqKeyPresent } from "@/lib/ai/groq";

export const maxDuration = 30;

/**
 * AI health / diagnostic endpoint. Hit `GET /api/ai/health` to capture the exact runtime
 * state of the AI stack in one request — whether a key is present, which model is
 * configured, and, via one tiny live Groq completion, the precise upstream status / code /
 * message when something is wrong (instead of an opaque 500). No auth so it can be curled
 * directly while debugging; it never returns the key itself, only whether one is present.
 */
export async function GET() {
  const keyPresent = groqKeyPresent();
  const base = {
    keyPresent,
    keyPrefix: keyPresent ? `${(process.env.GROQ_API_KEY ?? "").slice(0, 7)}…` : null,
    model: GROQ_MODEL,
    nodeEnv: process.env.NODE_ENV ?? null,
  };

  if (!keyPresent) {
    return NextResponse.json(
      { ok: false, ...base, error: { code: "no_api_key", message: "GROQ_API_KEY is missing at runtime." } },
      { status: 503 }
    );
  }

  try {
    const started = Date.now();
    const completion = await groqClient().chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
      max_tokens: 5,
      temperature: 0,
    });
    return NextResponse.json({
      ok: true,
      ...base,
      latencyMs: Date.now() - started,
      groqReply: completion.choices[0]?.message?.content ?? "",
    });
  } catch (err) {
    const info = describeAiError(err);
    console.error("[ai/health] Groq call failed:", info.detail, err);
    return NextResponse.json(
      {
        ok: false,
        ...base,
        error: {
          code: info.code,
          upstreamStatus: info.upstreamStatus ?? null,
          message: info.clientMessage,
          detail: info.detail,
        },
      },
      { status: info.httpStatus }
    );
  }
}
