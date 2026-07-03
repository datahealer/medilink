"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "@medilink/shared";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];
// Family-member selects allow "Unknown"; kept separate from BLOOD_GROUPS so the
// main profile blood-group field never sends a non-enum value to the backend.
const FAMILY_BLOOD_GROUPS = [...BLOOD_GROUPS, "Unknown"];

// Family Members — wired to `api.family` (family_members table, RLS-scoped).
// NOTE: the backend table has no blood-group column, so `blood` is a UI-only field
// (defaults to "Unknown" on load and is not persisted). name/relation/dob persist.
type FamilyMember = { id?: string; name: string; relation: string; dob: string; blood: string };

const RELS_EN = ["Spouse", "Child", "Parent", "Sibling", "Other"];
const RELS_AR = ["زوج/زوجة", "ابن/ابنة", "أب/أم", "أخ/أخت", "أخرى"];
// Display labels ↔ DB `family_relation` enum (index-aligned with RELS_EN/RELS_AR).
const RELS_ENUM = ["spouse", "child", "parent", "sibling", "other"] as const;
type FamilyRelation = Database["public"]["Enums"]["family_relation"];
function relToEnum(label: string): FamilyRelation {
  const i = RELS_EN.indexOf(label);
  if (i >= 0) return RELS_ENUM[i]!;
  const j = RELS_AR.indexOf(label);
  if (j >= 0) return RELS_ENUM[j]!;
  return "other";
}
function relToLabel(value: string, isAr: boolean): string {
  const i = RELS_ENUM.indexOf(value as FamilyRelation);
  if (i < 0) return isAr ? "أخرى" : "Other";
  return (isAr ? RELS_AR[i] : RELS_EN[i])!;
}

const MEMBER_GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]",
  "from-[#d5e8f5] to-[#ede0f8]",
  "from-[#d1fae5] to-[#d5e8f5]",
  "from-[#fde68a] to-[#e8d5f0]",
];

type Gender = Database["public"]["Enums"]["gender_type"];
type BloodGroup = Database["public"]["Enums"]["blood_group_type"];

// Form uses display labels; DB uses enums. Blood-group display uses a MINUS SIGN (−),
// the DB uses an ASCII hyphen (-) — normalize both directions.
const GENDER_TO_ENUM: Record<string, Gender> = {
  Female: "female", Male: "male", "Prefer not to say": "prefer_not_to_say",
};
const GENDER_TO_LABEL: Record<string, string> = {
  female: "Female", male: "Male", other: "Prefer not to say", prefer_not_to_say: "Prefer not to say",
};
const bloodToDb = (s: string) => s.replace("−", "-") as BloodGroup;
const bloodToLabel = (s: string) => s.replace("-", "−");
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const EMPTY_FORM = {
  firstName: "", lastName: "", email: "", phone: "", dob: "", gender: "", blood: "",
  height: "", weight: "", allergies: "", conditions: "",
  emergency_name: "", emergency_phone: "", emergency_rel: "",
};

export default function ProfilePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [editing, setEditing] = useState(false);
  const [saved, setSaved]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [stats, setStats]     = useState({ visits: 0, labs: 0, rx: 0 });

  /* Family members — wired to api.family (RLS-scoped family_members table) */
  const [members, setMembers]             = useState<FamilyMember[]>([]);
  const [addingMember, setAddingMember]   = useState(false);
  const [editingMember, setEditingMember] = useState<number | null>(null);
  const [memberBusy, setMemberBusy]       = useState(false);
  const [draft, setDraft]                 = useState<FamilyMember>({ name: "", relation: "Spouse", dob: "", blood: "Unknown" });

  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [profile, mh, past, labResults, prescriptions, family] = await Promise.all([
          api.profile.getMyProfile(supabase),
          api.records.getMedicalHistory(supabase).catch(() => null),
          api.appointments.listMyAppointments(supabase, "past").catch(() => []),
          api.labs.listLabResults(supabase).catch(() => []),
          api.prescriptions.listPrescriptions(supabase).catch(() => []),
          api.family.listFamily(supabase).catch(() => []),
        ]);
        if (!active) return;
        setMembers(family.map((m) => ({
          id: m.id,
          name: m.full_name,
          relation: relToLabel(m.relation, ar),
          dob: m.date_of_birth ?? "",
          blood: "Unknown", // no blood column on family_members — UI-only field
        })));
        const acc = profile.account;
        const pat = profile.patient;
        const full = (acc?.full_name ?? "").trim();
        const [fn, ...rest] = full ? full.split(/\s+/) : [""];
        const ec = (pat?.emergency_contact ?? {}) as { name?: string; phone?: string; relationship?: string };
        setForm({
          firstName: fn ?? "",
          lastName: rest.join(" "),
          email: acc?.email ?? "",
          phone: acc?.phone ?? "",
          dob: pat?.date_of_birth ?? "",
          gender: pat?.gender ? (GENDER_TO_LABEL[pat.gender] ?? "") : "",
          blood: pat?.blood_group && pat.blood_group !== "unknown" ? bloodToLabel(pat.blood_group) : "",
          height: "", // no backend column — kept for UI parity, not persisted
          weight: "", // no backend column — kept for UI parity, not persisted
          allergies: (mh?.allergies ?? []).join(", "),
          conditions: (mh?.conditions ?? []).join(", "),
          emergency_name: ec.name ?? "",
          emergency_phone: ec.phone ?? "",
          emergency_rel: ec.relationship ?? "",
        });
        setStats({ visits: past.length, labs: labResults.length, rx: prescriptions.length });
      } catch {
        if (active) setError(ar ? "تعذر تحميل الملف الشخصي." : "Could not load your profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase, ar]);

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const hasEmergency = form.emergency_name || form.emergency_phone || form.emergency_rel;
      await api.profile.updateMyProfile(supabase, {
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        phone: form.phone || undefined,
        date_of_birth: form.dob || null,
        gender: form.gender ? GENDER_TO_ENUM[form.gender] : undefined,
        blood_group: form.blood ? bloodToDb(form.blood) : undefined,
        emergency_contact: hasEmergency
          ? { name: form.emergency_name, phone: form.emergency_phone, relationship: form.emergency_rel }
          : null,
        // NOTE: email (auth-managed) and height/weight (no column) are intentionally not persisted.
      });
      await api.records.upsertMedicalHistory(supabase, {
        allergies: splitList(form.allergies),
        conditions: splitList(form.conditions),
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(ar ? "تعذر حفظ التغييرات." : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Family member CRUD (api.family) — blood is UI-only (no DB column) ── */
  async function addMember() {
    if (!draft.name.trim() || memberBusy) return;
    setMemberBusy(true);
    setError("");
    try {
      const row = await api.family.addFamilyMember(supabase, {
        full_name: draft.name.trim(),
        relation: relToEnum(draft.relation),
        date_of_birth: draft.dob || null,
      });
      setMembers((m) => [...m, { id: row.id, name: row.full_name, relation: relToLabel(row.relation, ar), dob: row.date_of_birth ?? "", blood: draft.blood }]);
      setDraft({ name: "", relation: "Spouse", dob: "", blood: "Unknown" });
      setAddingMember(false);
    } catch {
      setError(ar ? "تعذر إضافة فرد العائلة." : "Could not add family member.");
    } finally {
      setMemberBusy(false);
    }
  }

  async function saveMemberEdit(i: number) {
    const target = members[i];
    if (!target?.id || memberBusy) return;
    setMemberBusy(true);
    setError("");
    try {
      const row = await api.family.updateFamilyMember(supabase, target.id, {
        full_name: draft.name.trim(),
        relation: relToEnum(draft.relation),
        date_of_birth: draft.dob || null,
      });
      setMembers((prev) => prev.map((x, j) => j === i ? { ...x, name: row.full_name, relation: relToLabel(row.relation, ar), dob: row.date_of_birth ?? "", blood: draft.blood } : x));
      setEditingMember(null);
    } catch {
      setError(ar ? "تعذر تحديث فرد العائلة." : "Could not update family member.");
    } finally {
      setMemberBusy(false);
    }
  }

  async function deleteMember(i: number) {
    const target = members[i];
    if (!target?.id || memberBusy) return;
    setMemberBusy(true);
    setError("");
    // optimistic removal, restore on failure
    const snapshot = members;
    setMembers((prev) => prev.filter((_, j) => j !== i));
    try {
      await api.family.deleteFamilyMember(supabase, target.id);
    } catch {
      setMembers(snapshot);
      setError(ar ? "تعذر حذف فرد العائلة." : "Could not remove family member.");
    } finally {
      setMemberBusy(false);
    }
  }

  const initials =
    ((form.firstName[0] ?? "") + (form.lastName[0] ?? "")).toUpperCase() ||
    (form.email[0] ?? "").toUpperCase() ||
    "…";

  const Field = ({ label, arLabel, value, fieldKey, type = "text", options }: {
    label: string; arLabel: string; value: string; fieldKey: keyof typeof form;
    type?: string; options?: string[];
  }) => (
    <div className={ar ? "text-right" : ""}>
      <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-1.5">
        {ar ? arLabel : label}
      </p>
      {editing ? (
        options ? (
          <select value={value} onChange={e => set(fieldKey, e.target.value)}
            className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all ${ar ? "text-right" : ""}`}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={type} value={value} onChange={e => set(fieldKey, e.target.value)}
            className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all ${ar ? "text-right" : ""}`} />
        )
      ) : (
        <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{value || "—"}</p>
      )}
    </div>
  );

  const Section = ({ en, ar: arT, children }: { en: string; ar: string; children: React.ReactNode }) => (
    <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden">
      <div className={`px-6 py-4 border-b border-[#e7dcee] dark:border-[#2a1840] ${ar ? "text-right" : ""}`}>
        <h2 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? arT : en}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <div dir={ar ? "rtl" : "ltr"} className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
        <p className="text-sm font-semibold animate-pulse">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-center gap-5 ${ar ? "flex-row-reverse" : ""}`}>
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black text-[#2E1A47] flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {initials}
            </div>
            <div className={ar ? "text-right" : ""}>
              <h1 className="font-black font-serif text-white text-2xl leading-tight">{form.firstName} {form.lastName}</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(223,200,231,0.55)" }}>{form.email}</p>
              <p className="text-xs mt-1 font-semibold px-2.5 py-0.5 rounded-full inline-block"
                style={{ background: "rgba(223,200,231,0.12)", color: "rgba(223,200,231,0.7)", border: "1px solid rgba(223,200,231,0.2)" }}>
                {ar ? "مريض" : "Patient"}
              </p>
            </div>
            <div className="ml-auto">
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="px-5 py-2 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85"
                  style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                  {ar ? "تعديل" : "Edit Profile"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-xl font-bold text-sm border border-white/20 text-white/60 hover:text-white transition-colors">
                    {ar ? "إلغاء" : "Cancel"}
                  </button>
                  <button onClick={save} disabled={saving}
                    className="px-5 py-2 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                    {saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {saved && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800/40 px-6 py-3 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {ar ? "✅ تم حفظ التغييرات بنجاح" : "✅ Profile saved successfully"}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/40 px-6 py-3 text-center text-sm font-semibold text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Section shortcuts */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840]">
        <div className={`max-w-3xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto ${ar ? "flex-row-reverse" : ""}`}
          style={{ scrollbarWidth: "none" }}>
          {[
            { label: ar ? "المعلومات الشخصية" : "Personal Info",   id: "personal" },
            { label: ar ? "الصحة" : "Health",                      id: "health" },
            { label: ar ? "الطوارئ" : "Emergency",                  id: "emergency" },
            { label: ar ? "👨‍👩‍👧 أفراد العائلة" : "👨‍👩‍👧 Family Members", id: "family" },
          ].map(s => (
            <a key={s.id} href={`#${s.id}`}
              className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold no-underline transition-colors ${
                s.id === "family"
                  ? "text-[#2E1A47] dark:text-[#1a1030]"
                  : "text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"
              }`}
              style={s.id === "family" ? { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" } : {}}>
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Personal Info */}
        <div id="personal" />
        <Section en="Personal Information" ar="المعلومات الشخصية">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="First Name"   arLabel="الاسم الأول"  value={form.firstName} fieldKey="firstName" />
            <Field label="Last Name"    arLabel="اسم العائلة" value={form.lastName}  fieldKey="lastName" />
            <Field label="Email"        arLabel="البريد الإلكتروني" value={form.email} fieldKey="email" type="email" />
            <Field label="Phone"        arLabel="رقم الهاتف"  value={form.phone}  fieldKey="phone" />
            <Field label="Date of Birth" arLabel="تاريخ الميلاد" value={form.dob}  fieldKey="dob" type="date" />
            <Field label="Gender" arLabel="الجنس" value={form.gender} fieldKey="gender"
              options={["Female", "Male", "Prefer not to say"]} />
          </div>
        </Section>

        {/* Health Info */}
        <div id="health" />
        <Section en="Health Information" ar="المعلومات الصحية">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Blood Group" arLabel="فصيلة الدم" value={form.blood}  fieldKey="blood" options={BLOOD_GROUPS} />
            <Field label="Height (cm)" arLabel="الطول (سم)" value={form.height} fieldKey="height" type="number" />
            <Field label="Weight (kg)" arLabel="الوزن (كجم)" value={form.weight} fieldKey="weight" type="number" />
            <div />
            <div className="sm:col-span-2">
              <Field label="Known Allergies" arLabel="الحساسية المعروفة" value={form.allergies} fieldKey="allergies" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Existing Conditions" arLabel="الأمراض المزمنة" value={form.conditions} fieldKey="conditions" />
            </div>
          </div>
        </Section>

        {/* Emergency Contact */}
        <div id="emergency" />
        <Section en="Emergency Contact" ar="جهة الاتصال في حالات الطوارئ">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Full Name"     arLabel="الاسم الكامل" value={form.emergency_name}  fieldKey="emergency_name" />
            <Field label="Phone"         arLabel="رقم الهاتف"  value={form.emergency_phone} fieldKey="emergency_phone" />
            <Field label="Relationship"  arLabel="صلة القرابة" value={form.emergency_rel}   fieldKey="emergency_rel"
              options={["Brother", "Sister", "Mother", "Father", "Spouse", "Friend", "Other"]} />
          </div>
        </Section>

        {/* Family Members — UI-only (local state). PENDING: wire to api.family. */}
        <div id="family" />
        <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden">
          <div className={`px-6 py-4 border-b border-[#e7dcee] dark:border-[#2a1840] flex items-center justify-between ${ar ? "flex-row-reverse" : ""}`}>
            <h2 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7]">
              {ar ? "أفراد العائلة" : "Family Members"}
            </h2>
            {members.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f0e8f8] dark:bg-[#2E1A47]/40 text-[#46255f] dark:text-[#DFC8E7]/70">
                {members.length} {ar ? "فرد" : members.length === 1 ? "member" : "members"}
              </span>
            )}
          </div>
          <div className="p-6 space-y-3">

            {/* Member cards */}
            {members.length === 0 && !addingMember && (
              <p className={`text-sm text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 ${ar ? "text-right" : ""}`}>
                {ar ? "لم تُضف أفراداً بعد." : "No family members added yet."}
              </p>
            )}

            {members.map((m, i) => {
              const initials = m.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "FM";
              const isEditing = editingMember === i;
              return (
                <div key={i} className="rounded-xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden">
                  {isEditing ? (
                    <div className="p-4 space-y-3 bg-[#faf5ff] dark:bg-[#1a1030]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { l: "Full Name",     al: "الاسم الكامل",  k: "name" as const,     type: "text",   opts: undefined },
                          { l: "Relationship",  al: "صلة القرابة",   k: "relation" as const,  type: "text",   opts: ar ? RELS_AR : RELS_EN },
                          { l: "Date of Birth", al: "تاريخ الميلاد", k: "dob" as const,       type: "date",   opts: undefined },
                          { l: "Blood Group",   al: "فصيلة الدم",    k: "blood" as const,     type: "text",   opts: FAMILY_BLOOD_GROUPS },
                        ].map(f => (
                          <div key={f.k} className={ar ? "text-right" : ""}>
                            <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-1">{ar ? f.al : f.l}</p>
                            {f.opts ? (
                              <select value={draft[f.k] || m[f.k]} onChange={e => setDraft(d => ({...d, [f.k]: e.target.value}))}
                                className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-white dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`}>
                                {f.opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input type={f.type} value={draft[f.k]} onChange={e => setDraft(d => ({...d, [f.k]: e.target.value}))}
                                className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-white dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className={`flex gap-2 pt-1 ${ar ? "flex-row-reverse" : ""}`}>
                        <button onClick={() => saveMemberEdit(i)} disabled={memberBusy}
                          className="px-4 py-2 rounded-xl font-bold text-xs text-[#2E1A47] disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                          {memberBusy ? (ar ? "…" : "…") : (ar ? "حفظ" : "Save")}
                        </button>
                        <button onClick={() => setEditingMember(null)}
                          className="px-4 py-2 rounded-xl font-bold text-xs border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60">
                          {ar ? "إلغاء" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-3 p-4 bg-[#faf8fc] dark:bg-[#0d0820] ${ar ? "flex-row-reverse" : ""}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-[#2E1A47] flex-shrink-0 bg-gradient-to-br ${MEMBER_GRADS[i % MEMBER_GRADS.length]}`}>
                        {initials}
                      </div>
                      <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                        <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{m.name}</p>
                        <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">
                          {m.relation}{m.dob ? ` · ${m.dob}` : ""}{m.blood !== "Unknown" ? ` · ${m.blood}` : ""}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
                        <button onClick={() => { setDraft({...m}); setEditingMember(i); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 hover:text-[#46255f] hover:bg-[#f0e8f8] dark:hover:text-[#DFC8E7] dark:hover:bg-[#2E1A47]/30 transition-colors">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => deleteMember(i)} disabled={memberBusy}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add member form */}
            {addingMember && (
              <div className="rounded-xl border border-[#DFC8E7]/60 dark:border-[#3a2560] bg-[#faf5ff] dark:bg-[#1a1030] p-4 space-y-3">
                <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 ${ar ? "text-right" : ""}`}>
                  {ar ? "فرد جديد" : "New member"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { l: "Full Name",     al: "الاسم الكامل",  k: "name" as const,    type: "text", opts: undefined },
                    { l: "Relationship",  al: "صلة القرابة",   k: "relation" as const, type: "text", opts: ar ? RELS_AR : RELS_EN },
                    { l: "Date of Birth", al: "تاريخ الميلاد", k: "dob" as const,      type: "date", opts: undefined },
                    { l: "Blood Group",   al: "فصيلة الدم",    k: "blood" as const,    type: "text", opts: FAMILY_BLOOD_GROUPS },
                  ].map(f => (
                    <div key={f.k} className={ar ? "text-right" : ""}>
                      <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 uppercase tracking-widest mb-1">{ar ? f.al : f.l}</p>
                      {f.opts ? (
                        <select value={draft[f.k]} onChange={e => setDraft(d => ({...d, [f.k]: e.target.value}))}
                          className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-white dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`}>
                          {f.opts.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} value={draft[f.k]} onChange={e => setDraft(d => ({...d, [f.k]: e.target.value}))}
                          className={`w-full text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] bg-white dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-3 py-2 outline-none focus:border-[#46255f]/60 transition-all ${ar ? "text-right" : ""}`} />
                      )}
                    </div>
                  ))}
                </div>
                <div className={`flex gap-2 pt-1 ${ar ? "flex-row-reverse" : ""}`}>
                  <button onClick={addMember} disabled={!draft.name.trim() || memberBusy}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                    {memberBusy ? (ar ? "جارٍ الإضافة…" : "Adding…") : (ar ? "إضافة" : "Add member")}
                  </button>
                  <button onClick={() => { setAddingMember(false); setDraft({ name: "", relation: "Spouse", dob: "", blood: "Unknown" }); }}
                    className="px-4 py-2 rounded-xl font-bold text-xs border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60">
                    {ar ? "إلغاء" : "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {/* Add button */}
            {!addingMember && editingMember === null && (
              <button onClick={() => { setDraft({ name: "", relation: "Spouse", dob: "", blood: "Unknown" }); setAddingMember(true); }}
                className={`w-full py-3 rounded-xl border-2 border-dashed border-[#e7dcee] dark:border-[#3a2560] text-sm font-semibold text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 hover:border-[#46255f]/40 hover:text-[#46255f] dark:hover:text-[#DFC8E7] hover:bg-[#faf5ff] dark:hover:bg-[#2E1A47]/10 transition-all flex items-center justify-center gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {ar ? "إضافة فرد عائلة" : "Add a family member"}
              </button>
            )}
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { n: String(stats.visits), en: "Visits",       ar: "زيارة" },
            { n: String(stats.labs),   en: "Lab Tests",    ar: "تحليل" },
            { n: String(stats.rx),     en: "Prescriptions",ar: "وصفة" },
          ].map(s => (
            <div key={s.en} className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5 text-center">
              <p className="font-black font-serif text-3xl text-[#2E1A47] dark:text-[#DFC8E7]">{s.n}</p>
              <p className="text-xs font-medium text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mt-1">{ar ? s.ar : s.en}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
