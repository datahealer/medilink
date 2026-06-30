"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { LangToggle } from "@/components/auth/LangToggle";
import { useI18n } from "@/i18n/I18nProvider";

const NAV_LINKS = [
  { href: "/",            en: "Home",        ar: "الرئيسية" },
  { href: "/about",       en: "About",       ar: "من نحن"   },
  { href: "/services",    en: "Services",    ar: "الخدمات"  },
  { href: "/for-clinics", en: "For Clinics", ar: "للعيادات" },
  { href: "/contact",     en: "Contact",     ar: "اتصل بنا" },
];

export function HomeNav() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      dir={ar ? "rtl" : "ltr"}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 dark:bg-[#0a0518]/90 backdrop-blur-xl border-b border-[#e7dcee] dark:border-[#2a1840] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline group flex-shrink-0">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md transition-transform group-hover:scale-105 flex-shrink-0">
            <img src="/logo/submark-light.svg" alt="Medilink" width={36} height={36}
              className="w-full h-full object-cover dark:hidden" />
            <img src="/logo/submark-dark-mode.svg" alt="Medilink" width={36} height={36}
              className="w-full h-full object-cover hidden dark:block" />
          </div>
          <img src="/logo/wordmark-violet.svg"   alt="Medilink" className="h-5 w-auto dark:hidden" />
          <img src="/logo/wordmark-lavender.svg" alt="Medilink" className="h-5 w-auto hidden dark:block" />
        </Link>

        {/* Centre links — desktop */}
        <div className="hidden lg:flex items-center gap-0.5">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-4 py-2 rounded-xl text-sm font-medium no-underline transition-all
                ${scrolled
                  ? "text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/7 dark:hover:bg-[#DFC8E7]/10"
                  : "text-[#2E1A47]/55 dark:text-[#DFC8E7]/60 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] hover:bg-[#2E1A47]/5 dark:hover:bg-[#DFC8E7]/8"
                }`}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
          <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#2a1840] mx-0.5" />

          <Link href="/sign-up"
            className="hidden sm:inline-flex items-center justify-center font-bold text-xs text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-6 py-2.5"
            style={{
              backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)",
              transform: "skewX(-12deg)",
              borderRadius: "8px",
              boxShadow: "0 6px 22px rgba(223,200,231,0.45)",
            }}>
            <span style={{ display: "inline-flex", alignItems: "center", transform: "skewX(12deg)" }}>
              {ar ? "ابدأ الآن" : "Get Started"}
            </span>
          </Link>

          {/* Hamburger */}
          <button
            className="lg:hidden p-2 rounded-xl transition-colors text-[#2E1A47] dark:text-[#DFC8E7]"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <><line x1="18" y1="6"  x2="6"  y2="18"/><line x1="6"  y1="6"  x2="18" y2="18"/></>
                : <><line x1="3" y1="6"  x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-[#e7dcee] dark:border-[#2a1840] bg-white/95 dark:bg-[#0a0518]/95 backdrop-blur-xl px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-4 py-3 rounded-xl text-sm font-medium text-[#2E1A47] dark:text-[#DFC8E7] hover:bg-[#2E1A47]/6 dark:hover:bg-[#DFC8E7]/8 transition-colors no-underline ${ar ? "text-right" : "text-left"}`}
              onClick={() => setMenuOpen(false)}>
              {ar ? link.ar : link.en}
            </Link>
          ))}
          <div className="h-px bg-[#e7dcee] dark:bg-[#2a1840] my-2" />
          <Link href="/sign-up"
            className="flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline px-5 py-3.5 rounded-xl hover:opacity-90 transition-all tracking-widest uppercase"
            style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
            onClick={() => setMenuOpen(false)}>
            {ar ? "ابدأ الآن" : "Get Started"}
          </Link>
        </div>
      )}
    </nav>
  );
}
