"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

const PLATFORM_LINKS = [
  { en: "Services",        ar: "الخدمات",        href: "/services"    },
  { en: "For Clinics",     ar: "للعيادات",        href: "/for-clinics" },
  { en: "For Doctors",     ar: "للأطباء",         href: "/for-clinics" },
  { en: "Patient app",     ar: "تطبيق المريض",    href: "/sign-up"     },
  { en: "Clinic dashboard",ar: "لوحة العيادة",    href: "/for-clinics" },
];

const COMPANY_LINKS = [
  { en: "About",    ar: "من نحن",   href: "/about"   },
  { en: "Contact",  ar: "اتصل بنا", href: "/contact" },
  { en: "Careers",  ar: "الوظائف",  href: "/contact" },
];

const SOCIAL_LINKS = [
  { name: "Instagram", href: "#", path: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ) },
  { name: "X",         href: "#", path: (
      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />
    ) },
  { name: "Facebook",  href: "#", path: (
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    ) },
  { name: "LinkedIn",  href: "#", path: (
      <>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </>
    ) },
];

export function HomeFooter() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <footer className="border-t border-[#e7dcee] dark:border-[#2a1c44] bg-white dark:bg-[#0d0820] py-14">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-[#e7dcee] dark:border-[#2a1c44]">

          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                <img src="/logo/submark-light.svg"    alt="Medilink" className="w-full h-full object-cover dark:hidden" />
                <img src="/logo/submark-dark-mode.svg" alt="Medilink" className="w-full h-full object-cover hidden dark:block" />
              </div>
              <img src="/logo/wordmark-violet.svg"   alt="Medilink" className="h-5 w-auto dark:hidden" />
              <img src="/logo/wordmark-lavender.svg" alt="Medilink" className="h-5 w-auto hidden dark:block" />
            </div>
            <p className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 leading-relaxed mb-5 max-w-[210px]">
              {ar
                ? "يربط ميديلينك الناس في عمان بأفضل رعاية صحية بتجربة رقمية هادئة وحديثة."
                : "Medilink connects people across Oman to trusted healthcare with a calm, modern, and human digital experience."}
            </p>
            <p className="text-xs font-bold text-[#2E1A47]/30 dark:text-[#DFC8E7]/30 tracking-widest uppercase">
              {ar ? "ابحث · احجز · تواصل" : "Find · Book · Connect"}
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#2E1A47] dark:text-[#DFC8E7] mb-5">
              {ar ? "المنصة" : "Platform"}
            </p>
            <ul className="flex flex-col gap-3">
              {PLATFORM_LINKS.map(l => (
                <li key={l.en}>
                  <Link href={l.href}
                    className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline">
                    {ar ? l.ar : l.en}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#2E1A47] dark:text-[#DFC8E7] mb-5">
              {ar ? "الشركة" : "Company"}
            </p>
            <ul className="flex flex-col gap-3">
              {COMPANY_LINKS.map(l => (
                <li key={l.en}>
                  <Link href={l.href}
                    className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline">
                    {ar ? l.ar : l.en}
                  </Link>
                </li>
              ))}
              <li>
                <a href="mailto:hello@medilink.om"
                  className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
                  hello@medilink.om
                </a>
              </li>
              <li>
                <a href="tel:+96890000000"
                  className="text-sm text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">
                  +968 9000 0000
                </a>
              </li>
            </ul>
          </div>

          {/* Follow */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#2E1A47] dark:text-[#DFC8E7] mb-5">
              {ar ? "تابعنا" : "Follow"}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {SOCIAL_LINKS.map(s => (
                <a key={s.name} href={s.href} aria-label={s.name}
                  className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#e7dcee] dark:border-[#2a1c44] text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 hover:border-transparent transition-all hover:-translate-y-0.5"
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)";
                    e.currentTarget.style.color = "#2E1A47";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "";
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {s.path}
                  </svg>
                </a>
              ))}
            </div>
            <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 leading-relaxed mt-5 max-w-[160px]">
              {ar
                ? "تابع آخر التحديثات ونصائح الصحة."
                : "Follow along for updates and health tips."}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-8">
          <p className="text-xs text-[#2E1A47]/32 dark:text-[#DFC8E7]/32">
            © 2026 Medilink. {ar ? "جميع الحقوق محفوظة." : "All rights reserved."}
          </p>
          <div className="flex gap-5 text-xs text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">
            <a href="#" className="hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">{ar ? "الخصوصية" : "Privacy"}</a>
            <a href="#" className="hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">{ar ? "الشروط" : "Terms"}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
