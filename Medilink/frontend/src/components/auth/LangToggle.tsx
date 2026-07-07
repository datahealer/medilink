"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function LangToggle({ className = "" }: { className?: string }) {
  const { locale, toggleLocale } = useI18n();

  return (
    <button
      onClick={toggleLocale}
      aria-label={locale === "en" ? "Switch to Arabic" : "Switch to English"}
      className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors
        hover:bg-black/8 dark:hover:bg-white/10 text-[#2E1A47] dark:text-[#DFC8E7] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      {locale === "en" ? "العربية" : "English"}
    </button>
  );
}
