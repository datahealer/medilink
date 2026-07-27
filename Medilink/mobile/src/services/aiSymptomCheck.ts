import { apiBaseUrl } from "./api";
import { getAccessToken } from "@/lib/supabase";

/** Structured header the symptom-check SSE endpoint emits first (the `meta` event). */
export interface SymptomCheckMeta {
  is_medical: boolean;
  urgency_level: "self-care" | "see-doctor" | "emergency";
  conditions: string[];
  home_remedies: string[];
  recommended_action: string;
  disclaimer: string;
}

export interface SymptomStreamHandlers {
  /** Structured triage header (urgency, conditions, remedies, disclaimer). */
  onMeta?: (meta: SymptomCheckMeta) => void;
  /** Accumulated explanation text so far (called on each streamed chunk). */
  onText?: (fullText: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * Consume the existing streaming endpoint `POST /api/ai/symptom-check` (SSE) from React
 * Native. Uses XMLHttpRequest, which surfaces partial `responseText` at readyState 3 —
 * giving true token-by-token streaming where the platform supports it, and a complete
 * result at readyState 4 otherwise (graceful degradation). Parses `data: {json}` events
 * (`{type:'meta'}` + `{type:'text',content}` + `[DONE]`) and handles the JSON 400 that
 * the endpoint returns for non-medical input. Returns an `abort()` function.
 */
export function streamSymptomCheck(symptoms: string, handlers: SymptomStreamHandlers): () => void {
  const xhr = new XMLHttpRequest();
  let seen = 0; // index in responseText up to which complete lines were parsed
  let explanation = "";
  let finished = false;

  const finish = (fn?: () => void) => {
    if (!finished) {
      finished = true;
      fn?.();
    }
  };

  const parseBuffer = () => {
    const text = xhr.responseText ?? "";

    // Non-medical / error path returns JSON, not an SSE stream.
    const ct = (xhr.getResponseHeader?.("Content-Type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      try {
        const body = JSON.parse(text);
        finish(() => handlers.onError?.(body?.error || "Couldn't analyze those symptoms."));
      } catch {
        /* partial JSON — wait for more */
      }
      return;
    }

    // Process only up to the last complete line; keep any partial trailing line buffered.
    const lastNL = text.lastIndexOf("\n");
    if (lastNL < seen) return;
    const chunk = text.slice(seen, lastNL + 1);
    seen = lastNL + 1;

    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        finish(() => handlers.onDone?.());
        continue;
      }
      try {
        const evt = JSON.parse(payload) as { type?: string; content?: string } & Partial<SymptomCheckMeta>;
        if (evt.type === "meta") {
          handlers.onMeta?.(evt as SymptomCheckMeta);
        } else if (evt.type === "text" && typeof evt.content === "string") {
          explanation += evt.content;
          handlers.onText?.(explanation);
        }
      } catch {
        /* line spanned a chunk boundary; it re-arrives complete next tick */
      }
    }
  };

  xhr.onreadystatechange = () => {
    if (xhr.readyState >= 3) parseBuffer();
    if (xhr.readyState === 4) {
      parseBuffer();
      if (xhr.status >= 400 && !finished) {
        finish(() => handlers.onError?.("The AI service is unavailable right now. Please try again."));
      } else {
        finish(() => handlers.onDone?.());
      }
    }
  };
  xhr.onerror = () => finish(() => handlers.onError?.("Network error. Please try again."));
  xhr.ontimeout = () => finish(() => handlers.onError?.("The request timed out. Please try again."));

  void (async () => {
    try {
      const token = await getAccessToken();
      xhr.open("POST", `${apiBaseUrl()}/api/ai/symptom-check`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "text/event-stream");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 60_000;
      xhr.send(JSON.stringify({ symptoms }));
    } catch {
      finish(() => handlers.onError?.("Couldn't start the request."));
    }
  })();

  return () => {
    try {
      xhr.abort();
    } catch {
      /* ignore */
    }
  };
}
