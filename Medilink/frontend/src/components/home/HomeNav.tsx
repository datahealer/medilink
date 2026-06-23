"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/auth/ThemeToggle";
import { LangToggle } from "@/components/auth/LangToggle";
import { useI18n } from "@/i18n/I18nProvider";

export function HomeNav() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
      scrolled
        ? "bg-white/90 dark:bg-[#0f0a1e]/90 backdrop-blur-xl shadow-lg shadow-[#2E1A47]/5 border-b border-[#e7dcee] dark:border-[#3a2560]"
        : "bg-transparent"
    }`}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline group">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md transition-transform group-hover:scale-105 flex-shrink-0">
            <img src="/logo/submark-icon.png" alt="Medilink" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <img src="/logo/wordmark-violet.svg" alt="Medilink" className="h-6 w-auto dark:hidden" />
          <img src="/logo/wordmark-lavender.svg" alt="Medilink" className="h-6 w-auto hidden dark:block" />
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <LangToggle />
          <ThemeToggle />
          <div className="w-px h-5 bg-[#e7dcee] dark:bg-[#3a2560] mx-1" />
          <Link href="/sign-in"
            className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]
              hover:bg-[#2E1A47]/8 dark:hover:bg-white/10 rounded-xl transition-colors no-underline">
            {ar ? "دخول" : "Sign In"}
          </Link>
          <Link href="/sign-up"
            className="inline-flex px-5 py-2.5 text-xs font-bold text-[#2E1A47] tracking-widest uppercase transition-all no-underline hover:opacity-90 active:scale-[0.97] shadow-md"
            style={{ background: "#DFC8E7", transform: "skewX(-12deg)", borderRadius: "8px" }}>
            <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>
              {ar ? "ابدأ الآن" : "Get Started"}
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
