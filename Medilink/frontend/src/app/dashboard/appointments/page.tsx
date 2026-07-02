"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Types ─────────────────────────────────────────────────────────── */
type ApptStatus = "Confirmed" | "Pending" | "Completed" | "Cancelled";
type Appt = {
  id: string; initials: string; grad: string; status: ApptStatus;
  doctorId: string | null; facilityId: string | null; rawDate: string;
  en: { name: string; spec: string; hospital: string; date: string; time: string; type: string; notes?: string };
  ar: { name: string; spec: string; hospital: string; date: string; time: string; type: string; notes?: string };
};

/* ─── Row → view-model mapping ───────────────────────────────────────── */
// Explicit shape of the fields we read. `listMyAppointments` uses a nested select
// whose generated type degrades to an error union, so we cast to this instead.
type ApptRow = {
  id: string;
  status: string;
  type: string;
  slot_date: string;
  slot_start: string | null;
  notes: string | null;
  doctor_id: string | null;
  facility_id: string | null;
  doctor?: { id?: string; full_name?: string; specialty?: string } | null;
  facility?: { id?: string; name?: string } | null;
};

const GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]",
  "from-[#d1fae5] to-[#d5e8f5]", "from-[#fde68a] to-[#e8d5f0]", "from-[#e8d5f0] to-[#d1fae5]",
];

const STATUS_MAP: Record<string, ApptStatus> = {
  pending: "Pending", confirmed: "Confirmed", checked_in: "Confirmed", approved: "Confirmed",
  completed: "Completed", cancelled: "Cancelled", no_show: "Cancelled",
};
const TYPE_EN: Record<string, string> = { in_person: "In-clinic", online: "Video call", walk_in: "Walk-in" };
const TYPE_AR: Record<string, string> = { in_person: "في العيادة", online: "مكالمة فيديو", walk_in: "زيارة" };

function apptInitials(name: string) {
  const w = name.split(/\s+/).filter((x) => x && !/^dr\.?$/i.test(x));
  return w.slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("") || "DR";
}
function to12hClock(hhmmss: string) {
  const parts = hhmmss.split(":");
  const m = parts[1] ?? "00";
  let h = parseInt(parts[0] ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
function relDate(ymd: string, isAr: boolean) {
  const d = new Date(`${ymd}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return isAr ? "اليوم" : "Today";
  if (diff === 1) return isAr ? "غداً" : "Tomorrow";
  return isAr ? `${d.getDate()} ${MONTH_AR[d.getMonth()]}` : `${MONTH_EN[d.getMonth()]} ${d.getDate()}`;
}
function toAppt(row: ApptRow, i: number): Appt {
  const doctor = (row as { doctor?: { id?: string; full_name?: string; specialty?: string } | null }).doctor;
  const facility = (row as { facility?: { id?: string; name?: string } | null }).facility;
  const name = doctor?.full_name ?? "—";
  const hospital = facility?.name ?? "";
  const spec = doctor?.specialty ?? "";
  const time = row.slot_start ? to12hClock(row.slot_start) : "";
  const notes = row.notes ?? undefined;
  return {
    id: row.id,
    initials: apptInitials(name),
    grad: GRADS[i % GRADS.length]!,
    status: STATUS_MAP[row.status] ?? "Pending",
    doctorId: row.doctor_id ?? null,
    facilityId: row.facility_id ?? null,
    rawDate: row.slot_date,
    en: { name, spec, hospital, date: relDate(row.slot_date, false), time, type: TYPE_EN[row.type] ?? row.type, notes },
    ar: { name, spec, hospital, date: relDate(row.slot_date, true), time, type: TYPE_AR[row.type] ?? row.type, notes },
  };
}

const TABS = [
  { en: "All", ar: "الكل" }, { en: "Upcoming", ar: "القادمة" },
  { en: "Completed", ar: "المكتملة" }, { en: "Cancelled", ar: "الملغاة" },
];

const STATUS_STYLE: Record<ApptStatus, string> = {
  Confirmed: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40",
  Pending:   "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40",
  Completed: "bg-[#f0e8f8] dark:bg-[#2E1A47]/30 text-[#46255f] dark:text-[#DFC8E7]/70 border-[#e7dcee] dark:border-[#3a2560]",
  Cancelled: "bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800/40",
};
const STATUS_AR: Record<ApptStatus, string> = {
  Confirmed: "مؤكد", Pending: "معلق", Completed: "مكتمل", Cancelled: "ملغى",
};

/* ─── Calendar helpers ───────────────────────────────────────────────── */
const MONTH_EN      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_AR      = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTH_LONG_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_LONG_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAY_EN        = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const DAY_AR        = ["أح","اث","ثل","أر","خم","جم","سب"];
const TODAY         = new Date();

function toYMD(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
/** Fallback +30min end when an availability template slot omits `end`. */
function plus30(hhmm: string) {
  const parts = hhmm.split(":");
  const total = (parseInt(parts[0] ?? "0", 10)) * 60 + parseInt(parts[1] ?? "0", 10) + 30;
  const h = Math.floor(total / 60) % 24, m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
function fmtDate(d: Date, isAr: boolean) {
  return isAr ? `${d.getDate()} ${MONTH_AR[d.getMonth()]}` : `${MONTH_EN[d.getMonth()]} ${d.getDate()}`;
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
          const date    = new Date(vy, vm, day);
          const isToday = sameDay(date, TODAY);
          const isPast  = date < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
          const isSel   = selected ? sameDay(date, selected) : false;
          return (
            <button key={`d-${day}`} disabled={isPast} onClick={() => onSelect(date)}
              className={`mx-auto w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-all
                ${isSel    ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] shadow-md"
                : isToday  ? "border-2 border-[#46255f] dark:border-[#DFC8E7] text-[#46255f] dark:text-[#DFC8E7] font-bold"
                : isPast   ? "text-[#2E1A47]/18 dark:text-[#DFC8E7]/18 cursor-not-allowed"
                : "text-[#2E1A47] dark:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30"}`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── RescheduleModal ────────────────────────────────────────────────── */
type RSlot = { t: string; start: string; end: string };

function RescheduleModal({
  appt, isAr, onClose, onDone,
}: {
  appt: Appt; isAr: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [step, setStep]     = useState<"date" | "time">("date");
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selSlot, setSelSlot] = useState<RSlot | null>(null);
  const [slots, setSlots]   = useState<RSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState("");
  const [done, setDone]     = useState(false);
  const info = isAr ? appt.ar : appt.en;

  // Real availability for the picked date (already excludes taken slots).
  useEffect(() => {
    if (!selDate || !appt.doctorId) return;
    let active = true;
    setSlotsLoading(true);
    setError("");
    api.appointments
      .getAvailableSlots(supabase, { doctorId: appt.doctorId, date: toYMD(selDate) })
      .then((avail) => {
        if (!active) return;
        setSlots(
          avail
            .filter((s): s is typeof s & { start: string } => typeof s.start === "string")
            .map((s) => {
              const start = s.start.slice(0, 5);
              const end = typeof s.end === "string" ? s.end.slice(0, 5) : plus30(start);
              return { t: to12hClock(start), start, end };
            })
        );
      })
      .catch(() => { if (active) setError(isAr ? "تعذر تحميل المواعيد." : "Could not load available times."); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [selDate, supabase, appt.doctorId, isAr]);

  const SLOT_GROUPS = [
    { key: "morning",   en: "Morning 🌅",   ar: "الصباح 🌅",   slots: slots.filter(s => s.t.includes("AM")) },
    { key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️", slots: slots.filter(s => { const h = parseInt(s.t); return s.t.includes("PM") && (h === 12 || h <= 4); }) },
    { key: "evening",   en: "Evening 🌙",   ar: "المساء 🌙",   slots: slots.filter(s => { const h = parseInt(s.t); return s.t.includes("PM") && h >= 5; }) },
  ].filter(g => g.slots.length > 0);

  async function confirm() {
    if (!selDate || !selSlot) return;
    setSubmitting(true);
    setError("");
    try {
      await api.appointments.rescheduleAppointment(supabase, appt.id, {
        date: toYMD(selDate), start: selSlot.start, end: selSlot.end,
      });
      setDone(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : (isAr ? "تعذر إعادة الجدولة." : "Could not reschedule."));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a1030] rounded-2xl p-8 max-w-sm w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
        <h3 className="font-black font-serif text-xl text-[#2E1A47] dark:text-[#DFC8E7] mb-2">
          {isAr ? "تم إعادة الجدولة!" : "Appointment Rescheduled!"}
        </h3>
        <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 mb-1">{info.name}</p>
        <p className="text-sm font-bold text-[#46255f] dark:text-[#DFC8E7]">
          {selDate ? fmtDate(selDate, isAr) : ""} · {selSlot?.t}
        </p>
        <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-1 mb-6">{info.hospital}</p>
        <button onClick={onClose}
          className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47]"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
          {isAr ? "إغلاق" : "Done"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-[#1a1030] rounded-2xl max-w-md w-full border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#e7dcee] dark:border-[#2a1840]">
          <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${appt.grad} text-[#2E1A47]`}>
              {appt.initials}
            </div>
            <div className={`flex-1 min-w-0 ${isAr ? "text-right" : ""}`}>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{info.name}</p>
              <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 truncate">{info.hospital}</p>
            </div>
            <button onClick={onClose} className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className={`flex items-center gap-2 mt-4 ${isAr ? "flex-row-reverse" : ""}`}>
            {[{ k: "date", en: "New Date", ar: "تاريخ جديد" }, { k: "time", en: "New Time", ar: "وقت جديد" }].map((s, i) => (
              <div key={s.k} className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
                {i > 0 && <div className="w-6 h-px bg-[#e7dcee] dark:bg-[#3a2560]" />}
                <div className={`flex items-center gap-1.5 ${isAr ? "flex-row-reverse" : ""}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                    step === s.k ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]"
                    : step === "time" && s.k === "date" ? "bg-emerald-500 text-white"
                    : "bg-[#e7dcee] dark:bg-[#3a2560] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40"}`}>
                    {step === "time" && s.k === "date" ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs font-semibold ${step === s.k ? "text-[#2E1A47] dark:text-[#DFC8E7]" : "text-[#2E1A47]/35 dark:text-[#DFC8E7]/35"}`}>
                    {isAr ? s.ar : s.en}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Current appointment notice */}
          <div className={`mt-3 text-[11px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 ${isAr ? "text-right" : ""}`}>
            {isAr ? `الموعد الحالي: ${info.date} · ${info.time}` : `Current: ${info.date} · ${info.time}`}
          </div>
        </div>

        {/* Step 1 — Date */}
        {step === "date" && (
          <div className="px-6 py-5">
            <MiniCalendar isAr={isAr} selected={selDate} onSelect={setSelDate} />
            <button disabled={!selDate} onClick={() => setStep("time")}
              className="w-full mt-5 py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {selDate
                ? isAr ? `التالي — ${fmtDate(selDate, isAr)}` : `Next — ${fmtDate(selDate, isAr)}`
                : isAr ? "اختر تاريخاً" : "Select a date"}
            </button>
          </div>
        )}

        {/* Step 2 — Time */}
        {step === "time" && (
          <div className="px-6 py-5">
            <div className={`flex items-center justify-between mb-4 ${isAr ? "flex-row-reverse" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "اختر وقتاً جديداً" : "Choose a new time"}
              </p>
              <button onClick={() => { setStep("date"); setSelSlot(null); }}
                className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                ← {selDate ? fmtDate(selDate, isAr) : ""}
              </button>
            </div>

            {slotsLoading ? (
              <div className="py-10 text-center text-sm font-semibold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 animate-pulse">
                {isAr ? "جارٍ تحميل المواعيد…" : "Loading times…"}
              </div>
            ) : SLOT_GROUPS.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-3xl mb-2">🗓️</p>
                <p className="text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
                  {isAr ? "لا توجد مواعيد متاحة في هذا اليوم." : "No available times on this day."}
                </p>
              </div>
            ) : (
            <div className="max-h-72 overflow-y-auto pr-1 space-y-5 mb-5"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
              {SLOT_GROUPS.map(group => (
                <div key={group.key}>
                  <p className="text-[11px] font-bold text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">
                    {isAr ? group.ar : group.en}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {group.slots.map(slot => (
                      <button key={slot.start} onClick={() => setSelSlot(slot)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all relative ${
                          selSlot?.start === slot.start
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
            )}

            {error && (
              <p className="mb-3 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button disabled={!selSlot || submitting} onClick={confirm}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {submitting
                ? isAr ? "جارٍ التأكيد…" : "Confirming…"
                : selSlot
                  ? isAr ? `تأكيد إعادة الجدولة — ${selSlot.t}` : `Confirm Reschedule — ${selSlot.t}`
                  : isAr ? "اختر وقتاً" : "Select a time"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function AppointmentsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [tab, setTab]           = useState("All");
  const [expanded, setExp]      = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Appt | null>(null);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [busyId, setBusyId]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return api.appointments
      .listMyAppointments(supabase, "all")
      .then((rows) => { setAppointments(rows.map((r, i) => toAppt(r as unknown as ApptRow, i))); setError(""); })
      .catch(() => setError(ar ? "تعذر تحميل المواعيد." : "Could not load appointments."))
      .finally(() => setLoading(false));
  }, [supabase, ar]);

  useEffect(() => { void load(); }, [load]);

  async function cancelAppt(id: string) {
    setBusyId(id);
    setError("");
    try {
      await api.appointments.cancelAppointment(supabase, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر إلغاء الموعد." : "Could not cancel the appointment."));
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    upcoming:  appointments.filter(a => a.status === "Confirmed" || a.status === "Pending").length,
    completed: appointments.filter(a => a.status === "Completed").length,
    cancelled: appointments.filter(a => a.status === "Cancelled").length,
  };

  const filtered = appointments.filter(a => {
    if (tab === "Upcoming")  return a.status === "Confirmed" || a.status === "Pending";
    if (tab === "Completed") return a.status === "Completed";
    if (tab === "Cancelled") return a.status === "Cancelled";
    return true;
  });

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Hero */}
      <section className="py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "مواعيدي" : "My Appointments"}
          </p>
          <h1 className="font-black font-serif text-white mb-5" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", lineHeight: 1.1 }}>
            {ar
              ? <><span className="block">كل مواعيدك</span><span className="block italic text-[#DFC8E7]">في مكان واحد.</span></>
              : <><span className="block">All your appointments</span><span className="block italic text-[#DFC8E7]">in one place.</span></>}
          </h1>
          <div className={`flex gap-3 flex-wrap ${ar ? "flex-row-reverse" : ""}`}>
            {[
              { n: counts.upcoming,  en: "Upcoming",  ar: "قادمة",  color: "text-emerald-400" },
              { n: counts.completed, en: "Completed", ar: "مكتملة", color: "text-[#DFC8E7]"  },
              { n: counts.cancelled, en: "Cancelled", ar: "ملغاة",  color: "text-red-400"    },
            ].map(s => (
              <div key={s.en} className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(223,200,231,0.15)" }}>
                <span className={`text-xl font-black ${s.color}`}>{s.n}</span>
                <span className="text-xs font-medium" style={{ color: "rgba(223,200,231,0.55)" }}>{ar ? s.ar : s.en}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          {TABS.map(t => (
            <button key={t.en} onClick={() => setTab(t.en)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${tab === t.en ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] border-transparent" : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30"}`}>
              {ar ? t.ar : t.en}
            </button>
          ))}
        </div>
      </section>

      {/* List */}
      <section className="py-8 px-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {loading ? (
            [0, 1, 2].map(i => (
              <div key={i} className="h-20 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/50 dark:bg-[#1a1030]/50 animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">📅</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد مواعيد" : "No appointments here"}</p>
            </div>
          ) : filtered.map(appt => {
            const d        = ar ? appt.ar : appt.en;
            const status   = appt.status;
            const isUpcoming = status === "Confirmed" || status === "Pending";
            const isOpen   = expanded === appt.id;
            const dispDate = d.date;
            const dispTime = d.time;

            return (
              <div key={appt.id}
                className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden transition-all duration-200 hover:shadow-md">

                <button className={`w-full flex items-center gap-4 p-5 ${ar ? "flex-row-reverse" : ""}`}
                  onClick={() => setExp(isOpen ? null : appt.id)}>
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${appt.grad} text-[#2E1A47]`}>
                    {appt.initials}
                  </div>
                  <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                    <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{d.name}</p>
                    <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 mt-0.5">{d.spec} · {d.hospital}</p>
                  </div>
                  <div className={`hidden sm:flex flex-col flex-shrink-0 ${ar ? "items-start" : "items-end"}`}>
                    <p className="text-xs font-bold text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">{dispDate}</p>
                    <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-0.5">{dispTime}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border flex-shrink-0 ${STATUS_STYLE[status]}`}>
                    {ar ? STATUS_AR[status] : status}
                  </span>
                  <svg className={`w-4 h-4 text-[#2E1A47]/25 dark:text-[#DFC8E7]/25 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""} ${ar ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-[#e7dcee] dark:border-[#2a1840] px-5 pb-5 pt-4">
                    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 ${ar ? "text-right" : ""}`}>
                      {[
                        { l: ar ? "النوع"    : "Type",  v: d.type    },
                        { l: ar ? "التاريخ" : "Date",  v: dispDate  },
                        { l: ar ? "الوقت"   : "Time",  v: dispTime  },
                      ].map(row => (
                        <div key={row.l}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-1">{row.l}</p>
                          <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{row.v}</p>
                        </div>
                      ))}
                    </div>
                    {d.notes && (
                      <div className={`bg-[#f9f4fa] dark:bg-[#0d0820] rounded-xl px-4 py-3 mb-4 ${ar ? "text-right" : ""}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-1">{ar ? "ملاحظات" : "Notes"}</p>
                        <p className="text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">{d.notes}</p>
                      </div>
                    )}
                    {isUpcoming && (
                      <div className={`flex gap-2 ${ar ? "flex-row-reverse" : ""}`}>
                        <button
                          onClick={() => setRescheduling(appt)}
                          className="flex-1 py-2 rounded-xl text-sm font-bold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#46255f]/50 hover:text-[#46255f] dark:hover:text-[#DFC8E7] transition-all">
                          {ar ? "إعادة جدولة" : "Reschedule"}
                        </button>
                        <button
                          onClick={() => cancelAppt(appt.id)}
                          disabled={busyId === appt.id}
                          className="flex-1 py-2 rounded-xl text-sm font-bold border border-red-200 dark:border-red-800/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-all">
                          {busyId === appt.id ? (ar ? "جارٍ الإلغاء…" : "Cancelling…") : (ar ? "إلغاء الموعد" : "Cancel Appointment")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Reschedule modal */}
      {rescheduling && (
        <RescheduleModal
          appt={rescheduling}
          isAr={ar}
          onClose={() => setRescheduling(null)}
          onDone={() => { void load(); }}
        />
      )}
    </div>
  );
}
