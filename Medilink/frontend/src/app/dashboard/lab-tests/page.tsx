"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Slot = { t: string; taken: boolean };

/* ─── Data ──────────────────────────────────────────────────────────────
 * BACKEND GAP (documented, not mocked-over): there is no lab-test *catalog* or
 * *ordering* backend. `@medilink/shared` `api.labs` only reads a patient's lab
 * RESULTS (listLabResults / getLabResultSignedUrl) — it cannot list bookable
 * tests or place an order. Until a catalog/order endpoint exists, this screen's
 * catalog + booking data stays static. See docs/WEB_DYNAMIC_INTEGRATION_AUDIT.md §3.
 * ──────────────────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { en: "All",              ar: "الكل" },
  { en: "Blood Tests",      ar: "تحاليل الدم" },
  { en: "Urine Tests",      ar: "تحاليل البول" },
  { en: "Imaging",          ar: "التصوير الطبي" },
  { en: "Heart",            ar: "القلب" },
  { en: "Hormones",         ar: "الهرمونات" },
  { en: "Diabetes",         ar: "السكري" },
  { en: "Liver & Kidney",   ar: "الكبد والكلى" },
];

const LABS = [
  {
    id: "AL",
    grad: "from-[#e8d5f0] to-[#d5e8f5]",
    category: "Blood Tests",
    price: 25,
    duration: "4–6 hrs",
    rating: 4.9,
    reviews: 520,
    homeCollection: true,
    en: { name: "Complete Blood Count (CBC)",     lab: "Al Shifa Diagnostics",   desc: "Full blood panel including RBC, WBC, platelets and haemoglobin." },
    ar: { name: "صورة الدم الكاملة (CBC)",         lab: "مختبرات الشفاء",         desc: "فحص شامل للدم يشمل كريات الدم الحمراء والبيضاء والصفائح والهيموغلوبين." },
    slots: buildSlots([0, 2, 5, 8]),
  },
  {
    id: "LF",
    grad: "from-[#d5e8f5] to-[#ede0f8]",
    category: "Liver & Kidney",
    price: 40,
    duration: "6–8 hrs",
    rating: 4.8,
    reviews: 310,
    homeCollection: true,
    en: { name: "Liver Function Test (LFT)",      lab: "MedLab Centre",          desc: "Measures enzymes and proteins to assess liver health and function." },
    ar: { name: "وظائف الكبد",                    lab: "مركز ميدلاب",            desc: "يقيس الإنزيمات والبروتينات لتقييم صحة الكبد ووظيفته." },
    slots: buildSlots([1, 3, 6]),
  },
  {
    id: "HB",
    grad: "from-[#ede0f8] to-[#d1fae5]",
    category: "Diabetes",
    price: 18,
    duration: "2–4 hrs",
    rating: 4.7,
    reviews: 615,
    homeCollection: true,
    en: { name: "HbA1c (Glycated Haemoglobin)",   lab: "Sunrise Diagnostics",    desc: "3-month average blood sugar indicator for diabetes management." },
    ar: { name: "الهيموغلوبين الغليكوزيلاتي HbA1c", lab: "مختبرات الشروق",        desc: "مؤشر متوسط السكر لمدة ٣ أشهر لإدارة مرض السكري." },
    slots: buildSlots([0, 4, 7]),
  },
  {
    id: "TH",
    grad: "from-[#d1fae5] to-[#e8d5f0]",
    category: "Hormones",
    price: 55,
    duration: "8–12 hrs",
    rating: 4.9,
    reviews: 287,
    homeCollection: false,
    en: { name: "Thyroid Panel (T3, T4, TSH)",    lab: "Royal Diagnostics",      desc: "Comprehensive thyroid hormone profile for metabolic assessment." },
    ar: { name: "هرمونات الغدة الدرقية",           lab: "رويال دياجنوستيكس",      desc: "ملف شامل لهرمونات الغدة الدرقية لتقييم الأيض." },
    slots: buildSlots([2, 5]),
  },
  {
    id: "UA",
    grad: "from-[#fde68a] to-[#d5e8f5]",
    category: "Urine Tests",
    price: 15,
    duration: "1–2 hrs",
    rating: 4.6,
    reviews: 430,
    homeCollection: true,
    en: { name: "Urine Analysis (Routine)",       lab: "Al Shifa Diagnostics",   desc: "Screens for infections, kidney problems, and metabolic conditions." },
    ar: { name: "تحليل البول الروتيني",            lab: "مختبرات الشفاء",         desc: "يكشف عن الالتهابات ومشاكل الكلى والحالات الأيضية." },
    slots: buildSlots([0, 3, 6, 9]),
  },
  {
    id: "EC",
    grad: "from-[#e8d5f0] to-[#fde68a]",
    category: "Heart",
    price: 80,
    duration: "Same day",
    rating: 4.9,
    reviews: 198,
    homeCollection: false,
    en: { name: "ECG + Echocardiogram",           lab: "Heart & Vascular Centre", desc: "Combined cardiac electrical and ultrasound evaluation." },
    ar: { name: "تخطيط القلب والصدى",             lab: "مركز القلب والأوعية",    desc: "تقييم مزدوج للقلب باستخدام الكهرباء والموجات فوق الصوتية." },
    slots: buildSlots([1, 4]),
  },
  {
    id: "XR",
    grad: "from-[#d5e8f5] to-[#d1fae5]",
    category: "Imaging",
    price: 60,
    duration: "Same day",
    rating: 4.8,
    reviews: 342,
    homeCollection: false,
    en: { name: "Chest X-Ray",                    lab: "Sunrise Diagnostics",    desc: "Digital chest radiograph for lung and cardiac silhouette assessment." },
    ar: { name: "أشعة الصدر",                     lab: "مختبرات الشروق",         desc: "أشعة سينية رقمية للصدر لتقييم الرئتين والقلب." },
    slots: buildSlots([2, 5, 8]),
  },
  {
    id: "LI",
    grad: "from-[#d1fae5] to-[#ede0f8]",
    category: "Liver & Kidney",
    price: 35,
    duration: "6–8 hrs",
    rating: 4.7,
    reviews: 263,
    homeCollection: true,
    en: { name: "Kidney Function Test (KFT)",     lab: "MedLab Centre",          desc: "Creatinine, urea and eGFR measurement for renal health screening." },
    ar: { name: "وظائف الكلى",                    lab: "مركز ميدلاب",            desc: "قياس الكرياتينين واليوريا و eGFR لفحص صحة الكلى." },
    slots: buildSlots([0, 3, 7]),
  },
];

function buildSlots(takenIdx: number[]): Slot[] {
  const times = [
    "7:00 AM","7:30 AM","8:00 AM","8:30 AM","9:00 AM","9:30 AM",
    "10:00 AM","10:30 AM","11:00 AM","11:30 AM",
    "12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM",
  ];
  return times.map((t, i) => ({ t, taken: takenIdx.includes(i) }));
}

/* ─── helpers ───────────────────────────────────────────────────────── */
const MONTH_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAY_EN   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const DAY_AR   = ["أح","اث","ثل","أر","خم","جم","سب"];
const MONTH_LONG_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_LONG_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const TODAY = new Date(2026, 5, 29);

function buildCalendar(y: number, m: number) {
  const first = new Date(y, m, 1).getDay();
  const days  = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDate(d: Date, ar: boolean) {
  return ar ? `${d.getDate()} ${MONTH_AR[d.getMonth()]}` : `${MONTH_EN[d.getMonth()]} ${d.getDate()}`;
}

/* ─── MiniCalendar ───────────────────────────────────────────────────── */
function MiniCalendar({ isAr, selected, onSelect }: { isAr: boolean; selected: Date | null; onSelect: (d: Date) => void }) {
  const [vy, setVy] = useState(TODAY.getFullYear());
  const [vm, setVm] = useState(TODAY.getMonth());
  const cells = buildCalendar(vy, vm);
  const atMin = vy === TODAY.getFullYear() && vm === TODAY.getMonth();

  function prev() { if (vm === 0) { setVm(11); setVy(y => y - 1); } else setVm(m => m - 1); }
  function next() { if (vm === 11) { setVm(0);  setVy(y => y + 1); } else setVm(m => m + 1); }

  return (
    <div>
      <div className={`flex items-center justify-between mb-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <button onClick={prev} disabled={atMin}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">
          {isAr ? MONTH_LONG_AR[vm] : MONTH_LONG_EN[vm]} {vy}
        </span>
        <button onClick={next}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {(isAr ? DAY_AR : DAY_EN).map(l => (
          <div key={l} className="text-center text-[10px] font-bold uppercase tracking-wide text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const date   = new Date(vy, vm, day);
          const isToday = sameDay(date, TODAY);
          const isPast  = date < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
          const isSel   = selected ? sameDay(date, selected) : false;
          return (
            <button key={`d-${day}`} disabled={isPast} onClick={() => onSelect(date)}
              className={`mx-auto w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-all
                ${isSel ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] shadow-md"
                  : isToday ? "border-2 border-[#46255f] dark:border-[#DFC8E7] text-[#46255f] dark:text-[#DFC8E7] font-bold"
                  : isPast  ? "text-[#2E1A47]/18 dark:text-[#DFC8E7]/18 cursor-not-allowed"
                  : "text-[#2E1A47] dark:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30"}`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── BookModal ─────────────────────────────────────────────────────── */
function BookModal({ test, isAr, onClose }: { test: typeof LABS[0]; isAr: boolean; onClose: () => void }) {
  const [step, setStep]   = useState<"date" | "time">("date");
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [booked, setBooked]   = useState(false);
  const info = isAr ? test.ar : test.en;

  const SLOT_GROUPS = [
    { key: "morning",   en: "Morning 🌅",   ar: "الصباح 🌅",   slots: test.slots.filter(s => s.t.includes("AM")) },
    { key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️", slots: test.slots.filter(s => { const h = parseInt(s.t); return s.t.includes("PM") && (h === 12 || h <= 4); }) },
  ].filter(g => g.slots.length > 0);

  const Header = () => (
    <div className="px-6 pt-6 pb-4 border-b border-[#e7dcee] dark:border-[#2a1840]">
      <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-gradient-to-br ${test.grad}`}>🧪</div>
        <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] text-sm leading-snug">{info.name}</p>
          <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">{info.lab}</p>
        </div>
        <button onClick={onClose} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Steps */}
      <div className={`flex items-center gap-2 mt-4 ${isAr ? "flex-row-reverse" : ""}`}>
        {[{ k: "date", en: "Date", ar: "التاريخ" }, { k: "time", en: "Time", ar: "الوقت" }].map((s, i) => (
          <div key={s.k} className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
            {i > 0 && <div className="w-6 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />}
            <div className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${step === s.k ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]" : step === "time" && s.k === "date" ? "bg-emerald-500 text-white" : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"}`}>
                {step === "time" && s.k === "date" ? "✓" : i + 1}
              </div>
              <span className={`text-xs font-semibold ${step === s.k ? "text-[#2E1A47] dark:text-[#DFC8E7]" : "text-[#2E1A47]/35 dark:text-[#DFC8E7]/35"}`}>{isAr ? s.ar : s.en}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (booked) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a1030] rounded-2xl p-8 max-w-sm w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
        <h3 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{isAr ? "تم الحجز!" : "Test Booked!"}</h3>
        <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 mb-1">{info.name}</p>
        <p className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7]">{selDate ? fmtDate(selDate, isAr) : ""} · {selTime}</p>
        <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-1 mb-6">{info.lab}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47]"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
          {isAr ? "إغلاق" : "Done"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-[#1a1030] rounded-2xl max-w-md w-full border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <Header />
        {step === "date" && (
          <div className="px-6 py-5">
            <MiniCalendar isAr={isAr} selected={selDate} onSelect={setSelDate} />
            <button disabled={!selDate} onClick={() => setStep("time")}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selDate ? (isAr ? `التالي — ${fmtDate(selDate, isAr)}` : `Next — ${fmtDate(selDate, isAr)}`) : (isAr ? "اختر تاريخاً" : "Select a date")}
            </button>
          </div>
        )}
        {step === "time" && (
          <div className="px-6 py-5">
            <div className={`flex items-center justify-between mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">{isAr ? "اختر وقتاً" : "Choose a time"}</p>
              <button onClick={() => { setStep("date"); setSelTime(null); }} className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                ← {selDate ? fmtDate(selDate, isAr) : ""}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto pr-1 space-y-4 mb-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
              {SLOT_GROUPS.map(g => (
                <div key={g.key}>
                  <p className="text-[11px] font-bold text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">{isAr ? g.ar : g.en}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {g.slots.map(slot => (
                      <button key={slot.t} disabled={slot.taken} onClick={() => setSelTime(slot.t)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all relative ${slot.taken ? "border-[#e7dcee] dark:border-[#2a1840] text-[#2E1A47]/20 dark:text-[#DFC8E7]/20 cursor-not-allowed bg-[#faf8fc] dark:bg-[#0d0820]" : selTime === slot.t ? "border-[#46255f] bg-[#46255f] text-white dark:border-[#DFC8E7] dark:bg-[#DFC8E7] dark:text-[#1a1030] shadow-sm" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#46255f]/50 dark:hover:border-[#DFC8E7]/50 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"}`}>
                        {slot.t}
                        {slot.taken && <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-full h-px bg-[#2E1A47]/15 dark:bg-[#DFC8E7]/15 rotate-[-8deg] block" /></span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button disabled={!selTime} onClick={() => setBooked(true)}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selTime ? (isAr ? `تأكيد — ${selTime}` : `Confirm — ${selTime}`) : (isAr ? "اختر وقتاً" : "Select a time")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── TestCard ───────────────────────────────────────────────────────── */
function TestCard({ test, isAr, onBook }: { test: typeof LABS[0]; isAr: boolean; onBook: () => void }) {
  const info = isAr ? test.ar : test.en;
  return (
    <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className={`flex items-start gap-4 ${isAr ? "flex-row-reverse" : ""}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-gradient-to-br ${test.grad}`}>🧪</div>
        <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
          <p className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] leading-snug mb-1">{info.name}</p>
          <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold mb-1">{info.lab}</p>
          <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 leading-relaxed mb-3">{info.desc}</p>
          <div className={`flex flex-wrap items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
            <span className="flex items-center gap-1 text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
              <span className="text-amber-400">★</span> {test.rating} <span className="text-[#2E1A47]/30 dark:text-[#DFC8E7]/30">({test.reviews})</span>
            </span>
            <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
            <span className="text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">⏱ {test.duration}</span>
            {test.homeCollection && (
              <>
                <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">🏠 {isAr ? "تجميع منزلي" : "Home collection"}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className={`flex items-center justify-between mt-4 pt-4 border-t border-[#f0e8f8] dark:border-[#2a1840] ${isAr ? "flex-row-reverse" : ""}`}>
        <span className="font-black text-lg text-[#2E1A47] dark:text-[#DFC8E7]">
          {isAr ? `${test.price} ر.ع.` : `OMR ${test.price}`}
        </span>
        <button onClick={onBook}
          className="px-5 py-2 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
          {isAr ? "احجز الآن" : "Book Now"}
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function LabTestsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [search, setSearch]     = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [booking, setBooking]   = useState<typeof LABS[0] | null>(null);

  const filtered = LABS.filter(t => {
    const matchCat = activeTab === "All" || t.category === activeTab;
    const q = search.toLowerCase();
    return matchCat && (!q || t.en.name.toLowerCase().includes(q) || t.ar.name.includes(q) || t.en.lab.toLowerCase().includes(q));
  });

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "الفحوصات المخبرية" : "Lab Tests"}
          </p>
          <h1 className="font-black font-serif text-white mb-6" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
            {ar
              ? <><span className="block">افحص صحتك</span><span className="block italic text-[#DFC8E7]">من المنزل أو المختبر.</span></>
              : <><span className="block">Test your health</span><span className="block italic text-[#DFC8E7]">from home or lab.</span></>}
          </h1>
          <div className="flex items-center gap-2 bg-white dark:bg-[#1a1030] rounded-2xl px-4 py-3 border border-white/10 shadow-lg max-w-2xl">
            <svg className="w-5 h-5 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={ar ? "ابحث عن فحص أو مختبر..." : "Search test name or lab..."}
              className="flex-1 text-sm outline-none text-[#2E1A47] dark:text-[#DFC8E7] placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30 bg-transparent" />
            {search && <button onClick={() => setSearch("")} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>}
          </div>
        </div>
      </section>

      {/* Category tabs */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 overflow-x-auto">
        <div className="max-w-4xl mx-auto flex gap-2 flex-nowrap">
          {CATEGORIES.map(c => (
            <button key={c.en} onClick={() => setActiveTab(c.en)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 border transition-all ${activeTab === c.en ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"}`}>
              {ar ? c.ar : c.en}
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      <section className="py-10 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-6">
            {ar ? `${filtered.length} فحص متاح` : `${filtered.length} test${filtered.length !== 1 ? "s" : ""} found`}
          </p>
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">🔬</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد نتائج" : "No tests found"}</p>
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{ar ? "جرّب البحث بكلمة مختلفة." : "Try a different search term."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(t => <TestCard key={t.id} test={t} isAr={ar} onBook={() => setBooking(t)} />)}
            </div>
          )}
        </div>
      </section>

      {booking && <BookModal test={booking} isAr={ar} onClose={() => setBooking(null)} />}
    </div>
  );
}
