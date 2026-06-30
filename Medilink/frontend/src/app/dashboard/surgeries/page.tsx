"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Slot = { t: string; taken: boolean };

/* ─── Data ──────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { en: "All",              ar: "الكل" },
  { en: "Orthopedic",       ar: "عظام" },
  { en: "Cardiac",          ar: "قلب" },
  { en: "Ophthalmology",    ar: "عيون" },
  { en: "General Surgery",  ar: "جراحة عامة" },
  { en: "Gynecology",       ar: "نساء وتوليد" },
  { en: "ENT",              ar: "أنف وأذن وحنجرة" },
  { en: "Cosmetic",         ar: "تجميل" },
];

const SURGERIES = [
  {
    id: "KR",
    emoji: "🦴",
    grad: "from-[#e8d5f0] to-[#d5e8f5]",
    category: "Orthopedic",
    price: 1800,
    duration: "90 min",
    stay: "1 night",
    rating: 4.9,
    reviews: 214,
    en: { name: "Knee Replacement",        hospital: "Royal Ortho & Spine Centre", desc: "Total or partial knee replacement using advanced implants with full anaesthesia support." },
    ar: { name: "استبدال مفصل الركبة",    hospital: "مركز رويال لعظام والعمود الفقري", desc: "استبدال كلي أو جزئي لمفصل الركبة باستخدام غرسات متطورة مع تخدير كامل." },
    slots: buildSlots([0, 3, 6]),
  },
  {
    id: "CB",
    emoji: "❤️",
    grad: "from-[#d5e8f5] to-[#ede0f8]",
    category: "Cardiac",
    price: 4500,
    duration: "4–6 hrs",
    stay: "3–5 nights",
    rating: 4.9,
    reviews: 98,
    en: { name: "Coronary Bypass (CABG)",   hospital: "Heart & Vascular Centre",   desc: "Open-heart bypass surgery to restore blood flow around blocked coronary arteries." },
    ar: { name: "جراحة القلب المفتوح (CABG)", hospital: "مركز القلب والأوعية",    desc: "جراحة القلب المفتوح لاستعادة تدفق الدم حول الشرايين التاجية المسدودة." },
    slots: buildSlots([1, 4]),
  },
  {
    id: "LS",
    emoji: "👁️",
    grad: "from-[#ede0f8] to-[#d1fae5]",
    category: "Ophthalmology",
    price: 900,
    duration: "20 min",
    stay: "Day case",
    rating: 4.8,
    reviews: 502,
    en: { name: "LASIK Eye Surgery",        hospital: "Vision Care Eye Centre",    desc: "Laser vision correction for myopia, hyperopia and astigmatism. Blade-free technique." },
    ar: { name: "عملية الليزك للعيون",      hospital: "مركز رؤية لرعاية العيون",  desc: "تصحيح بصري بالليزر للقصر والبُعد والاستجماتيزم. تقنية بدون شفرة." },
    slots: buildSlots([0, 2, 5, 8]),
  },
  {
    id: "AP",
    emoji: "🏥",
    grad: "from-[#d1fae5] to-[#e8d5f0]",
    category: "General Surgery",
    price: 650,
    duration: "45 min",
    stay: "Day case",
    rating: 4.7,
    reviews: 380,
    en: { name: "Laparoscopic Appendectomy", hospital: "Sunrise Surgical Centre",  desc: "Minimally invasive appendix removal with 3 small incisions and rapid recovery." },
    ar: { name: "استئصال الزائدة بالمنظار", hospital: "مركز الشروق الجراحي",     desc: "إزالة الزائدة بالمنظار عبر ٣ شقوق صغيرة مع تعافٍ سريع." },
    slots: buildSlots([1, 3, 6]),
  },
  {
    id: "CS",
    emoji: "🤱",
    grad: "from-[#fde68a] to-[#d5e8f5]",
    category: "Gynecology",
    price: 1200,
    duration: "45–60 min",
    stay: "3 nights",
    rating: 4.9,
    reviews: 317,
    en: { name: "Caesarean Section (C-Section)", hospital: "Women's Health Centre", desc: "Planned or emergency surgical delivery ensuring the safety of mother and baby." },
    ar: { name: "الولادة القيصرية",         hospital: "مركز صحة المرأة",          desc: "ولادة جراحية مخططة أو طارئة لضمان سلامة الأم والطفل." },
    slots: buildSlots([0, 4, 7]),
  },
  {
    id: "TS",
    emoji: "👂",
    grad: "from-[#e8d5f0] to-[#fde68a]",
    category: "ENT",
    price: 550,
    duration: "30 min",
    stay: "Day case",
    rating: 4.7,
    reviews: 193,
    en: { name: "Tonsillectomy",            hospital: "Al Shifa ENT Centre",      desc: "Surgical removal of inflamed tonsils to resolve chronic sore throat and infections." },
    ar: { name: "استئصال اللوزتين",         hospital: "مركز الشفاء لأنف وأذن وحنجرة", desc: "إزالة جراحية للوزتين الملتهبتين للتخلص من التهابات الحلق المتكررة." },
    slots: buildSlots([2, 5]),
  },
  {
    id: "RN",
    emoji: "👃",
    grad: "from-[#d5e8f5] to-[#d1fae5]",
    category: "Cosmetic",
    price: 1400,
    duration: "2 hrs",
    stay: "Day case",
    rating: 4.8,
    reviews: 145,
    en: { name: "Rhinoplasty (Nose Job)",   hospital: "Aesthetica Cosmetic Centre", desc: "Cosmetic or functional nose reshaping with natural-looking results." },
    ar: { name: "تجميل الأنف",             hospital: "مركز أستيتيكا للتجميل",    desc: "إعادة تشكيل الأنف تجميلياً أو وظيفياً مع نتائج طبيعية المظهر." },
    slots: buildSlots([1, 4, 7]),
  },
  {
    id: "SH",
    emoji: "💪",
    grad: "from-[#d1fae5] to-[#ede0f8]",
    category: "Orthopedic",
    price: 2100,
    duration: "2 hrs",
    stay: "1–2 nights",
    rating: 4.8,
    reviews: 168,
    en: { name: "Shoulder Arthroscopy",     hospital: "Royal Ortho & Spine Centre", desc: "Keyhole surgery for rotator cuff repair, shoulder impingement and instability." },
    ar: { name: "تنظير مفصل الكتف",         hospital: "مركز رويال لعظام والعمود الفقري", desc: "جراحة بالمنظار لإصلاح الكفة المدورة وعدم استقرار الكتف." },
    slots: buildSlots([0, 3]),
  },
];

function buildSlots(takenIdx: number[]): Slot[] {
  const times = [
    "7:00 AM","7:30 AM","8:00 AM","8:30 AM","9:00 AM","9:30 AM",
    "10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM",
  ];
  return times.map((t, i) => ({ t, taken: takenIdx.includes(i) }));
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
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

/* ─── ConsultModal (request consultation before booking surgery) ─────── */
function ConsultModal({ surgery, isAr, onClose }: { surgery: typeof SURGERIES[0]; isAr: boolean; onClose: () => void }) {
  const [step, setStep]   = useState<"date" | "time" | "confirm">("date");
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [booked, setBooked]   = useState(false);
  const info = isAr ? surgery.ar : surgery.en;

  const SLOT_GROUPS = [
    { key: "morning",   en: "Morning 🌅",   ar: "الصباح 🌅",   slots: surgery.slots.filter(s => s.t.includes("AM")) },
    { key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️", slots: surgery.slots.filter(s => s.t.includes("PM")) },
  ].filter(g => g.slots.length > 0);

  const Header = () => (
    <div className="px-6 pt-6 pb-4 border-b border-[#e7dcee] dark:border-[#2a1840]">
      <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-gradient-to-br ${surgery.grad}`}>{surgery.emoji}</div>
        <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] text-sm leading-snug">{info.name}</p>
          <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">{info.hospital}</p>
        </div>
        <button onClick={onClose} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Steps */}
      <div className={`flex items-center gap-2 mt-4 ${isAr ? "flex-row-reverse" : ""}`}>
        {[{ k: "date", en: "Date", ar: "التاريخ" }, { k: "time", en: "Time", ar: "الوقت" }, { k: "confirm", en: "Review", ar: "مراجعة" }].map((s, i) => (
          <div key={s.k} className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
            {i > 0 && <div className="w-4 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />}
            <div className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                step === s.k ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]"
                : (step === "time" && s.k === "date") || (step === "confirm" && (s.k === "date" || s.k === "time")) ? "bg-emerald-500 text-white"
                : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"}`}>
                {((step === "time" && s.k === "date") || (step === "confirm" && (s.k === "date" || s.k === "time"))) ? "✓" : i + 1}
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
        <h3 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">{isAr ? "تم جدولة الاستشارة!" : "Consultation Scheduled!"}</h3>
        <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-3">{isAr ? "سيتواصل معك الفريق الطبي لتأكيد موعد الجراحة." : "The medical team will contact you to confirm the surgery date."}</p>
        <p className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7]">{selDate ? fmtDate(selDate, isAr) : ""} · {selTime}</p>
        <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-1 mb-6">{info.hospital}</p>
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
            <div className="max-h-56 overflow-y-auto pr-1 space-y-4 mb-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
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
            <button disabled={!selTime} onClick={() => setStep("confirm")}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selTime ? (isAr ? `التالي — ${selTime}` : `Next — ${selTime}`) : (isAr ? "اختر وقتاً" : "Select a time")}
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mb-4">
              {isAr ? "مراجعة الموعد" : "Review your booking"}
            </p>
            <div className="bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl p-4 space-y-3 mb-5 border border-[#e7dcee] dark:border-[#2a1840]">
              {[
                { label: isAr ? "الإجراء" : "Procedure",    val: info.name },
                { label: isAr ? "المستشفى" : "Hospital",    val: info.hospital },
                { label: isAr ? "التاريخ" : "Date",         val: selDate ? fmtDate(selDate, isAr) : "" },
                { label: isAr ? "الوقت" : "Time",           val: selTime ?? "" },
                { label: isAr ? "المدة" : "Duration",       val: surgery.duration },
                { label: isAr ? "الإقامة" : "Hospital stay",val: surgery.stay },
                { label: isAr ? "التكلفة التقديرية" : "Est. cost", val: isAr ? `${surgery.price.toLocaleString()} ر.ع.` : `OMR ${surgery.price.toLocaleString()}` },
              ].map(row => (
                <div key={row.label} className={`flex justify-between items-start gap-4 ${isAr ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 flex-shrink-0">{row.label}</span>
                  <span className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7] text-right">{row.val}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mb-4 leading-relaxed">
              {isAr
                ? "سيتم التواصل معك لتأكيد موعد الجراحة وتقديم تعليمات ما قبل العملية."
                : "You will be contacted to confirm the surgery date and receive pre-operative instructions."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setStep("time")}
                className="flex-1 py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 transition-all">
                {isAr ? "تعديل" : "Edit"}
              </button>
              <button onClick={() => setBooked(true)}
                className="flex-[2] py-3 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {isAr ? "تأكيد الاستشارة" : "Confirm Consultation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SurgeryCard ────────────────────────────────────────────────────── */
function SurgeryCard({ surgery, isAr, onBook }: { surgery: typeof SURGERIES[0]; isAr: boolean; onBook: () => void }) {
  const info = isAr ? surgery.ar : surgery.en;
  return (
    <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className={`h-24 flex items-center justify-center text-4xl bg-gradient-to-br ${surgery.grad}`}>
        {surgery.emoji}
      </div>
      <div className="p-5">
        <div className={`mb-3 ${isAr ? "text-right" : ""}`}>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] leading-snug mb-1">{info.name}</p>
          <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold mb-2">{info.hospital}</p>
          <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 leading-relaxed">{info.desc}</p>
        </div>

        <div className={`flex flex-wrap gap-2 mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0e8f8] dark:bg-[#2E1A47]/30 text-[#46255f] dark:text-[#DFC8E7]/70">
            ⏱ {surgery.duration}
          </span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0e8f8] dark:bg-[#2E1A47]/30 text-[#46255f] dark:text-[#DFC8E7]/70">
            🏥 {surgery.stay}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0e8f8] dark:bg-[#2E1A47]/30 text-[#46255f] dark:text-[#DFC8E7]/70">
            ★ {surgery.rating} ({surgery.reviews})
          </span>
        </div>

        <div className={`flex items-center justify-between ${isAr ? "flex-row-reverse" : ""}`}>
          <div className={isAr ? "text-right" : ""}>
            <p className="text-[10px] text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">{isAr ? "تكلفة تقديرية" : "Est. cost"}</p>
            <p className="font-black text-lg text-[#2E1A47] dark:text-[#DFC8E7]">
              {isAr ? `${surgery.price.toLocaleString()} ر.ع.` : `OMR ${surgery.price.toLocaleString()}`}
            </p>
          </div>
          <button onClick={onBook}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] transition-opacity hover:opacity-85"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
            {isAr ? "استشارة وحجز" : "Consult & Book"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function SurgeriesPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [search, setSearch]     = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [booking, setBooking]   = useState<typeof SURGERIES[0] | null>(null);

  const filtered = SURGERIES.filter(s => {
    const matchCat = activeTab === "All" || s.category === activeTab;
    const q = search.toLowerCase();
    return matchCat && (!q || s.en.name.toLowerCase().includes(q) || s.ar.name.includes(q) || s.en.hospital.toLowerCase().includes(q));
  });

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "العمليات الجراحية" : "Surgeries"}
          </p>
          <h1 className="font-black font-serif text-white mb-6" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
            {ar
              ? <><span className="block">مراكز جراحية</span><span className="block italic text-[#DFC8E7]">آمنة وموثوقة.</span></>
              : <><span className="block">Safe and trusted</span><span className="block italic text-[#DFC8E7]">surgery centres.</span></>}
          </h1>
          <div className="flex items-center gap-2 bg-white dark:bg-[#1a1030] rounded-2xl px-4 py-3 border border-white/10 shadow-lg max-w-2xl">
            <svg className="w-5 h-5 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={ar ? "ابحث عن عملية أو مستشفى..." : "Search procedure or hospital..."}
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
            {ar ? `${filtered.length} إجراء متاح` : `${filtered.length} procedure${filtered.length !== 1 ? "s" : ""} found`}
          </p>
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">🏥</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد نتائج" : "No procedures found"}</p>
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{ar ? "جرّب البحث بكلمة مختلفة." : "Try a different search term."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(s => <SurgeryCard key={s.id} surgery={s} isAr={ar} onBook={() => setBooking(s)} />)}
            </div>
          )}
        </div>
      </section>

      {booking && <ConsultModal surgery={booking} isAr={ar} onClose={() => setBooking(null)} />}
    </div>
  );
}
