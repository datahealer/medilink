"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { env } from "@/lib/env";
import { BookingModal, type ViewDoctor } from "@/components/dashboard/DoctorBooking";

type Urgency = "self-care" | "see-doctor" | "emergency";

type Doctor = {
  id: string;
  full_name: string;
  specialty: string | null;
  avg_rating: number;
  fees: { in_person?: number; online?: number } | null;
  profile_photo_url: string | null;
};

const DOCTOR_GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]",
  "from-[#d1fae5] to-[#d5e8f5]", "from-[#fde68a] to-[#e8d5f0]", "from-[#e8d5f0] to-[#d1fae5]",
];

function toViewDoctor(doc: Doctor, index: number, ar: boolean): ViewDoctor {
  const initials = doc.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
  return {
    id: doc.id,
    initials,
    grad: DOCTOR_GRADS[index % DOCTOR_GRADS.length]!,
    specialty: doc.specialty ?? (ar ? "طب عام" : "General Medicine"),
    bio: "",
    fee: doc.fees?.in_person ?? doc.fees?.online ?? 0,
    rating: doc.avg_rating,
    reviews: 0,
    available: true,
    name: doc.full_name,
    hospital: ar ? "شبكة ميدلينك" : "MediLink Network",
    type: ar ? "في العيادة" : "In-clinic",
    education: ar ? "غير محدد" : "Not specified",
    experience: ar ? "غير محدد" : "Not specified",
    languages: ar ? "غير محدد" : "Not specified",
    location: ar ? "عُمان" : "Oman",
  };
}

type Meta = {
  urgency_level: Urgency;
  conditions: string[];
  home_remedies: string[];
  recommended_action: string;
  disclaimer: string;
  recommended_doctors?: Doctor[];
};

type Status = "idle" | "loading" | "streaming" | "done" | "error";

const EXAMPLES = [
  { en: "Headache and mild fever for 2 days", ar: "صداع وحمى خفيفة منذ يومين" },
  { en: "Sore throat and runny nose",          ar: "التهاب حلق وسيلان أنف" },
  { en: "Sharp pain in lower back",            ar: "ألم حاد في أسفل الظهر" },
  { en: "Itchy red rash on my arm",            ar: "طفح جلدي أحمر مثير للحكة على ذراعي" },
];

const URGENCY_STYLE: Record<Urgency, { bg: string; border: string; text: string; dot: string }> = {
  "self-care":  { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800/40", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  "see-doctor": { bg: "bg-amber-50 dark:bg-amber-900/20",     border: "border-amber-200 dark:border-amber-800/40",     text: "text-amber-700 dark:text-amber-400",     dot: "bg-amber-500" },
  "emergency":  { bg: "bg-rose-50 dark:bg-rose-900/20",       border: "border-rose-200 dark:border-rose-800/40",       text: "text-rose-700 dark:text-rose-400",       dot: "bg-rose-500" },
};

const URGENCY_LABEL: Record<Urgency, { en: string; ar: string }> = {
  "self-care":  { en: "Self-care",       ar: "رعاية ذاتية" },
  "see-doctor": { en: "See a doctor",    ar: "استشر طبيباً" },
  "emergency":  { en: "Emergency",       ar: "حالة طارئة" },
};

/** Renders **bold** markers from the streamed explanation as headings. */
function ExplanationText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <p className="text-sm leading-relaxed text-[#2E1A47]/80 dark:text-[#DFC8E7]/80 whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} className="block mt-4 first:mt-0 font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7]">
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export default function SymptomCheckerPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [symptoms, setSymptoms] = useState("");
  const [age, setAge]           = useState("");
  const [gender, setGender]     = useState<"female" | "male" | "prefer-not">("prefer-not");

  const [status, setStatus]         = useState<Status>("idle");
  const [meta, setMeta]             = useState<Meta | null>(null);
  const [explanation, setExplanation] = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [booking, setBooking]       = useState<ViewDoctor | null>(null);

  const busy = status === "loading" || status === "streaming";

  async function runCheck() {
    if (!symptoms.trim() || busy) return;
    setStatus("loading");
    setError(null);
    setMeta(null);
    setExplanation("");

    try {
      const res = await fetch(`${env.BACKEND_URL}/api/ai/symptom-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: symptoms.trim(),
          patient_age: age ? Number(age) : undefined,
          patient_gender: gender,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || (ar ? "حدث خطأ ما. حاول مرة أخرى." : "Something went wrong. Please try again."));
      }

      setStatus("streaming");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;

          const evt = JSON.parse(payload);
          if (evt.type === "meta") {
            const { type: _type, is_medical: _isMedical, ...rest } = evt;
            setMeta(rest as Meta);
          } else if (evt.type === "text") {
            setExplanation(prev => prev + evt.content);
          }
        }
      }

      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : (ar ? "حدث خطأ ما. حاول مرة أخرى." : "Something went wrong. Please try again."));
    }
  }

  function reset() {
    setStatus("idle");
    setMeta(null);
    setExplanation("");
    setError(null);
    setSymptoms("");
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-center gap-4 ${ar ? "flex-row-reverse text-right" : ""}`}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              🤖
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "rgba(223,200,231,0.6)" }}>
                {ar ? "بالذكاء الاصطناعي" : "AI-powered"}
              </p>
              <h1 className="font-black font-serif text-white text-2xl leading-tight">
                {ar ? "فاحص الأعراض" : "Symptom Checker"}
              </h1>
            </div>
          </div>
          <p className="text-sm mt-4 max-w-xl leading-relaxed" style={{ color: "rgba(223,200,231,0.6)" }}>
            {ar
              ? "صف ما تشعر به وسنقدم لك إرشادات أولية. هذه الأداة لا تُعد تشخيصاً طبياً ولا تغني عن استشارة طبيب مختص."
              : "Describe what you're feeling and get instant, plain-language guidance. This tool does not provide a medical diagnosis and is not a substitute for professional care."}
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Input card */}
        <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6 space-y-5">
          <div className={ar ? "text-right" : ""}>
            <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-2">
              {ar ? "ما هي أعراضك؟" : "What are your symptoms?"}
            </p>
            <textarea
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder={ar ? "مثال: صداع وحمى منذ يومين..." : "e.g. I have a headache and fever for 2 days..."}
              className={`w-full text-sm font-medium text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-4 py-3 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all resize-none disabled:opacity-60 ${ar ? "text-right" : ""}`}
            />
          </div>

          {/* Examples */}
          <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
            {EXAMPLES.map(ex => (
              <button key={ex.en} type="button" disabled={busy}
                onClick={() => setSymptoms(ar ? ex.ar : ex.en)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:border-[#46255f]/40 hover:text-[#46255f] dark:hover:text-[#DFC8E7] transition-colors disabled:opacity-50">
                {ar ? ex.ar : ex.en}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={ar ? "text-right" : ""}>
              <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-1.5">
                {ar ? "العمر (اختياري)" : "Age (optional)"}
              </p>
              <input type="number" min={0} max={120} value={age} disabled={busy}
                onChange={e => setAge(e.target.value)}
                className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all disabled:opacity-60 ${ar ? "text-right" : ""}`} />
            </div>
            <div className={ar ? "text-right" : ""}>
              <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-1.5">
                {ar ? "الجنس (اختياري)" : "Gender (optional)"}
              </p>
              <select value={gender} disabled={busy}
                onChange={e => setGender(e.target.value as typeof gender)}
                className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all disabled:opacity-60 ${ar ? "text-right" : ""}`}>
                <option value="prefer-not">{ar ? "تفضل عدم الذكر" : "Prefer not to say"}</option>
                <option value="female">{ar ? "أنثى" : "Female"}</option>
                <option value="male">{ar ? "ذكر" : "Male"}</option>
              </select>
            </div>
          </div>

          <button onClick={runCheck} disabled={!symptoms.trim() || busy}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
            {status === "loading"
              ? (ar ? "جاري التحليل..." : "Analyzing...")
              : status === "streaming"
              ? (ar ? "جاري كتابة النتيجة..." : "Writing your result...")
              : (ar ? "تحقق من الأعراض" : "Check symptoms")}
          </button>
        </div>

        {/* Error */}
        {status === "error" && error && (
          <div className={`bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl p-5 text-sm font-medium text-rose-700 dark:text-rose-400 ${ar ? "text-right" : ""}`}>
            {error}
          </div>
        )}

        {/* Results */}
        {meta && (
          <div className="space-y-5">
            {/* Urgency banner */}
            <div className={`rounded-2xl border p-5 ${URGENCY_STYLE[meta.urgency_level].bg} ${URGENCY_STYLE[meta.urgency_level].border}`}>
              <div className={`flex items-center gap-3 ${ar ? "flex-row-reverse" : ""}`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${URGENCY_STYLE[meta.urgency_level].dot} ${meta.urgency_level === "emergency" ? "animate-pulse" : ""}`} />
                <p className={`text-sm font-bold ${URGENCY_STYLE[meta.urgency_level].text}`}>
                  {ar ? URGENCY_LABEL[meta.urgency_level].ar : URGENCY_LABEL[meta.urgency_level].en}
                </p>
              </div>
              <p className={`text-sm mt-2 leading-relaxed text-[#2E1A47]/75 dark:text-[#DFC8E7]/75 ${ar ? "text-right" : ""}`}>
                {meta.recommended_action}
              </p>
              {meta.urgency_level === "emergency" && (
                <p className={`text-xs font-bold mt-3 ${URGENCY_STYLE[meta.urgency_level].text} ${ar ? "text-right" : ""}`}>
                  {ar ? "⚠️ اذهب إلى أقرب قسم طوارئ أو اتصل بالإسعاف فوراً." : "⚠️ Go to the nearest emergency room or call an ambulance immediately."}
                </p>
              )}
            </div>

            {/* Conditions */}
            {meta.conditions.length > 0 && (
              <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
                <p className={`text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-3 ${ar ? "text-right" : ""}`}>
                  {ar ? "الحالات المحتملة" : "Possible conditions"}
                </p>
                <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                  {meta.conditions.map(c => (
                    <span key={c} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#f0e8f8] dark:bg-[#2E1A47]/40 text-[#46255f] dark:text-[#DFC8E7]/80">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation */}
            {(explanation || status === "streaming") && (
              <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
                <p className={`text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-3 ${ar ? "text-right" : ""}`}>
                  {ar ? "الشرح التفصيلي" : "Detailed explanation"}
                </p>
                <ExplanationText text={explanation} />
                {status === "streaming" && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#46255f]/50 dark:bg-[#DFC8E7]/50 animate-pulse align-middle" />
                )}
              </div>
            )}

            {/* Home remedies */}
            {meta.home_remedies.length > 0 && (
              <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
                <p className={`text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-3 ${ar ? "text-right" : ""}`}>
                  {ar ? "علاجات منزلية" : "Home remedies"}
                </p>
                <ul className="space-y-2">
                  {meta.home_remedies.map(r => (
                    <li key={r} className={`flex items-start gap-2 text-sm text-[#2E1A47]/75 dark:text-[#DFC8E7]/75 ${ar ? "flex-row-reverse text-right" : ""}`}>
                      <span className="text-emerald-500 flex-shrink-0">✓</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related doctors */}
            {(meta.recommended_doctors?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
                <p className={`text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-3 ${ar ? "text-right" : ""}`}>
                  {ar ? "أطباء ذوو صلة" : "Related doctors"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {meta.recommended_doctors!.map((doc, index) => {
                    const initials = doc.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
                    const fee = doc.fees?.in_person ?? doc.fees?.online;
                    return (
                      <div key={doc.id} className="rounded-xl border border-[#e7dcee] dark:border-[#3a2560] p-3">
                        <div className={`flex items-center gap-3 ${ar ? "flex-row-reverse text-right" : ""}`}>
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black text-[#2E1A47] flex-shrink-0 bg-gradient-to-br from-[#e8d5f0] to-[#d5e8f5]">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{doc.full_name}</p>
                            <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold truncate">{doc.specialty}</p>
                            <div className={`flex items-center gap-2 mt-0.5 ${ar ? "flex-row-reverse" : ""}`}>
                              <span className="flex items-center gap-0.5 text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
                                <span className="text-amber-400">★</span> {doc.avg_rating?.toFixed(1) ?? "—"}
                              </span>
                              {typeof fee === "number" && (
                                <>
                                  <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
                                  <span className="text-xs font-bold text-[#2E1A47] dark:text-[#DFC8E7]">
                                    {ar ? `${fee} ر.ع.` : `OMR ${fee}`}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`mt-3 flex gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                          <Link href={`/dashboard/find-doctors/${doc.id}`}
                            className="flex-1 text-center py-2 rounded-lg font-bold text-xs border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#46255f]/50 hover:text-[#46255f] dark:hover:text-[#DFC8E7] transition-all no-underline">
                            {ar ? "الملف الشخصي" : "View Profile"}
                          </Link>
                          <button onClick={() => setBooking(toViewDoctor(doc, index, ar))}
                            className="flex-1 py-2 rounded-lg font-bold text-xs text-[#2E1A47] transition-opacity hover:opacity-85"
                            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                            {ar ? "احجز" : "Book"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Disclaimer + actions */}
            <p className={`text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 leading-relaxed ${ar ? "text-right" : ""}`}>
              {meta.disclaimer}
            </p>

            {status === "done" && (
              <div className={`flex gap-3 ${ar ? "flex-row-reverse" : ""}`}>
                {meta.urgency_level !== "self-care" && !meta.recommended_doctors?.length && (
                  <Link href="/dashboard/find-doctors"
                    className="flex-1 text-center py-3 rounded-xl font-bold text-sm text-[#2E1A47] no-underline transition-opacity hover:opacity-85"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                    {ar ? "ابحث عن طبيب" : "Find a doctor"}
                  </Link>
                )}
                <button onClick={reset}
                  className="flex-1 py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
                  {ar ? "فحص جديد" : "New check"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {booking && (
        <BookingModal doctor={booking} isAr={ar} onClose={() => setBooking(null)} />
      )}
    </div>
  );
}
