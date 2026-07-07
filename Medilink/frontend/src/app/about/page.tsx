"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";
import { HomeFooter } from "@/components/home/HomeFooter";

const VALUES = [
  { icon: "🕊️", en: "Calm by design",      ar: "هدوء في التصميم",
    descEn: "No clutter, no jargon. Every screen is built to reduce anxiety, not add to it.",
    descAr: "لا فوضى، لا مصطلحات تقنية. كل شاشة مصممة لتقليل القلق لا لزيادته." },
  { icon: "✅", en: "Trusted & verified",   ar: "موثوق ومتحقق منه",
    descEn: "Every clinician on Medilink holds a valid MoH licence. No exceptions.",
    descAr: "كل طبيب على ميديلينك يحمل ترخيصاً صالحاً من وزارة الصحة. بلا استثناء." },
  { icon: "🌐", en: "Bilingual at the core", ar: "ثنائي اللغة في جوهره",
    descEn: "Arabic and English everywhere — patient records, prescriptions, and support.",
    descAr: "العربية والإنجليزية في كل مكان — السجلات والوصفات والدعم." },
  { icon: "🔒", en: "Privacy first",        ar: "الخصوصية أولاً",
    descEn: "Your health data is yours. Encrypted at rest and in transit, shared only with your consent.",
    descAr: "بياناتك الصحية ملكك. مشفّرة وتُشارك فقط بموافقتك." },
];

const MILESTONES = [
  { year: "2023", en: "Founded in Muscat, Oman",                       ar: "التأسيس في مسقط، عُمان" },
  { year: "2024", en: "First 50 clinics onboarded",                    ar: "انضمت أولى 50 عيادة" },
  { year: "2025", en: "AI symptom checker launched in Arabic & English",ar: "إطلاق فاحص الأعراض بالذكاء الاصطناعي" },
  { year: "2026", en: "10,000+ patients. Growing every day.",           ar: "+10,000 مريض. ونمو مستمر." },
];

export default function AboutPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      <HomeNav />

      {/* ── Hero ── */}
      <section className="pt-36 pb-20 bg-[#faf8fc] dark:bg-[#0a0518]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
            style={{ background: "#DFC8E7", color: "#2E1A47" }}>
            {ar ? "من نحن" : "About"}
          </span>
          <h1 className="font-black font-serif text-[#2E1A47] dark:text-white mb-6"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.06 }}>
            {ar
              ? <>رعاية صحية تشعر<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">بالقرب.</em></>
              : <>Healthcare that feels<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">closer.</em></>}
          </h1>
          <p className="text-base text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 max-w-xl leading-relaxed mb-10">
            {ar
              ? "ميديلينك منصة رعاية صحية مبنية في عُمان للناس في عُمان. مهمتنا بسيطة: جعل إيجاد طبيب موثوق وحجز موعد والاحتفاظ بسجلاتك أمراً سلساً وهادئاً."
              : "Medilink is a healthcare platform built in Oman, for people in Oman. Our mission is simple: make finding a trusted doctor, booking an appointment, and keeping your records effortless and calm."}
          </p>
          <Link href="/sign-up"
            className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
            style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
              {ar ? "ابدأ مجاناً →" : "Get started free →"}
            </span>
          </Link>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="py-20 bg-white dark:bg-[#0d0820]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
            {ar ? "قيمنا" : "Our values"}
          </p>
          <h2 className="font-black font-serif text-[#2E1A47] dark:text-white mb-12"
            style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}>
            {ar ? "مبني على ثقتك." : "Built on your trust."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VALUES.map(v => (
              <div key={v.en}
                className="p-6 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030]">
                <div className="text-2xl mb-4">{v.icon}</div>
                <h3 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] mb-2 font-serif">
                  {ar ? v.ar : v.en}
                </h3>
                <p className="text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed">
                  {ar ? v.descAr : v.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Timeline ── */}
      <section className="py-20" dir={ar ? "rtl" : "ltr"}
        style={{ background: "linear-gradient(140deg, #1e1038, #2E1A47, #1e1038)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "قصتنا" : "Our story"}
          </p>
          <h2 className="font-black font-serif text-white mb-12" style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}>
            {ar ? "كيف وصلنا إلى هنا." : "How we got here."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {MILESTONES.map(m => (
              <div key={m.year}>
                <p className="text-3xl font-black font-serif mb-3" style={{ color: "rgba(223,200,231,0.25)" }}>
                  {m.year}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(223,200,231,0.72)" }}>
                  {ar ? m.ar : m.en}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-white dark:bg-[#0d0820]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white mb-3"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>
              {ar ? "جاهز لرعاية أفضل؟" : "Ready for better care?"}
            </h2>
            <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
              {ar ? "انضم إلى آلاف المرضى والعيادات في عُمان." : "Join thousands of patients and clinics across Oman."}
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <Link href="/sign-up"
              className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-8 py-3.5"
              style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", transform: "skewX(12deg)" }}>
                {ar ? "ابدأ الآن" : "Get started"}
              </span>
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl font-bold text-sm no-underline border-2 border-[#2E1A47]/14 dark:border-[#DFC8E7]/14 text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#2E1A47]/35 dark:hover:border-[#DFC8E7]/35 hover:bg-[#2E1A47]/5 active:scale-[0.97] transition-all">
              {ar ? "تواصل معنا" : "Contact us"}
            </Link>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
