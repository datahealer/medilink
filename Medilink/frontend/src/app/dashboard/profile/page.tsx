"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];

export default function ProfilePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [editing, setEditing] = useState(false);
  const [saved, setSaved]     = useState(false);

  const [form, setForm] = useState({
    firstName: "Vartika",
    lastName:  "Pandey",
    email:     "vartika.pandey@inzint.com",
    phone:     "+968 9123 4567",
    dob:       "1995-08-14",
    gender:    "Female",
    blood:     "O+",
    height:    "162",
    weight:    "58",
    allergies: "Penicillin",
    conditions:"None",
    emergency_name:  "Rahul Pandey",
    emergency_phone: "+968 9876 5432",
    emergency_rel:   "Brother",
  });

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function save() { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 3000); }

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

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-center gap-5 ${ar ? "flex-row-reverse" : ""}`}>
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black text-[#2E1A47] flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              VP
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
                  <button onClick={save}
                    className="px-5 py-2 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85"
                    style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                    {ar ? "حفظ" : "Save"}
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

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Personal Info */}
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
        <Section en="Emergency Contact" ar="جهة الاتصال في حالات الطوارئ">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Full Name"     arLabel="الاسم الكامل" value={form.emergency_name}  fieldKey="emergency_name" />
            <Field label="Phone"         arLabel="رقم الهاتف"  value={form.emergency_phone} fieldKey="emergency_phone" />
            <Field label="Relationship"  arLabel="صلة القرابة" value={form.emergency_rel}   fieldKey="emergency_rel"
              options={["Brother", "Sister", "Mother", "Father", "Spouse", "Friend", "Other"]} />
          </div>
        </Section>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { n: "12", en: "Visits",       ar: "زيارة" },
            { n: "5",  en: "Lab Tests",    ar: "تحليل" },
            { n: "3",  en: "Prescriptions",ar: "وصفة" },
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
