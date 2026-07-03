"use client";

import { useState } from "react";

/* ─── Shared doctor booking flow — used by Find Doctors, doctor profile, and Symptom Checker ── */

export type Slot = { t: string; taken: boolean };

const MORNING: Slot[] = [
  { t: "8:00 AM",  taken: true  }, { t: "8:30 AM",  taken: false },
  { t: "9:00 AM",  taken: false }, { t: "9:30 AM",  taken: true  },
  { t: "10:00 AM", taken: false }, { t: "10:30 AM", taken: false },
  { t: "11:00 AM", taken: true  }, { t: "11:30 AM", taken: false },
];
const AFTERNOON: Slot[] = [
  { t: "12:00 PM", taken: false }, { t: "12:30 PM", taken: true  },
  { t: "1:00 PM",  taken: false }, { t: "1:30 PM",  taken: false },
  { t: "2:00 PM",  taken: true  }, { t: "2:30 PM",  taken: false },
  { t: "3:00 PM",  taken: false }, { t: "3:30 PM",  taken: true  },
  { t: "4:00 PM",  taken: false }, { t: "4:30 PM",  taken: false },
];
const EVENING: Slot[] = [
  { t: "5:00 PM",  taken: false }, { t: "5:30 PM",  taken: true  },
  { t: "6:00 PM",  taken: false }, { t: "6:30 PM",  taken: false },
  { t: "7:00 PM",  taken: true  }, { t: "7:30 PM",  taken: false },
];

export const SLOTS_A: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [0, 3, 6].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [1, 4, 7].includes(i) })),
  ...EVENING.map((s, i) => ({ ...s, taken: [1, 4].includes(i) })),
];
export const SLOTS_B: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [0, 2, 5].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [0, 3, 6, 9].includes(i) })),
  ...EVENING.map((s, i) => ({ ...s, taken: [0, 3].includes(i) })),
];
export const SLOTS_C: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [1, 4, 7].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [2, 5, 8].includes(i) })),
];

/* ─── Unified doctor view model (mock demo doctors + real Supabase doctors) ── */
export type ViewDoctor = {
  id: string;
  initials: string;
  grad: string;
  specialty: string;
  bio: string;
  fee: number;
  rating: number;
  reviews: number;
  available: boolean;
  name: string;
  hospital: string;
  type: string;
  slots: Slot[];
  education: string;
  experience: string;
  languages: string;
  location: string;
};

/* ─── Calendar helpers ───────────────────────────────────────────────── */
const DAY_NAMES_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_AR = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];
const MONTH_LONG_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_LONG_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTH_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const TODAY = new Date(2026, 5, 29);

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ─── MiniCalendar ───────────────────────────────────────────────────── */
function MiniCalendar({ isAr, selected, onSelect }: { isAr: boolean; selected: Date | null; onSelect: (d: Date) => void }) {
  const [viewYear, setViewYear]   = useState(TODAY.getFullYear());
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth());
  const cells = buildCalendar(viewYear, viewMonth);
  const atMin = viewYear === TODAY.getFullYear() && viewMonth === TODAY.getMonth();

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  return (
    <div>
      <div className={`flex items-center justify-between mb-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <button onClick={prevMonth} disabled={atMin}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">
          {isAr ? MONTH_LONG_AR[viewMonth] : MONTH_LONG_EN[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {(isAr ? DAY_NAMES_AR : DAY_NAMES_EN).map(l => (
          <div key={l} className="text-center text-[10px] font-bold uppercase tracking-wide text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const date = new Date(viewYear, viewMonth, day);
          const isToday = sameDay(date, TODAY);
          const isPast  = date < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
          const isSel   = selected ? sameDay(date, selected) : false;
          return (
            <button key={`d-${day}`} disabled={isPast} onClick={() => onSelect(date)}
              className={`mx-auto w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-all ${
                isSel ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] shadow-md"
                  : isToday ? "border-2 border-[#46255f] dark:border-[#DFC8E7] text-[#46255f] dark:text-[#DFC8E7] font-bold"
                  : isPast  ? "text-[#2E1A47]/18 dark:text-[#DFC8E7]/18 cursor-not-allowed"
                  : "text-[#2E1A47] dark:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30"
              }`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Demo family members (mirrors profile family members) ───────────── */
const DEMO_FAMILY = [
  { name: "Sarah Al Zadjali",  initials: "SZ", relation: "Daughter" },
  { name: "Khalid Al Zadjali", initials: "KZ", relation: "Son"      },
];

/* ─── BookingModal ────────────────────────────────────────────────────── */
export function BookingModal({
  doctor,
  isAr,
  onClose,
}: {
  doctor: ViewDoctor;
  isAr: boolean;
  onClose: () => void;
}) {
  const [step, setStep]                 = useState<"date" | "time" | "payment">("date");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [payMethod, setPayMethod]       = useState<string | null>(null);
  const [booked, setBooked]             = useState(false);
  const [patient, setPatient]           = useState<string>("self");
  const d = { name: doctor.name, hospital: doctor.hospital };

  const patientLabel = patient === "self"
    ? (isAr ? "أنا" : "Myself")
    : DEMO_FAMILY.find(m => m.initials === patient)?.name ?? patient;

  function fmtDate(date: Date) {
    return isAr ? `${date.getDate()} ${MONTH_AR[date.getMonth()]}` : `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
  }

  if (booked) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white dark:bg-[#1a1030] rounded-t-3xl sm:rounded-2xl px-7 pt-6 pb-8 max-w-sm w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl max-h-[92vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-3xl mx-auto mb-3">✅</div>
          <h3 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
            {isAr ? "تم تأكيد الحجز!" : "Appointment Confirmed!"}
          </h3>
          <p className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7] mt-2">
            {selectedDate ? fmtDate(selectedDate) : ""} · {selectedTime}
          </p>
          <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-1">{d.name} · {d.hospital}</p>
          {patient !== "self" && (
            <p className="text-xs font-semibold mt-1 mb-2 px-3 py-1 rounded-full inline-block" style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", color: "#2E1A47" }}>
              {isAr ? "نيابةً عن" : "For"} {patientLabel}
            </p>
          )}
          <div className="mb-4" />
          <div className="bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl p-4 mb-3 text-left border border-[#e7dcee] dark:border-[#2a1840]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3">
              {isAr ? "الإشعارات المُرسَلة" : "Notifications Sent"}
            </p>
            {[
              { icon: "📱", label: isAr ? "رسالة SMS" : "SMS", detail: "+968 9123 4567" },
              { icon: "📧", label: isAr ? "البريد الإلكتروني" : "Email", detail: "v*****@inzint.com" },
            ].map(n => (
              <div key={n.label} className="flex items-center gap-2.5 mb-2 last:mb-0">
                <span className="text-base">{n.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{n.label}</p>
                  <p className="text-[11px] text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">{n.detail}</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓ {isAr ? "أُرسل" : "Sent"}</span>
              </div>
            ))}
          </div>
          <div className="bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl px-4 py-3 mb-5 text-left border border-[#e7dcee] dark:border-[#2a1840]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">{isAr ? "طريقة الدفع" : "Payment"}</span>
              <span className="text-xs font-bold text-[#46255f] dark:text-[#DFC8E7]">
                {payMethod === "thawani" ? "💳 Thawani Pay" : payMethod === "card" ? "🏦 Card" : "🏥 " + (isAr ? "عند الوصول" : "At Clinic")}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">{isAr ? "الرسوم" : "Fee"}</span>
              <span className="text-xs font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{isAr ? `${doctor.fee} ر.ع.` : `OMR ${doctor.fee}`}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47]"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
            {isAr ? "إغلاق" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  const allSlots = doctor.slots;
  const slotGroups = [
    { key: "morning",   en: "Morning 🌅",   ar: "الصباح 🌅",   slots: allSlots.filter(s => s.t.includes("AM")) },
    { key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️",  slots: allSlots.filter(s => s.t.includes("PM") && parseInt(s.t) <= 4) },
    { key: "evening",   en: "Evening 🌙",   ar: "المساء 🌙",    slots: allSlots.filter(s => s.t.includes("PM") && parseInt(s.t) >= 5) },
  ].filter(g => g.slots.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1030] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#e7dcee] dark:bg-[#3a2560]" />
        </div>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#e7dcee] dark:border-[#2a1840]">
          <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${doctor.grad} text-[#2E1A47]`}>
              {doctor.initials}
            </div>
            <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate text-sm">{d.name}</p>
              <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 truncate">{d.hospital}</p>
            </div>
            <button onClick={onClose} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          {/* Step indicator */}
          <div className={`flex items-center gap-2 mt-4 ${isAr ? "flex-row-reverse" : ""}`}>
            {[{ key: "date", en: "Date", ar: "التاريخ" }, { key: "time", en: "Time", ar: "الوقت" }, { key: "payment", en: "Pay", ar: "الدفع" }].map((s, i) => {
              const done = (step === "time" && s.key === "date") || (step === "payment" && (s.key === "date" || s.key === "time"));
              return (
                <div key={s.key} className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
                  {i > 0 && <div className="w-5 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />}
                  <div className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                      step === s.key ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]"
                        : done ? "bg-emerald-500 text-white"
                        : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"
                    }`}>{done ? "✓" : i + 1}</div>
                    <span className={`text-xs font-semibold ${step === s.key ? "text-[#2E1A47] dark:text-[#DFC8E7]" : "text-[#2E1A47]/35 dark:text-[#DFC8E7]/35"}`}>
                      {isAr ? s.ar : s.en}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Date */}
        {step === "date" && (
          <div className="px-6 py-5">

            {/* Who is this for? */}
            <div className="mb-5">
              <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mb-2.5 ${isAr ? "text-right" : ""}`}>
                {isAr ? "الموعد لـ" : "Booking for"}
              </p>
              <div className={`flex flex-wrap gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
                {/* Myself chip */}
                <button onClick={() => setPatient("self")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isAr ? "flex-row-reverse" : ""} ${
                    patient === "self"
                      ? "border-[#46255f] dark:border-[#DFC8E7] text-[#2E1A47] dark:text-[#1a1030]"
                      : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:border-[#46255f]/40 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20"
                  }`}
                  style={patient === "self" ? { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" } : {}}>
                  <div className="w-5 h-5 rounded-full bg-[#2E1A47]/15 dark:bg-[#DFC8E7]/15 flex items-center justify-center text-[9px] font-black text-[#2E1A47] dark:text-[#DFC8E7] flex-shrink-0">
                    ME
                  </div>
                  {isAr ? "أنا" : "Myself"}
                </button>

                {/* Family member chips */}
                {DEMO_FAMILY.map(m => (
                  <button key={m.initials} onClick={() => setPatient(m.initials)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isAr ? "flex-row-reverse" : ""} ${
                      patient === m.initials
                        ? "border-[#46255f] dark:border-[#DFC8E7] text-[#2E1A47] dark:text-[#1a1030]"
                        : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:border-[#46255f]/40 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20"
                    }`}
                    style={patient === m.initials ? { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" } : {}}>
                    <div className="w-5 h-5 rounded-full bg-[#e8d5f0] dark:bg-[#2E1A47]/40 flex items-center justify-center text-[9px] font-black text-[#2E1A47] dark:text-[#DFC8E7] flex-shrink-0">
                      {m.initials}
                    </div>
                    <span>{m.name.split(" ")[0]}</span>
                    <span className="opacity-50 font-normal">· {isAr ? m.relation : m.relation}</span>
                  </button>
                ))}
              </div>
            </div>

            <MiniCalendar isAr={isAr} selected={selectedDate} onSelect={setSelectedDate} />
            <button disabled={!selectedDate} onClick={() => setStep("time")}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selectedDate
                ? isAr ? `التالي — ${fmtDate(selectedDate)}` : `Next — ${fmtDate(selectedDate)}`
                : isAr ? "اختر تاريخاً" : "Select a date"}
            </button>
          </div>
        )}

        {/* Step 2: Time */}
        {step === "time" && (
          <div className="px-6 py-5">
            <div className={`flex items-center justify-between mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "اختر وقتاً" : "Choose a time"}
              </p>
              <button onClick={() => { setStep("date"); setSelectedTime(null); }}
                className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                ← {selectedDate ? fmtDate(selectedDate) : ""}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-5 mb-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
              {slotGroups.map(group => (
                <div key={group.key}>
                  <p className="text-[11px] font-bold text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">{isAr ? group.ar : group.en}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {group.slots.map(slot => (
                      <button key={slot.t} disabled={slot.taken} onClick={() => setSelectedTime(slot.t)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all relative ${
                          slot.taken
                            ? "border-[#e7dcee] dark:border-[#2a1840] text-[#2E1A47]/20 dark:text-[#DFC8E7]/20 cursor-not-allowed bg-[#faf8fc] dark:bg-[#0d0820]"
                            : selectedTime === slot.t
                              ? "border-[#46255f] bg-[#46255f] text-white dark:border-[#DFC8E7] dark:bg-[#DFC8E7] dark:text-[#1a1030] shadow-sm"
                              : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#46255f]/50 dark:hover:border-[#DFC8E7]/50 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"
                        }`}>
                        {slot.t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button disabled={!selectedTime} onClick={() => setStep("payment")}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selectedTime ? (isAr ? `التالي — ${selectedTime}` : `Next — ${selectedTime}`) : (isAr ? "اختر وقتاً" : "Select a time")}
            </button>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === "payment" && (
          <div className="px-6 py-5">
            <div className={`flex items-center justify-between mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "طريقة الدفع" : "Payment Method"}
              </p>
              <button onClick={() => setStep("time")} className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                ← {selectedTime}
              </button>
            </div>
            <div className={`bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl p-4 mb-4 border border-[#e7dcee] dark:border-[#2a1840] space-y-2 ${isAr ? "text-right" : ""}`}>
              {[
                { l: isAr ? "الطبيب" : "Doctor",         v: d.name },
                { l: isAr ? "المريض" : "Patient",         v: patientLabel },
                { l: isAr ? "التاريخ والوقت" : "Date & Time", v: `${selectedDate ? fmtDate(selectedDate) : ""} · ${selectedTime}` },
              ].map(row => (
                <div key={row.l} className={`flex justify-between items-start gap-4 ${isAr ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 flex-shrink-0">{row.l}</span>
                  <span className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7] text-right">{row.v}</span>
                </div>
              ))}
              <div className={`flex justify-between items-center pt-2 border-t border-[#e7dcee] dark:border-[#2a1840] ${isAr ? "flex-row-reverse" : ""}`}>
                <span className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{isAr ? "الرسوم" : "Fee"}</span>
                <span className="text-sm font-black text-[#46255f] dark:text-[#DFC8E7]">{isAr ? `${doctor.fee} ر.ع.` : `OMR ${doctor.fee}`}</span>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {[
                { key: "thawani", icon: "💳", en: "Thawani Pay",         enSub: "Recommended",       ar: "ثواني Pay",            arSub: "الطريقة الموصى بها" },
                { key: "card",    icon: "🏦", en: "Credit / Debit Card", enSub: "Visa · Mastercard", ar: "بطاقة ائتمانية / خصم", arSub: "Visa · Mastercard" },
                { key: "cash",    icon: "🏥", en: "Pay at Clinic",       enSub: "Pay on arrival",    ar: "الدفع في العيادة",     arSub: "ادفع عند الوصول" },
              ].map(m => (
                <button key={m.key} onClick={() => setPayMethod(m.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${isAr ? "flex-row-reverse text-right" : ""} ${
                    payMethod === m.key
                      ? "border-[#46255f] dark:border-[#DFC8E7] bg-[#f0e8f8] dark:bg-[#2E1A47]/30"
                      : "border-[#e7dcee] dark:border-[#3a2560] hover:border-[#46255f]/40 dark:hover:border-[#DFC8E7]/40 hover:bg-[#faf8fc] dark:hover:bg-[#1a1030]"
                  }`}>
                  <span className="text-xl flex-shrink-0">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{isAr ? m.ar : m.en}</p>
                    <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{isAr ? m.arSub : m.enSub}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    payMethod === m.key ? "border-[#46255f] dark:border-[#DFC8E7] bg-[#46255f] dark:bg-[#DFC8E7]" : "border-[#e7dcee] dark:border-[#3a2560]"
                  }`}>
                    {payMethod === m.key && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1a1030]" />}
                  </div>
                </button>
              ))}
            </div>
            <button disabled={!payMethod} onClick={() => setBooked(true)}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {payMethod === "cash"
                ? isAr ? "تأكيد الحجز" : "Confirm Booking"
                : isAr ? `ادفع ${doctor.fee} ر.ع.` : `Pay OMR ${doctor.fee}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
