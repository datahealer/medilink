"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/auth/Button";
import { AuthCard } from "@/components/auth/AuthCard";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@medilink/shared";

const LANGUAGES = [
  { code: "en" as Locale, label: "English", nativeLabel: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "ar" as Locale, label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦", dir: "rtl" },
];

export default function LanguagePage() {
  const { locale, setLocale } = useI18n();
  const [selected, setSelected] = useState<Locale>(locale);
  const router = useRouter();

  const confirm = () => {
    setLocale(selected);
    router.push("/sign-up");
  };

  return (
    <AuthCard>
      <div className="mb-[18px]">
        <h2
          className="font-bold text-[#2E1A47]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: "30px", margin: "0 0 6px" }}
        >
          Language
        </h2>
        <p className="text-sm text-[#2E1A47]/55">Choose your preferred language. You can change it anytime in Settings.</p>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {LANGUAGES.map((lang) => {
          const active = selected === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code)}
              className="flex items-center gap-4 w-full px-4 py-4 rounded-xl border-2 transition-all text-left"
              style={{
                borderColor: active ? "#2E1A47" : "#e7dcee",
                background: active ? "#f5f0fa" : "white",
                boxShadow: active ? "0 0 0 3px rgba(46,26,71,0.10)" : "none",
              }}
              dir={lang.dir}
            >
              <span className="text-2xl flex-shrink-0">{lang.flag}</span>
              <div className="flex-1 min-w-0">
                <p
                  className="font-semibold text-sm text-[#2E1A47]"
                  style={{ textAlign: lang.dir === "rtl" ? "right" : "left" }}
                >
                  {lang.nativeLabel}
                </p>
                {lang.nativeLabel !== lang.label && (
                  <p className="text-xs text-[#2E1A47]/50 ltr:text-left rtl:text-right">
                    {lang.label}
                  </p>
                )}
              </div>
              {active && (
                <svg
                  className="flex-shrink-0"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                >
                  <circle cx="10" cy="10" r="10" fill="#2E1A47" />
                  <path
                    d="M6 10l3 3 5-5"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <Button variant="cta" fullWidth onClick={confirm} className="mt-[14px]">
        Continue
      </Button>
    </AuthCard>
  );
}
