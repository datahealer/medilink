"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@medilink/shared";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Types ──────────────────────────────────────────────────────────── */
type FamilyMember = { name: string; relation: string; dob: string; blood: string };

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];
const GENDERS_EN   = ["Female", "Male", "Non-binary", "Prefer not to say"];
const GENDERS_AR   = ["أنثى",   "ذكر",  "غير ثنائي", "أفضل عدم الإفصاح"];
const RELS_EN      = ["Spouse", "Child", "Parent", "Sibling", "Other"];
const RELS_AR      = ["زوج/زوجة", "ابن/ابنة", "أب/أم", "أخ/أخت", "أخرى"];

// Display labels → DB enums (index-aligned). height/weight have no DB column (not persisted).
const GENDER_ENUM = ["female", "male", "other", "prefer_not_to_say"] as const;
const RELS_ENUM   = ["spouse", "child", "parent", "sibling", "other"] as const;
function genderToEnum(label: string): Database["public"]["Enums"]["gender_type"] {
  const i = GENDERS_EN.indexOf(label); if (i >= 0) return GENDER_ENUM[i]!;
  const j = GENDERS_AR.indexOf(label); if (j >= 0) return GENDER_ENUM[j]!;
  return "prefer_not_to_say";
}
// Reverse of genderToEnum — DB enum → English display label for prefill.
function enumToGenderLabel(value: string | null | undefined): string {
  const i = value ? GENDER_ENUM.indexOf(value as (typeof GENDER_ENUM)[number]) : -1;
  return i >= 0 ? GENDERS_EN[i]! : "";
}
function relToEnum(label: string): Database["public"]["Enums"]["family_relation"] {
  const i = RELS_EN.indexOf(label); if (i >= 0) return RELS_ENUM[i]!;
  const j = RELS_AR.indexOf(label); if (j >= 0) return RELS_ENUM[j]!;
  return "other";
}
const setupBloodToDb = (s: string) => s.replace("−", "-") as Database["public"]["Enums"]["blood_group_type"];
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const STEPS = [
  { en: "Profile",   ar: "الملف الشخصي" },
  { en: "Health",    ar: "الصحة" },
  { en: "Emergency", ar: "الطوارئ" },
  { en: "Family",    ar: "العائلة" },
];

/* ─── Shared field component ──────────────────────────────────────────────
   Defined at MODULE scope (not inside SetupPage) so its component identity is
   stable across renders. Previously it was declared inside SetupPage, so every
   keystroke → setState → re-render created a NEW Field type, which React
   remounted, destroying the <input> and dropping focus after each character.
   It reads the locale via useI18n() so no call site changes. */
function Field({ label, arLabel, value, onChange, type = "text", options, placeholder = "" }: {
  label: string; arLabel: string; value: string;
  onChange: (v: string) => void;
  type?: string; options?: string[]; placeholder?: string;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  return (
    <div className={ar ? "text-right" : ""}>
      <label className="block text-xs font-bold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 uppercase tracking-widest mb-1.5">
        {ar ? arLabel : label}
      </label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2.5 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2.5 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`} />
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function SetupPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  /* Step 1 – personal (hydrated from the authenticated profile below) */
  const [form1, setForm1] = useState({
    firstName: "", lastName: "",
    phone: "", dob: "", gender: "",
  });

  /* Step 2 – health */
  const [form2, setForm2] = useState({
    blood: "", height: "", weight: "",
    allergies: "", conditions: "",
  });

  /* Step 3 – emergency */
  const [form3, setForm3] = useState({
    name: "", phone: "", relation: "Spouse",
  });

  // Prefill from the logged-in user's existing profile — never demo data.
  // height/weight have no DB column, so they always start blank.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [profile, mh] = await Promise.all([
          api.profile.getMyProfile(supabase),
          api.records.getMedicalHistory(supabase).catch(() => null),
        ]);
        if (!active) return;
        const acc = profile.account;
        const pat = profile.patient;
        const full = (acc?.full_name ?? "").trim();
        const [fn, ...rest] = full ? full.split(/\s+/) : [""];
        const ec = (pat?.emergency_contact ?? {}) as { name?: string; phone?: string; relationship?: string };
        setForm1({
          firstName: fn ?? "",
          lastName: rest.join(" "),
          phone: acc?.phone ?? "",
          dob: pat?.date_of_birth ?? "",
          gender: enumToGenderLabel(pat?.gender),
        });
        setForm2((f) => ({
          ...f,
          blood: pat?.blood_group && pat.blood_group !== "unknown" ? pat.blood_group.replace("-", "−") : "",
          allergies: (mh?.allergies ?? []).join(", "),
          conditions: (mh?.conditions ?? []).join(", "),
        }));
        if (ec.name || ec.phone || ec.relationship) {
          setForm3({ name: ec.name ?? "", phone: ec.phone ?? "", relation: ec.relationship || "Spouse" });
        }
      } catch {
        /* new user with no profile yet → keep blank defaults */
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  /* Step 4 – family */
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [draft, setDraft]     = useState<FamilyMember>({ name: "", relation: "Spouse", dob: "", blood: "Unknown" });
  const [addingMember, setAddingMember] = useState(false);

  function addMember() {
    if (!draft.name.trim()) return;
    setMembers(m => [...m, draft]);
    setDraft({ name: "", relation: "Spouse", dob: "", blood: "Unknown" });
    setAddingMember(false);
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const hasEmergency = form3.name || form3.phone || form3.relation;
      await api.profile.updateMyProfile(supabase, {
        full_name: `${form1.firstName} ${form1.lastName}`.trim(),
        phone: form1.phone || undefined,
        date_of_birth: form1.dob || null,
        gender: form1.gender ? genderToEnum(form1.gender) : undefined,
        blood_group: form2.blood && form2.blood !== "Unknown" ? setupBloodToDb(form2.blood) : undefined,
        emergency_contact: hasEmergency
          ? { name: form3.name, phone: form3.phone, relationship: form3.relation }
          : null,
        // height/weight have no DB column and are intentionally not persisted.
      });
      await api.records.upsertMedicalHistory(supabase, {
        allergies: splitList(form2.allergies),
        conditions: splitList(form2.conditions),
      });
      // Persist any family members added during onboarding (blood has no DB column).
      for (const m of members) {
        await api.family.addFamilyMember(supabase, {
          full_name: m.name.trim(),
          relation: relToEnum(m.relation),
          date_of_birth: m.dob || null,
        });
      }
      router.push("/dashboard");
    } catch {
      setError(ar ? "تعذر حفظ بياناتك. حاول مرة أخرى." : "Could not save your details. Please try again.");
      setSaving(false);
    }
  }

  /* ─── Step indicator ── */
  function StepBar() {
    return (
      <div className={`flex items-center gap-0 mb-8 ${ar ? "flex-row-reverse" : ""}`}>
        {STEPS.map((s, i) => {
          const done    = i < step;
          const active  = i === step;
          const isLast  = i === STEPS.length - 1;
          return (
            <div key={i} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
              <div className={`flex flex-col items-center gap-1.5 flex-shrink-0`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  done   ? "bg-emerald-500 text-white"
                  : active ? "bg-[#2E1A47] text-white shadow-lg"
                  : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] font-semibold whitespace-nowrap ${
                  active ? "text-[#2E1A47] dark:text-[#DFC8E7]" : "text-[#2E1A47]/35 dark:text-[#DFC8E7]/35"
                }`}>{ar ? s.ar : s.en}</span>
              </div>
              {!isLast && (
                <div className={`flex-1 h-px mx-2 mb-5 ${i < step ? "bg-emerald-500" : "bg-[#e7dcee] dark:bg-[#3a2560]"}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e]">

      {/* ── Top banner ── */}
      <div className="py-5 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold  tracking-widest mb-1" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "خطوة واحدة قبل البدء" : "One step before you start"}
          </p>
          <h1 className="font-black font-serif text-white text-xl">
            {ar ? "أكمل ملفك الصحي" : "Set up your health profile"}
          </h1>
        </div>
      </div>

      {/* ── Card ── */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6 sm:p-8 shadow-sm">

          <StepBar />

          {/* ══ Step 1: Personal Info ══ */}
          {step === 0 && (
            <div className="space-y-5">
              <div className={ar ? "text-right" : ""}>
                <h2 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
                  {ar ? "معلوماتك الشخصية" : "Your personal info"}
                </h2>
                <p className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
                  {ar ? "هذه المعلومات تساعد الأطباء على تقديم الرعاية المناسبة." : "This helps doctors provide the right care for you."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First Name"    arLabel="الاسم الأول"        value={form1.firstName} onChange={v => setForm1(f => ({...f, firstName: v}))} />
                <Field label="Last Name"     arLabel="اسم العائلة"        value={form1.lastName}  onChange={v => setForm1(f => ({...f, lastName: v}))} />
                <Field label="Phone"         arLabel="رقم الهاتف"         value={form1.phone}     onChange={v => setForm1(f => ({...f, phone: v}))}     placeholder="+968 9xxx xxxx" />
                <Field label="Date of Birth" arLabel="تاريخ الميلاد"      value={form1.dob}       onChange={v => setForm1(f => ({...f, dob: v}))}       type="date" />
                <div className="sm:col-span-2">
                  <Field label="Gender" arLabel="الجنس" value={form1.gender} onChange={v => setForm1(f => ({...f, gender: v}))}
                    options={ar ? GENDERS_AR : GENDERS_EN} />
                </div>
              </div>
            </div>
          )}

          {/* ══ Step 2: Health Info ══ */}
          {step === 1 && (
            <div className="space-y-5">
              <div className={ar ? "text-right" : ""}>
                <h2 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
                  {ar ? "معلوماتك الصحية" : "Health basics"}
                </h2>
                <p className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
                  {ar ? "تُستخدم لتخصيص تجربتك الصحية." : "Used to personalise your health experience."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Blood Group"   arLabel="فصيلة الدم"   value={form2.blood}      onChange={v => setForm2(f => ({...f, blood: v}))}      options={BLOOD_GROUPS} />
                <Field label="Height (cm)"   arLabel="الطول (سم)"   value={form2.height}     onChange={v => setForm2(f => ({...f, height: v}))}     type="number" placeholder="162" />
                <Field label="Weight (kg)"   arLabel="الوزن (كجم)"  value={form2.weight}     onChange={v => setForm2(f => ({...f, weight: v}))}     type="number" placeholder="60" />
              </div>
              <Field label="Known Allergies"     arLabel="الحساسية المعروفة"  value={form2.allergies}  onChange={v => setForm2(f => ({...f, allergies: v}))}  placeholder={ar ? "مثلاً: بنسلين، جلوتين" : "e.g. Penicillin, Gluten"} />
              <Field label="Existing Conditions" arLabel="الأمراض المزمنة"   value={form2.conditions} onChange={v => setForm2(f => ({...f, conditions: v}))} placeholder={ar ? "مثلاً: داء السكري، ارتفاع ضغط الدم" : "e.g. Diabetes, Hypertension"} />
            </div>
          )}

          {/* ══ Step 3: Emergency Contact ══ */}
          {step === 2 && (
            <div className="space-y-5">
              <div className={ar ? "text-right" : ""}>
                <h2 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
                  {ar ? "جهة الاتصال في الطوارئ" : "Emergency contact"}
                </h2>
                <p className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
                  {ar ? "من نتصل به في حالة الطوارئ؟" : "Who should we contact in an emergency?"}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name"    arLabel="الاسم الكامل" value={form3.name}     onChange={v => setForm3(f => ({...f, name: v}))}     placeholder={ar ? "الاسم الكامل" : "Full name"} />
                <Field label="Phone"        arLabel="رقم الهاتف"   value={form3.phone}    onChange={v => setForm3(f => ({...f, phone: v}))}    placeholder="+968 9xxx xxxx" />
                <div className="sm:col-span-2">
                  <Field label="Relationship" arLabel="صلة القرابة" value={form3.relation} onChange={v => setForm3(f => ({...f, relation: v}))}
                    options={ar ? RELS_AR : RELS_EN} />
                </div>
              </div>
            </div>
          )}

          {/* ══ Step 4: Family Members ══ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className={ar ? "text-right" : ""}>
                <h2 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
                  {ar ? "أفراد العائلة" : "Family members"}
                </h2>
                <p className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
                  {ar ? "أضف أفراد عائلتك لإدارة صحتهم معك. (اختياري)" : "Add family members to manage their health alongside yours. (Optional)"}
                </p>
              </div>

              {/* Existing members */}
              {members.length > 0 && (
                <div className="space-y-2">
                  {members.map((m, i) => {
                    const initials = m.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3.5 rounded-xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#0d0820] ${ar ? "flex-row-reverse" : ""}`}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-[#2E1A47] flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                          {initials}
                        </div>
                        <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                          <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{m.name}</p>
                          <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{m.relation}{m.blood !== "Unknown" ? ` · ${m.blood}` : ""}</p>
                        </div>
                        <button onClick={() => setMembers(prev => prev.filter((_, j) => j !== i))}
                          className="text-[#2E1A47]/25 hover:text-rose-500 transition-colors flex-shrink-0 p-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add member form */}
              {addingMember ? (
                <div className="rounded-2xl border border-[#DFC8E7]/60 dark:border-[#3a2560] bg-[#faf5ff] dark:bg-[#1a1030] p-5 space-y-4">
                  <p className={`text-xs font-black  tracking-widest text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 ${ar ? "text-right" : ""}`}>
                    {ar ? "عضو جديد" : "New member"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Full Name"     arLabel="الاسم الكامل"  value={draft.name}     onChange={v => setDraft(d => ({...d, name: v}))}     placeholder={ar ? "الاسم الكامل" : "Full name"} />
                    <Field label="Relationship"  arLabel="صلة القرابة"   value={draft.relation}  onChange={v => setDraft(d => ({...d, relation: v}))}  options={ar ? RELS_AR : RELS_EN} />
                    <Field label="Date of Birth" arLabel="تاريخ الميلاد" value={draft.dob}       onChange={v => setDraft(d => ({...d, dob: v}))}       type="date" />
                    <Field label="Blood Group"   arLabel="فصيلة الدم"    value={draft.blood}     onChange={v => setDraft(d => ({...d, blood: v}))}     options={BLOOD_GROUPS} />
                  </div>
                  <div className={`flex gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                    <button onClick={addMember} disabled={!draft.name.trim()}
                      className="px-5 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                      {ar ? "إضافة" : "Add member"}
                    </button>
                    <button onClick={() => setAddingMember(false)}
                      className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 transition-all">
                      {ar ? "إلغاء" : "Cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingMember(true)}
                  className={`w-full py-3.5 rounded-xl border-2 border-dashed border-[#e7dcee] dark:border-[#3a2560] text-sm font-semibold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:border-[#46255f]/40 hover:text-[#46255f] dark:hover:text-[#DFC8E7] hover:bg-[#faf5ff] dark:hover:bg-[#2E1A47]/10 transition-all flex items-center justify-center gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {ar ? "إضافة فرد عائلة" : "Add a family member"}
                </button>
              )}
            </div>
          )}

          {/* ══ Navigation buttons ══ */}
          <div className={`flex items-center justify-between mt-8 pt-6 border-t border-[#e7dcee] dark:border-[#2a1840] ${ar ? "flex-row-reverse" : ""}`}>
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : router.push("/dashboard")}
              className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-all">
              {step === 0 ? (ar ? "تخطي" : "Skip setup") : (ar ? "السابق" : "Back")}
            </button>

            <div className={`flex items-center gap-3 ${ar ? "flex-row-reverse" : ""}`}>
              {step === 3 && (
                <button onClick={finish}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
                  {ar ? "تخطي" : "Skip"}
                </button>
              )}
              <button onClick={() => step < 3 ? setStep(s => s + 1) : finish()} disabled={saving}
                className="px-6 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : step < 3 ? (ar ? "التالي" : "Continue") : (ar ? "الدخول إلى لوحة التحكم" : "Go to Dashboard")}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-center text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}

        {/* ── Step counter ── */}
        <p className="text-center text-xs text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 mt-4">
          {ar ? `الخطوة ${step + 1} من ${STEPS.length}` : `Step ${step + 1} of ${STEPS.length}`}
        </p>
      </div>
    </div>
  );
}
