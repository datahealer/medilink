"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Data ──────────────────────────────────────────────────────────── */

const SPECIALTIES = [
  { en: "All",              ar: "الكل" },
  { en: "General Care",     ar: "طب عام" },
  { en: "Cardiology",       ar: "أمراض القلب" },
  { en: "Dermatology",      ar: "جلدية" },
  { en: "Gynecology",       ar: "نساء وتوليد" },
  { en: "Dentist",          ar: "أسنان" },
  { en: "Pediatrics",       ar: "أطفال" },
  { en: "Orthopedics",      ar: "عظام" },
];

type Slot = { t: string; taken: boolean };

const MORNING: Slot[]   = [
  { t: "8:00 AM",  taken: true  },
  { t: "8:30 AM",  taken: false },
  { t: "9:00 AM",  taken: false },
  { t: "9:30 AM",  taken: true  },
  { t: "10:00 AM", taken: false },
  { t: "10:30 AM", taken: false },
  { t: "11:00 AM", taken: true  },
  { t: "11:30 AM", taken: false },
];
const AFTERNOON: Slot[] = [
  { t: "12:00 PM", taken: false },
  { t: "12:30 PM", taken: true  },
  { t: "1:00 PM",  taken: false },
  { t: "1:30 PM",  taken: false },
  { t: "2:00 PM",  taken: true  },
  { t: "2:30 PM",  taken: false },
  { t: "3:00 PM",  taken: false },
  { t: "3:30 PM",  taken: true  },
  { t: "4:00 PM",  taken: false },
  { t: "4:30 PM",  taken: false },
];
const EVENING: Slot[]   = [
  { t: "5:00 PM",  taken: false },
  { t: "5:30 PM",  taken: true  },
  { t: "6:00 PM",  taken: false },
  { t: "6:30 PM",  taken: false },
  { t: "7:00 PM",  taken: true  },
  { t: "7:30 PM",  taken: false },
];

const SLOTS_A: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [0, 3, 6].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [1, 4, 7].includes(i) })),
  ...EVENING.map((s, i) => ({ ...s, taken: [1, 4].includes(i) })),
];
const SLOTS_B: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [0, 2, 5].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [0, 3, 6, 9].includes(i) })),
  ...EVENING.map((s, i) => ({ ...s, taken: [0, 3].includes(i) })),
];
const SLOTS_C: Slot[] = [
  ...MORNING.map((s, i) => ({ ...s, taken: [1, 4, 7].includes(i) })),
  ...AFTERNOON.map((s, i) => ({ ...s, taken: [2, 5, 8].includes(i) })),
];

const DOCTORS = [
  {
    initials: "AH",
    grad: "from-[#e8d5f0] to-[#d5e8f5]",
    specialty: "General Care",
    fee: 30,
    rating: 4.9,
    reviews: 312,
    available: true,
    en: { name: "Dr. Aisha Al Harthy",   hospital: "Royal Care Clinic",       type: "In-clinic & Video" },
    ar: { name: "د. عائشة الحارثي",      hospital: "عيادة رويال كير",          type: "في العيادة والفيديو" },
    slots: SLOTS_A,
  },
  {
    initials: "OB",
    grad: "from-[#d5e8f5] to-[#ede0f8]",
    specialty: "Cardiology",
    fee: 60,
    rating: 4.8,
    reviews: 198,
    available: true,
    en: { name: "Dr. Omar Al Balushi",   hospital: "Heart & Vascular Centre",  type: "In-clinic" },
    ar: { name: "د. عمر البلوشي",        hospital: "مركز القلب والأوعية",      type: "في العيادة" },
    slots: SLOTS_B,
  },
  {
    initials: "FR",
    grad: "from-[#ede0f8] to-[#e8d5f0]",
    specialty: "Dermatology",
    fee: 45,
    rating: 4.7,
    reviews: 245,
    available: false,
    en: { name: "Dr. Fatma Al Riyami",   hospital: "Skin & Wellness Studio",   type: "In-clinic & Video" },
    ar: { name: "د. فاطمة الريامي",      hospital: "عيادة الجلد والعافية",     type: "في العيادة والفيديو" },
    slots: [] as Slot[],
  },
  {
    initials: "SN",
    grad: "from-[#d1fae5] to-[#d5e8f5]",
    specialty: "Gynecology",
    fee: 55,
    rating: 4.9,
    reviews: 420,
    available: true,
    en: { name: "Dr. Sara Al Nabhani",   hospital: "Women's Health Centre",    type: "In-clinic & Video" },
    ar: { name: "د. سارة النبهانية",     hospital: "مركز صحة المرأة",          type: "في العيادة والفيديو" },
    slots: SLOTS_C,
  },
  {
    initials: "KM",
    grad: "from-[#fde68a] to-[#e8d5f0]",
    specialty: "Dentist",
    fee: 40,
    rating: 4.6,
    reviews: 167,
    available: true,
    en: { name: "Dr. Khalid Al Maskari", hospital: "Bright Smile Dental",      type: "In-clinic" },
    ar: { name: "د. خالد المسكري",       hospital: "عيادة ابتسامة مشرقة",     type: "في العيادة" },
    slots: SLOTS_A,
  },
  {
    initials: "LH",
    grad: "from-[#e8d5f0] to-[#d1fae5]",
    specialty: "Pediatrics",
    fee: 35,
    rating: 4.8,
    reviews: 289,
    available: true,
    en: { name: "Dr. Layla Al Habsi",    hospital: "Children's Wellness Hub",  type: "In-clinic & Video" },
    ar: { name: "د. ليلى الحبسية",       hospital: "مركز صحة الأطفال",         type: "في العيادة والفيديو" },
    slots: SLOTS_B,
  },
];

/* ─── helpers ───────────────────────────────────────────────────────── */
const DAY_NAMES_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_AR = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];
const MONTH_LONG_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_LONG_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTH_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const TODAY = new Date(2026, 5, 29); // pinned: 2026-06-29

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
function MiniCalendar({
  isAr,
  selected,
  onSelect,
}: {
  isAr: boolean;
  selected: Date | null;
  onSelect: (d: Date) => void;
}) {
  const [viewYear, setViewYear]   = useState(TODAY.getFullYear());
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth());

  const cells   = buildCalendar(viewYear, viewMonth);
  const dayLabels = isAr ? DAY_NAMES_AR : DAY_NAMES_EN;

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // disable going back before current month
  const atMin = viewYear === TODAY.getFullYear() && viewMonth === TODAY.getMonth();

  return (
    <div>
      {/* Month nav */}
      <div className={`flex items-center justify-between mb-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <button
          onClick={prevMonth}
          disabled={atMin}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7]">
          {isAr ? MONTH_LONG_AR[viewMonth] : MONTH_LONG_EN[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map(l => (
          <div key={l} className="text-center text-[10px] font-bold uppercase tracking-wide text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 py-1">
            {l}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const date    = new Date(viewYear, viewMonth, day);
          const isToday = sameDay(date, TODAY);
          const isPast  = date < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
          const isSel   = selected ? sameDay(date, selected) : false;

          return (
            <button
              key={`d-${day}`}
              disabled={isPast}
              onClick={() => onSelect(date)}
              className={`mx-auto w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-all
                ${isSel
                  ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] shadow-md"
                  : isToday
                    ? "border-2 border-[#46255f] dark:border-[#DFC8E7] text-[#46255f] dark:text-[#DFC8E7] font-bold"
                    : isPast
                      ? "text-[#2E1A47]/18 dark:text-[#DFC8E7]/18 cursor-not-allowed"
                      : "text-[#2E1A47] dark:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30"
                }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── BookModal ─────────────────────────────────────────────────────── */
function BookModal({
  doctor,
  isAr,
  onClose,
}: {
  doctor: typeof DOCTORS[0];
  isAr: boolean;
  onClose: () => void;
}) {
  const [step, setStep]                 = useState<"date" | "time">("date");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [booked, setBooked]             = useState(false);
  const d = isAr ? doctor.ar : doctor.en;

  function fmtDate(date: Date) {
    if (isAr) return `${date.getDate()} ${MONTH_AR[date.getMonth()]}`;
    return `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
  }

  if (booked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white dark:bg-[#1a1030] rounded-2xl p-8 max-w-sm w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
          <h3 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-2">
            {isAr ? "تم الحجز!" : "Appointment Booked!"}
          </h3>
          <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 mb-1">{d.name}</p>
          <p className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7]">
            {selectedDate ? fmtDate(selectedDate) : ""} · {selectedTime}
          </p>
          <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-1 mb-6">{d.hospital}</p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47]"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
          >
            {isAr ? "إغلاق" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1030] rounded-2xl max-w-md w-full border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#e7dcee] dark:border-[#2a1840]">
          <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black flex-shrink-0 bg-gradient-to-br ${doctor.grad} text-[#2E1A47]`}>
              {doctor.initials}
            </div>
            <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{d.name}</p>
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
            {[
              { key: "date", en: "Select Date", ar: "اختر التاريخ" },
              { key: "time", en: "Select Time", ar: "اختر الوقت" },
            ].map((s, i) => (
              <div key={s.key} className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
                {i > 0 && <div className="w-6 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />}
                <div className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                    step === s.key
                      ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]"
                      : step === "time" && s.key === "date"
                        ? "bg-emerald-500 text-white"
                        : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"
                  }`}>
                    {step === "time" && s.key === "date" ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs font-semibold ${
                    step === s.key ? "text-[#2E1A47] dark:text-[#DFC8E7]" : "text-[#2E1A47]/35 dark:text-[#DFC8E7]/35"
                  }`}>{isAr ? s.ar : s.en}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 1: Date ── */}
        {step === "date" && (
          <div className="px-6 py-5">
            <MiniCalendar
              isAr={isAr}
              selected={selectedDate}
              onSelect={setSelectedDate}
            />
            <button
              disabled={!selectedDate}
              onClick={() => setStep("time")}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
            >
              {selectedDate
                ? isAr ? `التالي — ${fmtDate(selectedDate)}` : `Next — ${fmtDate(selectedDate)}`
                : isAr ? "اختر تاريخاً" : "Select a date"}
            </button>
          </div>
        )}

        {/* ── Step 2: Time ── */}
        {step === "time" && (() => {
          const allSlots = doctor.slots as Slot[];
          const groups = [
            {
              key: "morning", en: "Morning 🌅", ar: "الصباح 🌅",
              slots: allSlots.filter(s => {
                const h = parseInt(s.t);
                return s.t.includes("AM") && h >= 8;
              }),
            },
            {
              key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️",
              slots: allSlots.filter(s => {
                const h = parseInt(s.t);
                return s.t.includes("PM") && (h === 12 || h <= 4);
              }),
            },
            {
              key: "evening", en: "Evening 🌙", ar: "المساء 🌙",
              slots: allSlots.filter(s => {
                const h = parseInt(s.t);
                return s.t.includes("PM") && h >= 5;
              }),
            },
          ].filter(g => g.slots.length > 0);

          return (
            <div className="px-6 py-5">
              <div className={`flex items-center justify-between mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
                <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                  {isAr ? "اختر وقتاً" : "Choose a time"}
                </p>
                <button
                  onClick={() => { setStep("date"); setSelectedTime(null); }}
                  className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline"
                >
                  ← {selectedDate ? fmtDate(selectedDate) : ""}
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto pr-1 space-y-5 mb-5"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
                {groups.map(group => (
                  <div key={group.key}>
                    <p className="text-[11px] font-bold text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">
                      {isAr ? group.ar : group.en}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {group.slots.map(slot => (
                        <button
                          key={slot.t}
                          disabled={slot.taken}
                          onClick={() => setSelectedTime(slot.t)}
                          className={`py-2 rounded-xl text-xs font-semibold border transition-all relative ${
                            slot.taken
                              ? "border-[#e7dcee] dark:border-[#2a1840] text-[#2E1A47]/20 dark:text-[#DFC8E7]/20 cursor-not-allowed bg-[#faf8fc] dark:bg-[#0d0820]"
                              : selectedTime === slot.t
                                ? "border-[#46255f] bg-[#46255f] text-white dark:border-[#DFC8E7] dark:bg-[#DFC8E7] dark:text-[#1a1030] shadow-sm"
                                : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#46255f]/50 dark:hover:border-[#DFC8E7]/50 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20"
                          }`}
                        >
                          {slot.t}
                          {slot.taken && (
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="w-full h-px bg-[#2E1A47]/15 dark:bg-[#DFC8E7]/15 rotate-[-8deg] block" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                disabled={!selectedTime}
                onClick={() => setBooked(true)}
                className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
              >
                {selectedTime
                  ? isAr ? `تأكيد — ${selectedTime}` : `Confirm — ${selectedTime}`
                  : isAr ? "اختر وقتاً" : "Select a time"}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ─── DoctorCard ─────────────────────────────────────────────────────── */
function DoctorCard({
  doctor,
  isAr,
  onBook,
}: {
  doctor: typeof DOCTORS[0];
  isAr: boolean;
  onBook: () => void;
}) {
  const d = isAr ? doctor.ar : doctor.en;
  return (
    <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className={`flex items-start gap-4 ${isAr ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black flex-shrink-0 bg-gradient-to-br ${doctor.grad} text-[#2E1A47]`}>
          {doctor.initials}
        </div>

        {/* Info */}
        <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
          <div className={`flex items-center gap-2 mb-0.5 ${isAr ? "flex-row-reverse" : ""}`}>
            <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{d.name}</p>
            {doctor.available
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex-shrink-0">
                  {isAr ? "متاح" : "Available"}
                </span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f9f4fa] dark:bg-[#241540] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 border border-[#e7dcee] dark:border-[#3a2560] flex-shrink-0">
                  {isAr ? "غير متاح" : "Unavailable"}
                </span>}
          </div>
          <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold mb-0.5">
            {isAr ? SPECIALTIES.find(s => s.en === doctor.specialty)?.ar : doctor.specialty}
          </p>
          <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">{d.hospital}</p>

          {/* Meta row */}
          <div className={`flex items-center gap-3 mt-2.5 flex-wrap ${isAr ? "flex-row-reverse" : ""}`}>
            <span className="flex items-center gap-1 text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
              <span className="text-amber-400">★</span> {doctor.rating}
              <span className="text-[#2E1A47]/30 dark:text-[#DFC8E7]/30">({doctor.reviews})</span>
            </span>
            <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
            <span className="text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">{d.type}</span>
            <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
            <span className="text-xs font-bold text-[#2E1A47] dark:text-[#DFC8E7]">
              {isAr ? `${doctor.fee} ر.ع.` : `OMR ${doctor.fee}`}
            </span>
          </div>
        </div>
      </div>

      {/* Book button */}
      <div className="mt-4">
        <button
          onClick={onBook}
          disabled={!doctor.available}
          className="w-full py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
        >
          {doctor.available
            ? isAr ? "احجز موعداً" : "Book Appointment"
            : isAr ? "غير متاح حالياً" : "Currently Unavailable"}
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function FindDoctorsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [search, setSearch]           = useState("");
  const [activeSpec, setActiveSpec]   = useState("All");
  const [booking, setBooking]         = useState<typeof DOCTORS[0] | null>(null);

  const filtered = DOCTORS.filter(doc => {
    const matchSpec = activeSpec === "All" || doc.specialty === activeSpec;
    const q = search.toLowerCase();
    const matchSearch = !q
      || doc.en.name.toLowerCase().includes(q)
      || doc.ar.name.includes(q)
      || doc.specialty.toLowerCase().includes(q)
      || doc.en.hospital.toLowerCase().includes(q);
    return matchSpec && matchSearch;
  });

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* ── Hero ── */}
      <section className="py-12 px-6"
        style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "ابحث عن طبيب" : "Find a Doctor"}
          </p>
          <h1 className="font-black font-serif text-white mb-6" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
            {ar
              ? <><span className="block">ابحث عن الطبيب</span><span className="block italic text-[#DFC8E7]">المناسب لك.</span></>
              : <><span className="block">Find the right doctor</span><span className="block italic text-[#DFC8E7]">for you.</span></>}
          </h1>

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-white dark:bg-[#1a1030] rounded-2xl px-4 py-3 border border-white/10 shadow-lg max-w-2xl">
            <svg className="w-5 h-5 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ar ? "اسم الطبيب، التخصص، المستشفى..." : "Doctor name, specialty, hospital..."}
              className="flex-1 text-sm outline-none text-[#2E1A47] dark:text-[#DFC8E7] placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30 bg-transparent"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Specialty filters ── */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 overflow-x-auto">
        <div className="max-w-4xl mx-auto flex gap-2 flex-nowrap">
          {SPECIALTIES.map(s => (
            <button
              key={s.en}
              onClick={() => setActiveSpec(s.en)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 border transition-all ${
                activeSpec === s.en
                  ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent"
                  : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"
              }`}
            >
              {ar ? s.ar : s.en}
            </button>
          ))}
        </div>
      </section>

      {/* ── Results ── */}
      <section className="py-10 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-6">
            {ar
              ? `${filtered.length} طبيب متاح`
              : `${filtered.length} doctor${filtered.length !== 1 ? "s" : ""} found`}
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">🔍</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">
                {ar ? "لا توجد نتائج" : "No doctors found"}
              </p>
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">
                {ar ? "جرّب البحث بكلمة مختلفة." : "Try a different search term or specialty."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(doc => (
                <DoctorCard
                  key={doc.initials}
                  doctor={doc}
                  isAr={ar}
                  onBook={() => doc.available && setBooking(doc)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Booking modal ── */}
      {booking && (
        <BookModal
          doctor={booking}
          isAr={ar}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}
