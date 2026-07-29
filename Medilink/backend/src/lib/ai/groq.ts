import Groq from "groq-sdk";

/**
 * Shared Groq access for every AI route. Centralizing the client, the model name, and
 * error classification here means all four AI features (suggest-doctor, symptom-check,
 * schedule-assist, scan-prescription) behave and fail identically — and, crucially, that
 * the ACTUAL upstream error (status/code/message) is captured instead of being flattened
 * into an opaque "Something went wrong." 500.
 */

/**
 * The chat model. Overridable via `GROQ_MODEL` so a decommissioned/renamed model is a
 * one-line env change with no redeploy of code. Default is Groq's current production
 * 70B model. (Groq periodically decommissions older Llama snapshots — when that happens
 * the API returns HTTP 400 `model_decommissioned`, which `describeAiError` surfaces.)
 */
export const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

// Lazy init: `next build` imports route modules for page-data collection, and the Groq
// SDK throws on an empty key at construction. Creating the client on first request keeps
// the build working without GROQ_API_KEY present, while runtime behavior is unchanged.
let _groq: Groq | null = null;
export function groqClient(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

/** True when the runtime has a (non-empty) Groq key. Used to fail fast with a clear message. */
export function groqKeyPresent(): boolean {
  return !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0;
}

export interface AiErrorInfo {
  /** Best HTTP status to return to the client. */
  httpStatus: number;
  /** Machine code for logs/telemetry (e.g. "no_api_key", "invalid_api_key", "model_decommissioned"). */
  code: string;
  /** Safe, human-facing message. */
  clientMessage: string;
  /** Raw upstream status from Groq, if any. */
  upstreamStatus?: number;
  /** Raw upstream detail (for logs / dev-only response passthrough). */
  detail: string;
}

/**
 * Turn any thrown value from a Groq call into a classified, actionable error. Reads the
 * Groq SDK's APIError shape (`.status`, `.error.code`, `.error.message`) defensively so it
 * survives SDK version changes, and maps the common failure modes to clear messages:
 *  - missing key            → 503 "AI is not configured"
 *  - 401/403 invalid key    → 502 "AI credentials were rejected"
 *  - 400 model_decommissioned/model_not_found → 502 "AI model unavailable"
 *  - 429 rate limit         → 429 "AI rate limit reached"
 *  - connection error       → 503 "AI service unreachable"
 */
export function describeAiError(err: unknown): AiErrorInfo {
  if (!groqKeyPresent()) {
    return {
      httpStatus: 503,
      code: "no_api_key",
      clientMessage: "AI is not configured on the server. Please contact support.",
      detail: "GROQ_API_KEY is missing or empty at runtime.",
    };
  }

  const e = err as {
    status?: number;
    message?: string;
    code?: string;
    error?: { code?: string; message?: string; type?: string } | string;
    name?: string;
  };

  const upstreamStatus = typeof e?.status === "number" ? e.status : undefined;
  const nested = typeof e?.error === "object" && e.error ? e.error : undefined;
  const upstreamCode = (nested?.code || e?.code || "") as string;
  const rawMessage = nested?.message || e?.message || String(err ?? "unknown error");
  const detail = `[${e?.name ?? "Error"}] status=${upstreamStatus ?? "n/a"} code=${upstreamCode || "n/a"} :: ${rawMessage}`;

  // Model decommissioned / not found (Groq returns 400 with these codes).
  if (
    upstreamStatus === 400 &&
    (/decommission|not.?found|does not exist|model/i.test(upstreamCode) ||
      /decommission|model_not_found|does not exist/i.test(rawMessage))
  ) {
    return {
      httpStatus: 502,
      code: upstreamCode || "model_unavailable",
      clientMessage: "The AI model is temporarily unavailable. Please try again shortly.",
      upstreamStatus,
      detail,
    };
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      httpStatus: 502,
      code: upstreamCode || "invalid_api_key",
      clientMessage: "The AI service rejected the server credentials. Please contact support.",
      upstreamStatus,
      detail,
    };
  }

  if (upstreamStatus === 429 || /rate.?limit/i.test(rawMessage)) {
    return {
      httpStatus: 429,
      code: upstreamCode || "rate_limited",
      clientMessage: "AI rate limit reached. Please try again in a moment.",
      upstreamStatus,
      detail,
    };
  }

  if (upstreamStatus === 503 || /service unavailable/i.test(rawMessage)) {
    return {
      httpStatus: 503,
      code: "service_unavailable",
      clientMessage: "AI service temporarily unavailable. Please try again.",
      upstreamStatus,
      detail,
    };
  }

  // APIConnectionError / fetch failure — no HTTP status.
  if (upstreamStatus === undefined && /connect|network|fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(rawMessage)) {
    return {
      httpStatus: 503,
      code: "connection_error",
      clientMessage: "Couldn't reach the AI service. Please try again.",
      detail,
    };
  }

  return {
    httpStatus: 500,
    code: upstreamCode || "unknown",
    clientMessage: "Something went wrong. Please try again.",
    upstreamStatus,
    detail,
  };
}

/** Whether to include raw error detail in the HTTP response (never in production). */
export function exposeAiDetail(): boolean {
  return process.env.NODE_ENV !== "production";
}
