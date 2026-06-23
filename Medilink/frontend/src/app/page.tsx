"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";

/* ─── Data ─────────────────────────────────────────────────────── */

const STATS = [
  { numEn: "500+",  numAr: "+٥٠٠",  labelEn: "Healthcare Providers", labelAr: "مزود رعاية صحية" },
  { numEn: "50K+",  numAr: "+٥٠ك",  labelEn: "Patients Served",      labelAr: "مريض خُدم"         },
  { numEn: "200+",  numAr: "+٢٠٠",  labelEn: "Specialties",          labelAr: "تخصص طبي"          },
  { numEn: "4.9★",  numAr: "٤.٩★", labelEn: "Average Rating",        labelAr: "متوسط التقييم"     },
];

const SPECIALTIES = [
  { icon: "🫀", nameEn: "Cardiology",      nameAr: "أمراض القلب",    count: 23, color: "#f0e8f5" },
  { icon: "🧴", nameEn: "Dermatology",     nameAr: "الأمراض الجلدية", count: 18, color: "#e8f0f8" },
  { icon: "🦷", nameEn: "Dentistry",       nameAr: "طب الأسنان",     count: 28, color: "#dfe9f3" },
  { icon: "👁️", nameEn: "Ophthalmology",  nameAr: "طب العيون",      count: 12, color: "#e5dff0" },
  { icon: "🧠", nameEn: "Neurology",       nameAr: "طب الأعصاب",     count: 9,  color: "#f5f0fa" },
  { icon: "🦴", nameEn: "Orthopedics",     nameAr: "جراحة العظام",   count: 15, color: "#eaddf5" },
  { icon: "👶", nameEn: "Pediatrics",      nameAr: "طب الأطفال",     count: 31, color: "#e0ebf6" },
  { icon: "🩺", nameEn: "General Medicine",nameAr: "الطب العام",     count: 45, color: "#f2edf8" },
];

const STEPS = [
  {
    num: "01",
    iconEn: "🔍", titleEn: "Find Your Doctor",       descEn: "Search by specialty, location, language, or availability. Filter to find the perfect match.",
               titleAr: "ابحث عن طبيبك",              descAr: "ابحث حسب التخصص أو الموقع أو اللغة أو التوفر. فلتر للعثور على التطابق المثالي.",
  },
  {
    num: "02",
    iconEn: "📅", titleEn: "Book Instantly",          descEn: "Pick a time slot that works for you and confirm in seconds — no calls, no waiting.",
               titleAr: "احجز فوراً",                  descAr: "اختر الوقت المناسب وأكد الحجز في ثوانٍ — بدون مكالمات أو انتظار.",
  },
  {
    num: "03",
    iconEn: "✅", titleEn: "Check In & Visit",        descEn: "Check in from your phone before you arrive. Get real-time queue updates.",
               titleAr: "سجل الدخول وزر طبيبك",       descAr: "سجل الدخول من هاتفك قبل وصولك. احصل على تحديثات الطابور الفورية.",
  },
];

const FEATURES = [
  { icon: "🔒", gradFrom: "#2E1A47", gradTo: "#46255f",
    titleEn: "Secure Health Records",   titleAr: "سجلات صحية آمنة",
    descEn:  "Military-grade encryption keeps your medical history, prescriptions, and documents private.",
    descAr:  "تشفير عالي المستوى يحافظ على خصوصية تاريخك الطبي والوصفات والوثائق." },
  { icon: "👨‍👩‍👧‍👦", gradFrom: "#DFC8E7", gradTo: "#C3D7EE",
    titleEn: "Family Account",          titleAr: "حساب عائلي",
    descEn:  "Manage appointments for your whole family — children, parents, everyone — from one account.",
    descAr:  "أدر مواعيد عائلتك كلها — الأطفال والآباء والجميع — من حساب واحد." },
  { icon: "🤖", gradFrom: "#C3D7EE", gradTo: "#2E1A47",
    titleEn: "AI Doctor Suggestions",   titleAr: "اقتراحات الطبيب بالذكاء الاصطناعي",
    descEn:  "Describe your symptoms and get smart recommendations for the right specialist.",
    descAr:  "صف أعراضك واحصل على توصيات ذكية للمتخصص المناسب." },
  { icon: "📊", gradFrom: "#46255f", gradTo: "#2E1A47",
    titleEn: "Live Queue Tracking",     titleAr: "تتبع الطابور المباشر",
    descEn:  "Know your exact position in the queue and estimated wait time, updated in real time.",
    descAr:  "اعرف موضعك الدقيق في الطابور ووقت الانتظار المقدر، محدث في الوقت الفعلي." },
];

const TESTIMONIALS = [
  { avatar: "MA", avatarBg: "#DFC8E7", avatarColor: "#2E1A47",
    nameEn: "Maryam Al-Hinai",    nameAr: "مريم الهنائي",
    roleEn: "Patient",            roleAr: "مريضة",
    textEn: "Found a specialist within minutes and the check-in process was seamless. Best healthcare app I've used.",
    textAr: "وجدت متخصصاً في دقائق وكانت عملية التسجيل سلسة للغاية. أفضل تطبيق رعاية صحية استخدمته.", rating: 5 },
  { avatar: "RK", avatarBg: "#C3D7EE", avatarColor: "#2E1A47",
    nameEn: "Dr. Rashid Al-Kindi", nameAr: "د. راشد الكندي",
    roleEn: "Cardiologist",        roleAr: "طبيب قلب",
    textEn: "Queue management and patient communication are now effortless. My patients love the experience.",
    textAr: "إدارة الطابور والتواصل مع المرضى أصبح بكل سهولة. مرضاي يحبون التجربة.", rating: 5 },
  { avatar: "AL", avatarBg: "#DFC8E7", avatarColor: "#46255f",
    nameEn: "Aisha Al-Lawati",    nameAr: "عائشة اللواتية",
    roleEn: "Mother of 3",        roleAr: "أم لثلاثة أطفال",
    textEn: "Managing appointments for my children and elderly parents in one place is incredibly convenient.",
    textAr: "إدارة مواعيد أطفالي ووالديّ الكبار في مكان واحد مريح جداً.", rating: 5 },
];

/* ─── Animated counter ─────────────────────────────────────────── */
function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => { const e = entries[0]; if (e?.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return inView;
}

/* ─── Page ─────────────────────────────────────────────────────── */
export default function HomePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <div className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] overflow-x-hidden">
      <HomeNav />

      {/* ═══════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">

        {/* Animated gradient bg */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 inset-x-0 h-full"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(70,37,95,0.18) 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 left-[-20%] w-[60%] h-[60%] rounded-full opacity-10 dark:opacity-20"
            style={{ background: "radial-gradient(circle, #DFC8E7, transparent)", filter: "blur(80px)" }} />
          <div className="absolute top-[30%] right-[-10%] w-[40%] h-[40%] rounded-full opacity-10 dark:opacity-15"
            style={{ background: "radial-gradient(circle, #C3D7EE, transparent)", filter: "blur(60px)" }} />
        </div>

        {/* Floating decoration dots */}
        <div className="absolute top-32 left-[8%] w-3 h-3 rounded-full bg-[#DFC8E7] opacity-60 animate-bounce" style={{ animationDelay: "0s", animationDuration: "3s" }} />
        <div className="absolute top-48 right-[12%] w-2 h-2 rounded-full bg-[#C3D7EE] opacity-40 animate-bounce" style={{ animationDelay: "1s", animationDuration: "4s" }} />
        <div className="absolute bottom-32 left-[15%] w-2 h-2 rounded-full bg-[#DFC8E7] opacity-50 animate-bounce" style={{ animationDelay: "2s", animationDuration: "3.5s" }} />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold mb-8 border"
            style={{ background: "rgba(223,200,231,0.25)", borderColor: "rgba(223,200,231,0.5)", color: "#46255f", backdropFilter: "blur(8px)" }}
            >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="dark:text-[#DFC8E7]">
              {ar ? "موثوق به من أكثر من ٥٠٠ مزود رعاية صحية في عمان" : "Trusted by 500+ Healthcare Providers across Oman"}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6 font-serif">
            <span className="block text-[#2E1A47] dark:text-white">
              {ar ? "الرعاية الصحية" : "Healthcare,"}
            </span>
            <span className="block" style={{
              background: "linear-gradient(135deg, #46255f 0%, #2E1A47 60%, #46255f 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
            }}>
              {ar ? "بكل بساطة." : "Made Simple."}
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 max-w-2xl mx-auto mb-10 leading-relaxed">
            {ar
              ? "ابحث عن الطبيب المناسب، احجز فوراً، وأدر صحة عائلتك بأكملها — كل ذلك من منصة واحدة."
              : "Find the right doctor, book instantly, and manage your entire family's health — all from one beautiful platform."}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14 items-center">
            <Link href="/sign-up"
              className="inline-flex items-center justify-center px-10 py-4 font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase"
              style={{ background: "#DFC8E7", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 8px 28px rgba(223,200,231,0.45)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                {ar ? "ابدأ مجاناً" : "Get Started Free"}
                <span style={{ direction: "ltr" }}>→</span>
              </span>
            </Link>
            <Link href="/sign-in"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-2xl font-bold text-sm no-underline border-2 border-[#2E1A47]/20 dark:border-[#DFC8E7]/20 text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#2E1A47] dark:hover:border-[#DFC8E7] hover:bg-[#2E1A47]/5 active:scale-[0.97] transition-all">
              {ar ? "تسجيل الدخول" : "Sign In"}
            </Link>
          </div>

          {/* Search bar */}
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 bg-white dark:bg-[#1a1030] rounded-2xl px-5 py-4 shadow-2xl border border-[#e7dcee] dark:border-[#3a2560]"
              style={{ boxShadow: "0 20px 60px rgba(46,26,71,0.12)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #2E1A47, #46255f)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <input readOnly
                className="flex-1 bg-transparent outline-none text-sm text-[#2E1A47] dark:text-[#DFC8E7] placeholder:text-[#2E1A47]/35 dark:placeholder:text-[#DFC8E7]/35 cursor-text"
                placeholder={ar ? "ابحث عن الأطباء، التخصصات، المستشفيات..." : "Search doctors, specialties, hospitals…"} />
              <button className="px-6 py-2.5 text-sm font-bold text-[#2E1A47] flex-shrink-0 hover:opacity-90 active:scale-[0.97] transition-all tracking-wider uppercase"
                style={{ background: "#DFC8E7", transform: "skewX(-12deg)", borderRadius: "8px" }}>
                <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>
                  {ar ? "بحث" : "Search"}
                </span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-3">
              {(ar
                ? ["أمراض القلب", "الجلدية", "طب الأطفال", "طب الأسنان"]
                : ["Cardiologist", "Dermatologist", "Pediatrician", "Dentist"]
              ).map((tag) => (
                <button key={tag}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 hover:bg-[#2E1A47]/5 dark:hover:bg-white/5 transition-colors">
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Floating stats cards */}
        <div className="relative z-10 mt-16 w-full max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.labelEn}
              className="flex flex-col items-center p-4 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/80 dark:bg-[#1a1030]/80 text-center hover:shadow-lg transition-all"
              style={{ backdropFilter: "blur(12px)" }}>
              <span className="text-2xl font-black font-serif text-[#2E1A47] dark:text-[#DFC8E7]">
                {ar ? s.numAr : s.numEn}
              </span>
              <span className="text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mt-0.5">
                {ar ? s.labelAr : s.labelEn}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{ background: "#DFC8E7", color: "#2E1A47" }}>
              {ar ? "كيف يعمل" : "How It Works"}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-[#2E1A47] dark:text-[#DFC8E7]">
              {ar ? "ثلاث خطوات بسيطة" : "Three Simple Steps"}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-10 left-[16%] right-[16%] h-0.5"
              style={{ background: "linear-gradient(90deg, #DFC8E7, #46255f, #DFC8E7)" }} />

            {STEPS.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center group">
                <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg transition-transform group-hover:-translate-y-1"
                  style={{ background: i === 1 ? "linear-gradient(135deg, #2E1A47, #46255f)" : "linear-gradient(135deg, #DFC8E7, #C3D7EE)" }}>
                  <span>{step.iconEn}</span>
                  <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-md"
                    style={{ background: "linear-gradient(135deg, #46255f, #2E1A47)" }}>
                    {step.num}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">
                  {ar ? step.titleAr : step.titleEn}
                </h3>
                <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 leading-relaxed max-w-xs">
                  {ar ? step.descAr : step.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          SPECIALTIES
      ═══════════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{ background: "#DFC8E7", color: "#2E1A47" }}>
              {ar ? "التخصصات" : "Specialties"}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-[#2E1A47] dark:text-[#DFC8E7]">
              {ar ? "تصفح حسب التخصص" : "Browse by Specialty"}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SPECIALTIES.map((sp) => (
              <button key={sp.nameEn}
                className="group relative flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-transparent
                  hover:border-[#2E1A47] hover:shadow-xl transition-all duration-300 text-center overflow-hidden"
                style={{ background: sp.color + "cc" }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(135deg, rgba(46,26,71,0.06), transparent)" }} />
                <span className="relative z-10 text-4xl drop-shadow-sm">{sp.icon}</span>
                <div className="relative z-10">
                  <p className="font-bold text-sm text-[#2E1A47]">{ar ? sp.nameAr : sp.nameEn}</p>
                  <p className="text-xs text-[#2E1A47]/55 mt-0.5">{sp.count} {ar ? "طبيب" : "doctors"}</p>
                </div>
                <div className="relative z-10 w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(46,26,71,0.1)" }}>
                  <div className="h-full rounded-full transition-all duration-500 group-hover:w-full"
                    style={{ width: `${(sp.count / 50) * 100}%`, background: "linear-gradient(90deg, #46255f, #2E1A47)" }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FEATURES
      ═══════════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{ background: "#DFC8E7", color: "#2E1A47" }}>
              {ar ? "المميزات" : "Features"}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-[#2E1A47] dark:text-[#DFC8E7]">
              {ar ? "كل ما تحتاجه" : "Everything You Need"}
            </h2>
            <p className="mt-3 text-base text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 max-w-lg mx-auto">
              {ar
                ? "منصة رعاية صحية شاملة مصممة للمرضى والأطباء والمنشآت الطبية."
                : "A comprehensive healthcare platform designed for patients, doctors, and facilities."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div key={f.titleEn}
                className="group relative p-8 rounded-3xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#f9f4fa] dark:bg-[#1a1030] overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                {/* bg gradient glow */}
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
                  style={{ background: `radial-gradient(circle, ${f.gradFrom}, transparent)` }} />

                <div className="relative z-10 flex items-start gap-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${f.gradFrom}, ${f.gradTo})` }}>
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">
                      {ar ? f.titleAr : f.titleEn}
                    </h3>
                    <p className="text-sm text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 leading-relaxed">
                      {ar ? f.descAr : f.descEn}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════ */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{ background: "#DFC8E7", color: "#2E1A47" }}>
              {ar ? "آراء المستخدمين" : "Testimonials"}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-[#2E1A47] dark:text-[#DFC8E7]">
              {ar ? "ماذا يقول مستخدمونا" : "What Our Users Say"}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map((tm) => (
              <div key={tm.nameEn}
                className="group relative flex flex-col p-7 rounded-3xl border border-[#e7dcee] dark:border-[#3a2560]
                  bg-white dark:bg-[#1a1030] hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                {/* Large quote mark */}
                <div className="absolute top-4 right-5 text-7xl font-serif leading-none opacity-8 dark:opacity-5 select-none pointer-events-none"
                  style={{ color: "#DFC8E7" }}>
                  &ldquo;
                </div>

                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: tm.rating }).map((_, i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>

                <p className="relative z-10 text-sm text-[#2E1A47]/75 dark:text-[#DFC8E7]/75 leading-relaxed mb-6 flex-1">
                  "{ar ? tm.textAr : tm.textEn}"
                </p>

                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 shadow-md"
                    style={{ background: tm.avatarBg, color: tm.avatarColor }}>
                    {tm.avatar}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7]">
                      {ar ? tm.nameAr : tm.nameEn}
                    </p>
                    <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
                      {ar ? tm.roleAr : tm.roleEn}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          CTA BANNER
      ═══════════════════════════════════════════════════ */}
      <section className="py-8 px-6 pb-20">
        <div className="max-w-4xl mx-auto relative overflow-hidden rounded-3xl p-12 text-center"
          style={{ background: "linear-gradient(135deg, #2E1A47 0%, #46255f 60%, #2E1A47 100%)", boxShadow: "0 30px 80px rgba(46,26,71,0.4)" }}>
          {/* Decorative orbs */}
          <div className="absolute top-[-40px] left-[-40px] w-40 h-40 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #DFC8E7, transparent)" }} />
          <div className="absolute bottom-[-30px] right-[-30px] w-32 h-32 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, #C3D7EE, transparent)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-5"
            style={{ background: "radial-gradient(circle, #ffffff, transparent)" }} />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
              style={{ background: "rgba(223,200,231,0.2)", color: "#DFC8E7", border: "1px solid rgba(223,200,231,0.3)" }}>
              🚀 {ar ? "انضم اليوم — مجاناً تماماً" : "Join Today — Completely Free"}
            </div>

            <h2 className="text-3xl sm:text-4xl font-black font-serif text-white mb-4">
              {ar ? "هل أنت مستعد للسيطرة على صحتك؟" : "Ready to Take Control of Your Health?"}
            </h2>
            <p className="text-base mb-10 max-w-lg mx-auto" style={{ color: "rgba(223,200,231,0.75)" }}>
              {ar
                ? "انضم إلى آلاف المرضى ومزودي الخدمات الصحية الذين يستخدمون MediLink بالفعل."
                : "Join thousands of patients and healthcare providers already using MediLink."}
            </p>

            <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
              <Link href="/sign-up"
                className="inline-flex items-center justify-center px-10 py-4 font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase"
                style={{ background: "#DFC8E7", transform: "skewX(-12deg)", borderRadius: "10px" }}>
                <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>
                  {ar ? "إنشاء حساب مجاني" : "Find Your Care"}
                </span>
              </Link>
              <Link href="/sign-in"
                className="inline-flex items-center justify-center gap-2 px-9 py-4 font-bold text-sm no-underline transition-all"
                style={{ border: "2px solid rgba(223,200,231,0.4)", color: "#DFC8E7", borderRadius: "16px" }}
                onMouseEnter={e => { if (e.currentTarget) e.currentTarget.style.background = "rgba(223,200,231,0.1)"; }}
                onMouseLeave={e => { if (e.currentTarget) e.currentTarget.style.background = "transparent"; }}>
                {ar ? "تسجيل الدخول" : "Sign In"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-[#e7dcee] dark:border-[#2a1c44] pt-12 pb-8 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Footer top: logo + CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-8 mb-10">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                <img src="/logo/submark-icon.png" alt="Medilink" className="w-full h-full object-cover" />
              </div>
              <img src="/logo/wordmark-violet.svg" alt="Medilink" className="h-5 w-auto dark:hidden" />
              <img src="/logo/wordmark-lavender.svg" alt="Medilink" className="h-5 w-auto hidden dark:block" />
            </div>

            {/* CTA button */}
            <Link href="/sign-up"
              className="inline-flex items-center justify-center px-10 py-3.5 font-bold text-xs text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase"
              style={{ background: "#DFC8E7", transform: "skewX(-12deg)", borderRadius: "10px" }}>
              <span style={{ display: "inline-block", transform: "skewX(12deg)" }}>
                {ar ? "ابدأ الآن" : "Find Your Care"}
              </span>
            </Link>
          </div>

          {/* Footer bottom: links + copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-[#e7dcee]/60 dark:border-[#2a1c44]/60">
            <div className="flex gap-6 text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">
              <a href="#" className="hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">{ar ? "الخصوصية" : "Privacy"}</a>
              <a href="#" className="hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">{ar ? "الشروط" : "Terms"}</a>
              <a href="#" className="hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors">{ar ? "الدعم" : "Support"}</a>
            </div>
            <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
              © 2026 Medilink. {ar ? "جميع الحقوق محفوظة." : "All rights reserved."}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
