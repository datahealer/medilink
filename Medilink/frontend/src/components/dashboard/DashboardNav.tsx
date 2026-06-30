"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LangToggle } from "@/components/auth/LangToggle";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { useI18n } from "@/i18n/I18nProvider";

const NAV_LINKS = [
  { href: "/dashboard/find-doctors", en: "Find Doctors", ar: "ابحث عن طبيب" },
  { href: "/dashboard/lab-tests",    en: "Lab Tests",    ar: "تحاليل مختبرية" },
  { href: "/dashboard/surgeries",    en: "Surgeries",    ar: "العمليات الجراحية" },
];

function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { locale } = useI18n();
  const ar = locale === "ar";

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const menuItems = [
    { en: "My Profile",      ar: "ملفي الشخصي", href: "/dashboard/profile" },
    { en: "My Appointments", ar: "مواعيدي",      href: "/dashboard/appointments" },
    { en: "My Records",      ar: "سجلاتي",       href: "/dashboard/records" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#2E1A47] flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
        >
          V
        </div>
        <span className="text-sm font-medium text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hidden sm:block">
          {ar ? "فارتيكا" : "Vartika P."}
        </span>
        <svg className="w-3 h-3 text-[#2E1A47]/40 dark:text-[#DFC8E7]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-full mt-1.5 w-48 bg-white dark:bg-[#1a1030] rounded-xl border border-[#e7dcee] dark:border-[#2a1840] shadow-lg shadow-[#2E1A47]/8 py-1.5 z-50 ${ar ? "left-0" : "right-0"}`}>
          <div className={`px-4 py-2.5 border-b border-[#e7dcee] dark:border-[#2a1840] ${ar ? "text-right" : ""}`}>
            <p className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7] truncate">
              {ar ? "فارتيكا بانديا" : "Vartika Pandey"}
            </p>
            <p className="text-[11px] text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 truncate">vartika.pandey@inzint.com</p>
          </div>
          {menuItems.map(item => (
            <button key={item.href} onClick={() => { setOpen(false); router.push(item.href); }}
              className={`block w-full px-4 py-2.5 text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#f9f4fa] dark:hover:bg-[#2E1A47]/20 transition-colors ${ar ? "text-right" : "text-left"}`}>
              {ar ? item.ar : item.en}
            </button>
          ))}
          <div className="border-t border-[#e7dcee] dark:border-[#2a1840] mt-1">
            <button
              onClick={() => { setOpen(false); router.push("/sign-in"); }}
              className={`block w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${ar ? "text-right" : "text-left"}`}
            >
              {ar ? "تسجيل الخروج" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardNav() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [activeLink, setActiveLink] = useState("");
  const [search, setSearch]         = useState("");
  const [menuOpen, setMenuOpen]     = useState(false);

  return (
    <header
      dir={ar ? "rtl" : "ltr"}
      className="bg-white dark:bg-[#0a0518] border-b border-[#e7dcee] dark:border-[#2a1840] sticky top-0 z-50 shadow-sm shadow-[#2E1A47]/5"
    >
      {/* ── Row 1 ─────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 h-[56px]">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 no-underline flex-shrink-0 group">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-sm transition-transform group-hover:scale-105 flex-shrink-0">
            <img src="/logo/submark-light.svg"  alt="MediLink" width={32} height={32} className="w-full h-full object-cover dark:hidden" />
            <img src="/logo/submark-dark-mode.svg" alt="MediLink" width={32} height={32} className="w-full h-full object-cover hidden dark:block" />
          </div>
          <img src="/logo/wordmark-violet.svg"  alt="MediLink" className="h-[18px] w-auto hidden sm:block dark:hidden" />
          <img src="/logo/wordmark-lavender.svg" alt="MediLink" className="h-[18px] w-auto hidden dark:sm:block" />
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-0.5 mx-2">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              onClick={() => setActiveLink(link.href)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium no-underline transition-all ${
                activeLink === link.href
                  ? "text-[#2E1A47] dark:text-[#DFC8E7] bg-[#2E1A47]/7 dark:bg-[#DFC8E7]/10 font-semibold"
                  : "text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8"
              }`}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <LangToggle />
          <ThemeToggle />
          <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#2a1840] mx-1" />
          <UserMenu />
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden p-2 rounded-xl text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 transition-colors"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen
              ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* ── Row 2: Location + Search ──────────────────────────── */}
      <div className="border-t border-[#e7dcee]/60 dark:border-[#2a1840] bg-[#faf8fc] dark:bg-[#0d0820] hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
          <button className="flex items-center gap-1.5 text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-[#46255f] dark:text-[#DFC8E7]/70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium text-[13px]">{ar ? "أحمد آباد" : "Ahmedabad"}</span>
            <svg className="w-3 h-3 text-[#2E1A47]/35 dark:text-[#DFC8E7]/35" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#2a1840]" />

          <div className="flex-1 max-w-xl flex items-center bg-white dark:bg-[#1a1030] border border-[#e7dcee] dark:border-[#2a1840] rounded-xl px-3 py-[7px] gap-2 focus-within:border-[#2E1A47]/40 dark:focus-within:border-[#DFC8E7]/30 transition-all">
            <svg className="w-4 h-4 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ar ? "ابحث عن أطباء، عيادات، مستشفيات..." : "Search doctors, clinics, hospitals, etc."}
              className="flex-1 text-sm outline-none text-[#2E1A47] dark:text-[#DFC8E7] placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30 bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* ── Mobile menu ────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#e7dcee] dark:border-[#2a1840] bg-white dark:bg-[#0a0518] px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8 no-underline transition-colors ${ar ? "text-right" : ""}`}
              onClick={() => { setActiveLink(link.href); setMenuOpen(false); }}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
          <div className="h-px bg-[#e7dcee] dark:bg-[#2a1840] my-1" />
          <div className="flex items-center bg-[#faf8fc] dark:bg-[#1a1030] border border-[#e7dcee] dark:border-[#2a1840] rounded-xl px-3 py-2 gap-2">
            <svg className="w-4 h-4 text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text"
              placeholder={ar ? "ابحث عن أطباء، عيادات..." : "Search doctors, clinics..."}
              className="flex-1 text-sm outline-none bg-transparent text-[#2E1A47] dark:text-[#DFC8E7] placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30" />
          </div>
        </div>
      )}
    </header>
  );
}
