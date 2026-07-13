"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ARTICLES } from "@/lib/data/articles";

type PageEntry = { en: string; ar: string; keywords: string[]; href: string; icon: string };

const PAGES: PageEntry[] = [
  { en: "Find Doctors",       ar: "ابحث عن طبيب",     keywords: ["doctor", "specialist", "find"],              href: "/dashboard/find-doctors",    icon: "🩺" },
  { en: "AI Symptom Checker", ar: "فاحص الأعراض",      keywords: ["symptom", "ai", "fever", "pain", "checker"], href: "/dashboard/symptom-checker",  icon: "🤖" },
  { en: "Lab Tests",          ar: "تحاليل مختبرية",    keywords: ["lab", "test", "blood"],                      href: "/dashboard/lab-tests",       icon: "🔬" },
  { en: "Surgeries",          ar: "العمليات الجراحية",  keywords: ["surgery", "operation"],                      href: "/dashboard/surgeries",       icon: "🏥" },
  { en: "My Profile",         ar: "ملفي الشخصي",       keywords: ["profile", "account", "family"],              href: "/dashboard/profile",         icon: "👤" },
  { en: "My Appointments",    ar: "مواعيدي",           keywords: ["appointment", "booking", "schedule"],        href: "/dashboard/appointments",    icon: "📅" },
  { en: "My Records",         ar: "سجلاتي",            keywords: ["record", "history", "report"],               href: "/dashboard/records",         icon: "📋" },
  { en: "Health Library",     ar: "المكتبة الصحية",     keywords: ["article", "health tips", "library"],         href: "/dashboard/articles",         icon: "📚" },
  { en: "Notifications",      ar: "الإشعارات",          keywords: ["notification", "alert", "reminder"],         href: "/dashboard/notifications",   icon: "🔔" },
];

// Lightweight name/category index mirroring the LABS array in dashboard/lab-tests/page.tsx —
// kept minimal here since lab tests have no detail route to link to (just this page's own search).
const LAB_TESTS_INDEX = [
  { id: "AL", en: "Complete Blood Count (CBC)",   ar: "صورة الدم الكاملة (CBC)" },
  { id: "LF", en: "Liver Function Test (LFT)",    ar: "وظائف الكبد" },
  { id: "HB", en: "HbA1c (Glycated Haemoglobin)", ar: "الهيموغلوبين الغليكوزيلاتي HbA1c" },
  { id: "TH", en: "Thyroid Panel (T3, T4, TSH)",  ar: "هرمونات الغدة الدرقية" },
  { id: "UA", en: "Urine Analysis (Routine)",     ar: "تحليل البول الروتيني" },
  { id: "EC", en: "ECG + Echocardiogram",         ar: "تخطيط القلب والصدى" },
  { id: "XR", en: "Chest X-Ray",                  ar: "أشعة الصدر" },
  { id: "LI", en: "Kidney Function Test (KFT)",   ar: "وظائف الكلى" },
];

// Mirrors the SURGERIES array in dashboard/surgeries/page.tsx — same rationale as above.
const SURGERIES_INDEX = [
  { id: "KR", en: "Knee Replacement",             ar: "استبدال مفصل الركبة" },
  { id: "CB", en: "Coronary Bypass (CABG)",       ar: "جراحة القلب المفتوح (CABG)" },
  { id: "LS", en: "LASIK Eye Surgery",            ar: "عملية الليزك للعيون" },
  { id: "AP", en: "Laparoscopic Appendectomy",    ar: "استئصال الزائدة بالمنظار" },
  { id: "CS", en: "Caesarean Section (C-Section)",ar: "الولادة القيصرية" },
  { id: "TS", en: "Tonsillectomy",                ar: "استئصال اللوزتين" },
  { id: "RN", en: "Rhinoplasty (Nose Job)",       ar: "تجميل الأنف" },
  { id: "SH", en: "Shoulder Arthroscopy",         ar: "تنظير مفصل الكتف" },
];

type Doctor = { id: string; full_name: string; specialty: string | null };
type Result = { key: string; icon: string; label: string; sub?: string; href: string };

export function SiteSearch({
  isAr, placeholder, autoFocus, onNavigate,
}: {
  isAr: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setDoctors([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("doctors")
        .select("id, full_name, specialty")
        .eq("is_active", true)
        .or(`full_name.ilike.%${q}%,specialty.ilike.%${q}%`)
        .limit(5);
      if (!cancelled) {
        setDoctors((data ?? []) as Doctor[]);
        setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const q = query.trim().toLowerCase();

  const pageResults: Result[] = q.length === 0 ? [] : PAGES.filter(p =>
    p.en.toLowerCase().includes(q) || p.ar.includes(q) || p.keywords.some(k => k.includes(q))
  ).slice(0, 4).map(p => ({ key: p.href, icon: p.icon, label: isAr ? p.ar : p.en, href: p.href }));

  const articleResults: Result[] = q.length === 0 ? [] : ARTICLES.filter(a =>
    a.en.title.toLowerCase().includes(q) || a.ar.title.includes(q) ||
    a.en.tag.toLowerCase().includes(q) || a.ar.tag.includes(q)
  ).slice(0, 3).map(a => ({
    key: a.id, icon: a.emoji, label: isAr ? a.ar.title : a.en.title,
    sub: isAr ? a.ar.tag : a.en.tag, href: `/dashboard/articles/${a.id}`,
  }));

  const doctorResults: Result[] = doctors.map(d => ({
    key: d.id, icon: "🩺", label: d.full_name, sub: d.specialty ?? undefined, href: `/dashboard/find-doctors/${d.id}`,
  }));

  const labResults: Result[] = q.length === 0 ? [] : LAB_TESTS_INDEX.filter(l =>
    l.en.toLowerCase().includes(q) || l.ar.includes(q)
  ).slice(0, 3).map(l => ({
    key: l.id, icon: "🔬", label: isAr ? l.ar : l.en, href: `/dashboard/lab-tests?q=${encodeURIComponent(isAr ? l.ar : l.en)}`,
  }));

  const surgeryResults: Result[] = q.length === 0 ? [] : SURGERIES_INDEX.filter(s =>
    s.en.toLowerCase().includes(q) || s.ar.includes(q)
  ).slice(0, 3).map(s => ({
    key: s.id, icon: "🏥", label: isAr ? s.ar : s.en, href: `/dashboard/surgeries?q=${encodeURIComponent(isAr ? s.ar : s.en)}`,
  }));

  const hasResults = pageResults.length + articleResults.length + doctorResults.length + labResults.length + surgeryResults.length > 0;

  // Route "see all results" to whichever category actually has matches, instead of
  // always landing on Find Doctors (which looked broken for lab test / surgery queries).
  function fallbackHref(trimmed: string) {
    const encoded = encodeURIComponent(trimmed);
    if (surgeryResults.length > 0 && surgeryResults.length >= labResults.length && surgeryResults.length >= doctorResults.length) {
      return `/dashboard/surgeries?q=${encoded}`;
    }
    if (labResults.length > 0 && labResults.length >= doctorResults.length) {
      return `/dashboard/lab-tests?q=${encoded}`;
    }
    return `/dashboard/find-doctors?q=${encoded}`;
  }

  function go(href: string) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(href);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    go(fallbackHref(trimmed));
  }

  return (
    <div ref={rootRef} className="relative flex-1">
      <form onSubmit={onSubmit}
        className="flex items-center bg-white dark:bg-[#1a1030] border border-[#e7dcee] dark:border-[#2a1840] rounded-xl px-3 py-[7px] gap-2 focus-within:border-[#2E1A47]/40 dark:focus-within:border-[#DFC8E7]/30 transition-all">
        <svg className="w-4 h-4 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-sm outline-none text-[#2E1A47] dark:text-[#DFC8E7] placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30 bg-transparent"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setOpen(false); }}
            className="text-[#2E1A47]/30 hover:text-[#2E1A47] dark:text-[#DFC8E7]/30 dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </form>

      {open && q.length > 0 && (
        <div className={`absolute top-full mt-1.5 w-full min-w-[280px] bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#2a1840] shadow-xl shadow-[#2E1A47]/10 z-50 overflow-hidden`}>
          {!hasResults && searching ? (
            <div className="px-4 py-6 text-center">
              <div className="w-4 h-4 mx-auto rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
            </div>
          ) : !hasResults ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                {isAr ? "لا توجد نتائج" : "No results found"}
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1.5" style={{ scrollbarWidth: "thin" }}>
              {pageResults.length > 0 && <ResultGroup label={isAr ? "الصفحات" : "Pages"} items={pageResults} onSelect={go} isAr={isAr} />}
              {doctorResults.length > 0 && <ResultGroup label={isAr ? "الأطباء" : "Doctors"} items={doctorResults} onSelect={go} isAr={isAr} />}
              {labResults.length > 0 && <ResultGroup label={isAr ? "تحاليل مختبرية" : "Lab Tests"} items={labResults} onSelect={go} isAr={isAr} />}
              {surgeryResults.length > 0 && <ResultGroup label={isAr ? "العمليات الجراحية" : "Surgeries"} items={surgeryResults} onSelect={go} isAr={isAr} />}
              {articleResults.length > 0 && <ResultGroup label={isAr ? "المقالات" : "Articles"} items={articleResults} onSelect={go} isAr={isAr} />}
            </div>
          )}
          <button onClick={() => go(fallbackHref(query.trim()))}
            className={`w-full px-4 py-2.5 text-xs font-semibold text-[#46255f] dark:text-[#DFC8E7]/70 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20 border-t border-[#e7dcee] dark:border-[#2a1840] transition-colors ${isAr ? "text-right" : "text-left"}`}>
            {isAr ? `عرض كل نتائج "${query}"` : `See all results for "${query}"`}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label, items, onSelect, isAr,
}: {
  label: string;
  items: Result[];
  onSelect: (href: string) => void;
  isAr: boolean;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-4 py-1 text-[10px] font-black  tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">
        {label}
      </p>
      {items.map(item => (
        <button key={item.key} onClick={() => onSelect(item.href)}
          className={`w-full flex items-center gap-2.5 px-4 py-2 hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20 transition-colors ${isAr ? "flex-row-reverse text-right" : "text-left"}`}>
          <span className="text-base flex-shrink-0">{item.icon}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{item.label}</span>
            {item.sub && <span className="block text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">{item.sub}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
