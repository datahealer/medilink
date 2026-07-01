# AI Features — Backend/Product Spec (gaps & future enhancements)

> Context: Module 1 of the post-integration pass. **AI Doctor Recommendations** and the
> **AI Health Insights → visit summary** are now connected to the existing backend (see below).
> This document specifies the remaining gaps that are intentionally **not** implemented, so the
> approved UX is preserved and no backend/API is invented.

## Connected now (existing backend — no new work)
- **AI Recommendations** → `POST /api/ai/suggest-doctor` (Groq `llama-3.3-70b`, `MOCK_AI` fallback).
  Returns `{ ai_reasoning, urgency_level, suggested_specialties[], recommended_doctors[] }`. Mobile
  reads via `AiRepository.suggestDoctors(symptoms)`; symptoms are carried from the Me Assistant.
- **AI Health Insights → visit summary** → `appointments.patient_summary` (written by the
  `generate-health-insights` Edge Function, triggered on appointment notes). Mobile reads the
  patient's latest AI summary via `AiRepository.latestVisitSummary()`.

---

## Gap 1 — Symptom Checker: guided chat vs one-shot triage (product + backend)
**Approved design (p26):** a *guided, multi-turn* chat — assistant asks follow-up questions with
quick-reply chips ("does it worsen with activity? Yes / No / Sometimes") and converges on advice.

**Existing endpoint:** `POST /api/ai/symptom-check` is a **single-shot free-text triage** — body
`{ symptoms, patient_age?, patient_gender? }` → `{ urgency_level, conditions[], home_remedies[],
recommended_action, disclaimer, explanation }`. It does not model a conversation or emit
next-question / quick-reply options.

**Decision required (do NOT change the approved UI until decided):**
- **Option A — Conversational triage endpoint:** extend/replace with a multi-turn endpoint that
  accepts the running transcript and returns the next assistant message **plus structured
  quick-reply options**, e.g.:
  ```
  POST /api/ai/symptom-check/next
  req:  { history: {role, content}[], answer?: string }
  res:  { message: string, quick_replies?: string[], done: boolean,
          result?: { urgency_level, conditions[], home_remedies[], recommended_action, disclaimer } }
  ```
  This backs the designed chip flow directly. Requires prompt/state design + `ai_request_logs` reuse.
- **Option B — Adopt free-text triage (product change):** accept the one-shot model and update the
  approved design to a free-text symptom box. (Rejected for now — keep the guided UI.)

**Current state:** the Symptom Checker screen UI is **unchanged** (guided/scripted). It is not wired,
pending this decision.

## Gap 2 — Vitals trend chart (backend data model) — FUTURE
The Insights screen's **vitals trend** (BP + heart rate over ~6 months) has **no backend source** —
there is no vitals/observations table anywhere. To support it:
```sql
CREATE TABLE public.patient_vitals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,          -- 'bp_systolic' | 'bp_diastolic' | 'heart_rate' | ...
  value_numeric NUMERIC NOT NULL,
  unit         TEXT,
  measured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: patient read own (patient_id IN (SELECT id FROM patient_profiles WHERE user_id = auth.uid()));
--      technician/facility write. Index (patient_id, kind, measured_at DESC).
```
Plus ingestion (technician entry during a visit) and a shared read (`getVitalsTrend(kind, months)`).
Until then the mobile chart stays a static visual placeholder (documented here).

## Gap 3 — Doctor "% match" score (backend) — FUTURE
The Recommendations design shows a per-doctor "% match" (e.g. "96% match"). `suggest-doctor` returns
`ai_reasoning` + `suggested_specialties` but **no per-doctor score**. To support it, have the endpoint
return a `match_score` (0–100) per `recommended_doctors[]` (from the model's ranking). Until then the
mobile omits the "% match" chip (not fabricated); the reasoning is shown via the "Why?" affordance.

---

## Rollout (when prioritized)
1. Decide Symptom Checker Option A vs B; if A, build the conversational endpoint → then wire the
   existing guided UI to it (chips driven by `quick_replies`).
2. Add `patient_vitals` (+ RLS + ingestion + shared read) → wire the Insights trend chart.
3. Add `match_score` to `suggest-doctor` → show the "% match" chip.
