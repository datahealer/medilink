"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Json } from "@medilink/shared";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { specialtyLabel, matchesSpecialtyCategory } from "@/lib/specialties";

// Nearby-clinics map (leaflet). Self-contained — fetches its own nearby
// facilities via Supabase. Loaded client-only (leaflet needs `window`).
const NearbyDoctorsMap = dynamic(() => import("@/components/dashboard/NearbyDoctorsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center bg-white dark:bg-[#1a1030]">
      <div className="w-6 h-6 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
    </div>
  ),
});

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

// View-model the card renders. Built from real `doctors` rows — the DB has no
// Arabic names / consult-mode, so ar mirrors en and type defaults to in-clinic.
type Doctor = {
  id: string;
  initials: string;
  grad: string;
  specialty: string;
  fee: number;
  rating: number;
  reviews: number;
  available: boolean;
  en: { name: string; hospital: string; type: string };
  ar: { name: string; hospital: string; type: string };
};

// Avatar gradients cycle per card.
const GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]",
  "from-[#d1fae5] to-[#d5e8f5]", "from-[#fde68a] to-[#e8d5f0]", "from-[#e8d5f0] to-[#d1fae5]",
];

function initialsOf(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !/^dr\.?$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "DR";
}

/** `doctors.fees` is the standard object `{ in_person, online }`. Show in-clinic fee. */
function feeOf(fees: Json | null): number {
  if (fees && typeof fees === "object" && !Array.isArray(fees)) {
    const o = fees as { in_person?: number; online?: number };
    if (typeof o.in_person === "number") return o.in_person;
    if (typeof o.online === "number") return o.online;
  }
  return 0;
}

type DoctorRow = Awaited<ReturnType<typeof api.doctors.searchDoctors>>[number];

function toDoctor(row: DoctorRow, i: number): Doctor {
  const facility = (row as { facilities?: { name?: string } | null }).facilities;
  const hospital = facility?.name ?? "";
  const type = "In-clinic";
  return {
    id: row.id,
    initials: initialsOf(row.full_name),
    grad: GRADS[i % GRADS.length]!,
    specialty: row.specialty ?? "",
    fee: feeOf(row.fees),
    rating: row.avg_rating ?? 0,
    reviews: row.review_count ?? 0,
    // Resolved separately from real bookable slots (doctor_availability) — see computeAvailableTodayIds.
    // `doctors.status` is a live 15-min presence flag with no writer anywhere in the app; it can't drive this.
    available: false,
    en: { name: row.full_name, hospital, type },
    ar: { name: row.full_name, hospital, type: "في العيادة" },
  };
}

function toYMD(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Doctors with at least one open (unbooked) slot today, from their weekly availability template. */
async function computeAvailableTodayIds(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  doctorIds: string[]
): Promise<Set<string>> {
  if (doctorIds.length === 0) return new Set();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const today = toYMD(now);

  const [{ data: availRows }, { data: bookedRows }] = await Promise.all([
    supabase.from("doctor_availability").select("doctor_id, slots").eq("day_of_week", dayOfWeek).in("doctor_id", doctorIds),
    supabase.from("appointments").select("doctor_id, slot_start")
      .eq("slot_date", today).in("doctor_id", doctorIds)
      .in("status", ["pending", "confirmed", "checked_in"]).eq("is_emergency", false),
  ]);

  const bookedByDoctor = new Map<string, Set<string>>();
  for (const r of bookedRows ?? []) {
    const doctorId = r.doctor_id;
    const start = typeof r.slot_start === "string" ? r.slot_start.slice(0, 5) : "";
    if (!doctorId || !start) continue;
    if (!bookedByDoctor.has(doctorId)) bookedByDoctor.set(doctorId, new Set());
    bookedByDoctor.get(doctorId)!.add(start);
  }

  const availableToday = new Set<string>();
  for (const row of availRows ?? []) {
    const booked = bookedByDoctor.get(row.doctor_id) ?? new Set<string>();
    const slots = (row.slots ?? []) as { start?: string }[];
    const hasOpenSlot = slots.some(s => {
      const start = typeof s.start === "string" ? s.start.slice(0, 5) : "";
      return Boolean(start) && !booked.has(start);
    });
    if (hasOpenSlot) availableToday.add(row.doctor_id);
  }
  return availableToday;
}

/* ─── DoctorCard ─────────────────────────────────────────────────────── */
function DoctorCard({
  doctor,
  isAr,
  onBook,
}: {
  doctor: Doctor;
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
            {specialtyLabel(doctor.specialty, isAr)}
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

      {/* View Profile + Book — both go to the doctor details page (single booking flow lives there) */}
      <div className="mt-4 flex gap-2">
        <Link
          href={`/dashboard/find-doctors/${doctor.id}`}
          className="flex-1 py-2.5 rounded-xl font-bold text-sm text-center text-[#2E1A47] dark:text-[#DFC8E7] border border-[#e7dcee] dark:border-[#3a2560] hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30 transition-colors"
        >
          {isAr ? "عرض الملف الشخصي" : "View Profile"}
        </Link>
        <button
          onClick={onBook}
          disabled={!doctor.available}
          className="flex-1 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
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
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const PAGE_SIZE = 10;

  const [search, setSearch]           = useState("");
  const [activeSpec, setActiveSpec]   = useState("All");
  const [availOnly, setAvailOnly]     = useState(false);
  const [doctors, setDoctors]         = useState<Doctor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [page, setPage]               = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.doctors
      .searchDoctors(supabase, { limit: 100 })
      .then(async (rows) => {
        if (!active) return;
        const base = rows.map(toDoctor);
        const availableToday = await computeAvailableTodayIds(supabase, base.map(d => d.id)).catch(() => new Set<string>());
        if (!active) return;
        setDoctors(base.map(d => ({ ...d, available: availableToday.has(d.id) })));
      })
      .catch(() => { if (active) setError(ar ? "تعذر تحميل الأطباء." : "Could not load doctors."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supabase, ar]);

  const filtered = doctors.filter(doc => {
    const matchSpec = matchesSpecialtyCategory(doc.specialty, activeSpec);
    const matchAvail = !availOnly || doc.available;
    const q = search.toLowerCase();
    const matchSearch = !q
      || doc.en.name.toLowerCase().includes(q)
      || doc.ar.name.includes(q)
      || doc.specialty.toLowerCase().includes(q)
      || doc.en.hospital.toLowerCase().includes(q);
    return matchSpec && matchAvail && matchSearch;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 whenever the result set changes (new search/filter).
  useEffect(() => { setPage(1); }, [search, activeSpec, availOnly]);

  // Booking happens on the doctor details page (single shared flow).
  function goToDoctor(doc: Doctor) {
    if (doc.available) router.push(`/dashboard/find-doctors/${doc.id}`);
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* ── Hero ── */}
      <section className="py-12 px-4"
        style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
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

      {/* ── Specialty + availability filters ── */}
      <section className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-4 py-4">
        <div className={`max-w-6xl mx-auto flex flex-wrap items-center gap-2 ${ar ? "flex-row-reverse" : ""}`}>
          {/* Availability toggle */}
          <button
            onClick={() => setAvailOnly(v => !v)}
            aria-pressed={availOnly}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-all ${ar ? "flex-row-reverse" : ""} ${
              availOnly
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
                : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${availOnly ? "bg-emerald-500" : "bg-[#2E1A47]/25 dark:bg-[#DFC8E7]/25"}`} />
            {ar ? "متاح فقط" : "Available only"}
          </button>

          <div className="w-px h-6 bg-[#e7dcee] dark:bg-[#3a2560] flex-shrink-0" />

          {/* Specialty pills — wraps to a new line instead of clipping/scrolling */}
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
      <section className="py-10 px-4">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-6">
            {loading
              ? (ar ? "جارٍ التحميل…" : "Loading…")
              : ar
                ? `${filtered.length} طبيب متاح`
                : `${filtered.length} doctor${filtered.length !== 1 ? "s" : ""} found`}
          </p>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-40 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/50 dark:bg-[#1a1030]/50 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">⚠️</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
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
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {paged.map(doc => (
                  <DoctorCard
                    key={doc.id}
                    doctor={doc}
                    isAr={ar}
                    onBook={() => goToDoctor(doc)}
                  />
                ))}
              </div>

              {/* ── Pagination ── */}
              {pageCount > 1 && (
                <div className={`flex items-center justify-center gap-2 mt-8 ${ar ? "flex-row-reverse" : ""}`}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47] dark:text-[#DFC8E7] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30 transition-colors"
                  >
                    {ar ? "السابق" : "Prev"}
                  </button>

                  {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                        n === currentPage
                          ? "bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030]"
                          : "border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30"
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  <button
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    disabled={currentPage === pageCount}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47] dark:text-[#DFC8E7] disabled:opacity-30 disabled:cursor-not-allowed hover:border-[#2E1A47]/30 dark:hover:border-[#DFC8E7]/30 transition-colors"
                  >
                    {ar ? "السابق" : "Next"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Nearby clinics map ── */}
      <section className="pb-14 px-4">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-xs font-bold  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
            {ar ? "📍 عيادات قريبة منك" : "📍 Clinics near you"}
          </p>
          <NearbyDoctorsMap isAr={ar} />
        </div>
      </section>
    </div>
  );
}
