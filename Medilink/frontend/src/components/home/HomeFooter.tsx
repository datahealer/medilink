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

export function HomeFooter() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <footer className="border-t border-[#e7dcee] dark:border-[#2a1c44] bg-white dark:bg-[#0d0820] py-14">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 pb-12 border-b border-[#e7dcee] dark:border-[#2a1c44]">

          {/* Brand */}
          <div>
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
