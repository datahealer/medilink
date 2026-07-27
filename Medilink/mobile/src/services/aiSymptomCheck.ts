import { apiBaseUrl } from "./api";
import { getAccessToken } from "@/lib/supabase";

/** One turn of the symptom-checker conversation. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Structured header the symptom-check SSE endpoint emits first (the `meta` event). */
export interface SymptomCheckMeta {
  /** "gathering" = the AI is still asking follow-up questions; "assessment" = final guidance. */
  phase: "gathering" | "assessment";
  is_medical: boolean;
  is_emergency: boolean;
  urgency_level: "self-care" | "see-doctor" | "urgent-24h" | "emergency" | string;
  conditions: string[];
  recommended_action: string;
  disclaimer: string;
  /** True once the AI has enough info and offers to recommend doctors. */
  ask_recommend_doctors: boolean;
}

export interface SymptomStreamHandlers {
  /** Structured triage header (phase, urgency, conditions, disclaimer, CTA). */
  onMeta?: (meta: SymptomCheckMeta) => void;
  /** Accumulated explanation/question text so far (called on each streamed chunk). */
  onText?: (fullText: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * Consume the streaming endpoint `POST /api/ai/symptom-check` (SSE) as a CONVERSATION.
 *
 * The full chat history is sent with every turn (`{ messages: ChatTurn[] }`) so the AI never
 * forgets earlier symptoms — exactly like ChatGPT. Uses XMLHttpRequest, which surfaces partial
 * `responseText` at readyState 3 for true token-by-token streaming where the platform supports
 * it, and a complete result at readyState 4 otherwise. Parses `data:` events
 * (`{type:'meta'}` + `{type:'text',content}` + `{type:'error'}` + `[DONE]`) and handles the
 * JSON error responses the endpoint returns for auth / validation failures. Returns `abort()`.
 */
export function streamSymptomChat(messages: ChatTurn[], handlers: SymptomStreamHandlers): () => void {
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

    // Non-stream (auth / validation) errors come back as JSON, not SSE.
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
        const evt = JSON.parse(payload) as { type?: string; content?: string; message?: string } & Partial<SymptomCheckMeta>;
        if (evt.type === "meta") {
          handlers.onMeta?.(evt as SymptomCheckMeta);
        } else if (evt.type === "text" && typeof evt.content === "string") {
          explanation += evt.content;
          handlers.onText?.(explanation);
        } else if (evt.type === "error") {
          finish(() => handlers.onError?.(evt.message || "The AI service had a problem. Please try again."));
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
      if (!finished) {
        if (xhr.status === 401) {
          finish(() => handlers.onError?.("Your session has expired. Please sign in again."));
        } else if (xhr.status >= 400) {
          finish(() => handlers.onError?.("The AI service is unavailable right now. Please try again."));
        } else {
          finish(() => handlers.onDone?.());
        }
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
      xhr.send(JSON.stringify({ messages }));
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
