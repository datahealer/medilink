"use client";

import { useEffect, useMemo, useState } from "react";
import { api, i18n, BOOKING_WINDOW_DAYS, omanTodayParts } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { backendJson } from "@/lib/backendFetch";

/* ─── Shared doctor booking flow — used by Find Doctors, doctor profile, and Symptom Checker ──
 * Single implementation. Wired to the real backend:
 *   1. api.appointments.getAvailableSlots  → real time slots
 *   2. api.appointments.bookAppointment    → creates the appointment (pending)
 *   3. POST {BACKEND_URL}/api/payments/checkout → Thawani hosted checkout URL
 *   → redirect to Thawani → webhook marks payment paid + appointment confirmed → /payment-success
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export type Slot = { t: string; taken: boolean; start: string };

/* ─── Unified doctor view model (real Supabase doctors) ── */
export type ViewDoctor = {
  id: string;
  facilityId?: string | null; // optional — the modal resolves it from the doctor if absent
  initials: string;
  grad: string;
  specialty: string;
  bio: string;
  fee: number; // resolved from doctors.fees.in_person (object schema)
  rating: number;
  reviews: number;
  available: boolean;
  name: string;
  hospital: string;
  type: string;
  education: string;
  experience: string;
  languages: string;
  location: string;
};

/* ─── helpers ────────────────────────────────────────────────────────── */
const DAY_NAMES_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES_AR = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];
const MONTH_LONG_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_LONG_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTH_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/**
 * "Today" in OMAN, expressed as a local-midnight Date so the rest of this calendar
 * (which builds cells with `new Date(y, m, d)` and keys them with `toYMD`) keeps
 * working unchanged while being anchored to the Oman calendar rather than the
 * browser's. Previously this was `new Date()`, so a browser in another timezone —
 * or any browser between 00:00 and 04:00 Oman time — gated past dates and generated
 * slot keys for the wrong day. Same shared helper mobile's DayGrid uses; the
 * database (`oman_today()`) remains authoritative.
 */
const OMAN_TODAY = omanTodayParts();
const TODAY = new Date(OMAN_TODAY.year, OMAN_TODAY.monthIndex, OMAN_TODAY.dayOfMonth);

/**
 * BP-2 — the last bookable day: today + (BOOKING_WINDOW_DAYS - 1), inclusive.
 * `get_available_slots` clamps to this same window server-side and returns nothing
 * outside it, so an unclamped calendar let the user pick a date that could only ever
 * render "No available times". Same single source of truth mobile's DayGrid uses.
 */
const LAST_BOOKABLE = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + BOOKING_WINDOW_DAYS - 1);

function toYMD(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
/** "08:30" → "8:30 AM" (matches the modal's AM/PM grouping). */
function to12h(hhmm: string) {
  const parts = hhmm.split(":");
  const m = parts[1] ?? "00";
  let h = parseInt(parts[0] ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

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
  const atMax = viewYear === LAST_BOOKABLE.getFullYear() && viewMonth === LAST_BOOKABLE.getMonth();

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
        <button onClick={nextMonth} disabled={atMax}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {(isAr ? DAY_NAMES_AR : DAY_NAMES_EN).map(l => (
          <div key={l} className="text-center text-[10px] font-bold  tracking-wide text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const date = new Date(viewYear, viewMonth, day);
          const isToday = sameDay(date, TODAY);
          const isPast  = date < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
          // Beyond the booking window the backend returns no slots — don't offer the day.
          const isBeyond = date > LAST_BOOKABLE;
          const isOff   = isPast || isBeyond;
          const isSel   = selected ? sameDay(date, selected) : false;
          return (
            <button key={`d-${day}`} disabled={isOff} onClick={() => onSelect(date)}
              className={`mx-auto w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center transition-all ${
                isSel ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] shadow-md"
                  : isToday ? "border-2 border-[#46255f] dark:border-[#DFC8E7] text-[#46255f] dark:text-[#DFC8E7] font-bold"
                  : isOff   ? "text-[#2E1A47]/18 dark:text-[#DFC8E7]/18 cursor-not-allowed"
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

type FamilyChip = { id: string; name: string; initials: string; relation: string };

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
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [step, setStep]                 = useState<"date" | "time" | "payment">("date");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [payMethod, setPayMethod]       = useState<string | null>(null);
  const [booked, setBooked]             = useState(false);
  const [patient, setPatient]           = useState<string>("self");

  const [family, setFamily]             = useState<FamilyChip[]>([]);
  const [slots, setSlots]               = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");

  const d = { name: doctor.name, hospital: doctor.hospital };
  const selectedTime = selectedSlot?.t ?? null;

  // Localize the family_relation enum via the shared catalog; fall back to raw.
  const relLabel = (rel: string) => {
    const key = `familyRelation.${rel}` as Parameters<typeof i18n.translate>[1];
    const label = i18n.translate(isAr ? "ar" : "en", key);
    return label === key ? rel : label;
  };

  // Real family members (replaces the old demo list) for the "Booking for" chips.
  useEffect(() => {
    let active = true;
    api.family.listFamily(supabase)
      .then((rows) => {
        if (!active) return;
        setFamily(rows.map((m) => ({
          id: m.id,
          name: m.full_name,
          relation: m.relation,
          initials: m.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "FM",
        })));
      })
      .catch(() => { if (active) setFamily([]); });
    return () => { active = false; };
  }, [supabase]);

  const patientLabel = patient === "self"
    ? (isAr ? "أنا" : "Myself")
    : family.find((m) => m.id === patient)?.name ?? patient;

  // Real availability for the picked date (already excludes taken slots).
  useEffect(() => {
    if (!selectedDate) return;
    let active = true;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setError("");
    api.appointments
      .getAvailableSlots(supabase, { doctorId: doctor.id, date: toYMD(selectedDate) })
      .then((avail) => {
        if (!active) return;
        setSlots(
          avail
            .map((s) => (typeof s.start === "string" ? s.start.slice(0, 5) : ""))
            .filter(Boolean)
            .map((hhmm) => ({ t: to12h(hhmm), taken: false, start: hhmm }))
        );
      })
      .catch(() => { if (active) setError(isAr ? "تعذر تحميل المواعيد." : "Could not load available times."); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [selectedDate, supabase, doctor.id, isAr]);

  function fmtDate(date: Date) {
    return isAr ? `${date.getDate()} ${MONTH_AR[date.getMonth()]}` : `${MONTH_EN[date.getMonth()]} ${date.getDate()}`;
  }

  /* Create appointment → (Thawani) redirect to hosted checkout; (card/cash) book as pending. */
  async function handlePay() {
    if (!selectedDate || !selectedSlot || !payMethod || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      // The appointment needs a facility; resolve it from the doctor if not supplied.
      let facilityId = doctor.facilityId ?? null;
      if (!facilityId) {
        const { data } = await supabase.from("doctors").select("facility_id").eq("id", doctor.id).maybeSingle();
        facilityId = (data?.facility_id as string | null) ?? null;
      }
      if (!facilityId) {
        setError(isAr ? "لا يمكن الحجز لهذا الطبيب حالياً." : "Booking is unavailable for this doctor.");
        setSubmitting(false);
        return;
      }

      const res = (await api.appointments.bookAppointment(supabase, {
        doctorId: doctor.id,
        facilityId,
        slotDate: toYMD(selectedDate),
        slotStart: selectedSlot.start,
        type: "in_person",
        forFamilyMemberId: patient === "self" ? undefined : patient,
      })) as { success?: boolean; appointment_id?: string; error?: string };

      if (!res?.success || !res.appointment_id) {
        const code = res?.error;
        setError(
          code === "SLOT_ALREADY_BOOKED"
            ? (isAr ? "هذا الموعد محجوز بالفعل." : "That time slot was just taken. Pick another.")
            : (isAr ? "تعذر تأكيد الحجز." : "Could not confirm the booking.")
        );
        setSubmitting(false);
        return;
      }

      // Only Thawani initiates the hosted checkout; card/cash book as pending (no online gateway).
      if (payMethod === "thawani") {
        // `backendFetch` attaches the caller's Supabase access token. Cookies alone cannot
        // authenticate here: the backend is a separate origin, so the host-only Supabase
        // cookies never reach it and this POST returned 401 with a perfectly healthy
        // preflight. See lib/backendFetch.ts.
        const { res: r, data: j } = await backendJson<{ checkoutUrl?: string }>(
          "/api/payments/checkout",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // BP-4: the amount is derived server-side from the doctor's fee + VAT.
            // The client no longer sends it (previously sent fee without VAT).
            body: JSON.stringify({ appointment_id: res.appointment_id }),
          }
        );
        if (r.ok && j?.checkoutUrl) {
          window.location.href = j.checkoutUrl; // → Thawani → webhook confirms → /payment-success
          return;
        }
        setError(isAr ? "تعذر بدء الدفع. حاول مرة أخرى." : "Could not start payment. Please try again.");
        setSubmitting(false);
        return;
      }

      // card / cash: appointment created (pending); no online payment.
      setBooked(true);
      setSubmitting(false);
    } catch {
      setError(isAr ? "تعذر تأكيد الحجز." : "Could not confirm the booking.");
      setSubmitting(false);
    }
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
          <div className="bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl px-4 py-3 mb-5 text-left border border-[#e7dcee] dark:border-[#2a1840]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">{isAr ? "طريقة الدفع" : "Payment"}</span>
              <span className="text-xs font-bold text-[#46255f] dark:text-[#DFC8E7]">
                {payMethod === "thawani" ? "💳 Thawani Pay" : payMethod === "card" ? "🏦 Card" : "🏥 " + (isAr ? "عند الوصول" : "At Clinic")}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] font-black  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">{isAr ? "الرسوم" : "Fee"}</span>
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

  const slotGroups = [
    { key: "morning",   en: "Morning 🌅",   ar: "الصباح 🌅",   slots: slots.filter(s => s.t.includes("AM")) },
    { key: "afternoon", en: "Afternoon ☀️", ar: "الظهيرة ☀️",  slots: slots.filter(s => s.t.includes("PM") && parseInt(s.t) <= 4) },
    { key: "evening",   en: "Evening 🌙",   ar: "المساء 🌙",    slots: slots.filter(s => s.t.includes("PM") && parseInt(s.t) >= 5) },
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
              <p className={`text-[10px] font-black  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mb-2.5 ${isAr ? "text-right" : ""}`}>
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

                {/* Family member chips (real family_members) */}
                {family.map(m => (
                  <button key={m.id} onClick={() => setPatient(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isAr ? "flex-row-reverse" : ""} ${
                      patient === m.id
                        ? "border-[#46255f] dark:border-[#DFC8E7] text-[#2E1A47] dark:text-[#1a1030]"
                        : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:border-[#46255f]/40 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20"
                    }`}
                    style={patient === m.id ? { background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" } : {}}>
                    <div className="w-5 h-5 rounded-full bg-[#e8d5f0] dark:bg-[#2E1A47]/40 flex items-center justify-center text-[9px] font-black text-[#2E1A47] dark:text-[#DFC8E7] flex-shrink-0">
                      {m.initials}
                    </div>
                    <span>{m.name.split(" ")[0]}</span>
                    <span className="opacity-50 font-normal">· {relLabel(m.relation)}</span>
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
              <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "اختر وقتاً" : "Choose a time"}
              </p>
              <button onClick={() => { setStep("date"); setSelectedSlot(null); }}
                className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                {isAr ? "→" : "←"} {selectedDate ? fmtDate(selectedDate) : ""}
              </button>
            </div>
            {slotsLoading ? (
              <div className="py-10 text-center text-sm font-semibold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 animate-pulse">
                {isAr ? "جارٍ تحميل المواعيد…" : "Loading times…"}
              </div>
            ) : slotGroups.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-3xl mb-2">🗓️</p>
                <p className="text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
                  {isAr ? "لا توجد مواعيد متاحة في هذا اليوم." : "No available times on this day."}
                </p>
              </div>
            ) : (
            <div className="max-h-72 overflow-y-auto pr-1 space-y-5 mb-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e7dcee transparent" }}>
              {slotGroups.map(group => (
                <div key={group.key}>
                  <p className="text-[11px] font-bold text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-2">{isAr ? group.ar : group.en}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {group.slots.map(slot => (
                      <button key={slot.start} disabled={slot.taken} onClick={() => setSelectedSlot(slot)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all relative ${
                          slot.taken
                            ? "border-[#e7dcee] dark:border-[#2a1840] text-[#2E1A47]/20 dark:text-[#DFC8E7]/20 cursor-not-allowed bg-[#faf8fc] dark:bg-[#0d0820]"
                            : selectedSlot?.start === slot.start
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
              <p className="mb-3 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{error}</p>
            )}
            <button disabled={!selectedSlot} onClick={() => setStep("payment")}
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
              <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "طريقة الدفع" : "Payment Method"}
              </p>
              <button onClick={() => setStep("time")} className="text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:underline">
                {isAr ? "→" : "←"} {selectedTime}
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
            {error && (
              <p className="mb-3 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{error}</p>
            )}
            <button disabled={!payMethod || submitting} onClick={handlePay}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
              {submitting
                ? isAr ? "جارٍ المعالجة…" : "Processing…"
                : payMethod === "cash"
                  ? isAr ? "تأكيد الحجز" : "Confirm Booking"
                  : isAr ? `ادفع ${doctor.fee} ر.ع.` : `Pay OMR ${doctor.fee}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
