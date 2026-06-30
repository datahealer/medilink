"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";
import { HomeFooter } from "@/components/home/HomeFooter";

const FEATURES = [
  { icon: "🗓️", en: "Team calendar",        ar: "تقويم الفريق",
    descEn: "One unified view of all doctors, rooms, and appointments. Colour-coded, drag-and-drop, real time.",
    descAr: "عرض موحّد لجميع الأطباء والغرف والمواعيد. بألوان وسحب وإفلات في الوقت الفعلي." },
  { icon: "📋", en: "Live patient queue",    ar: "طابور مباشر",
    descEn: "Patients check in from their phones. Your front desk sees the queue update in real time.",
    descAr: "يسجّل المرضى دخولهم من هواتفهم ويرى الاستقبال الطابور يتحدث فوراً." },
  { icon: "👥", en: "Doctor onboarding",     ar: "إضافة الأطباء",
    descEn: "Add doctors and technicians in minutes. MoH licence verification is automatic.",
    descAr: "أضف أطباء وفنيين في دقائق مع التحقق التلقائي من رخصة وزارة الصحة." },
  { icon: "📊", en: "Revenue & analytics",   ar: "الإيرادات والتحليلات",
    descEn: "Daily, weekly, and monthly reports. Appointment volume, revenue, no-show rates, and trends.",
    descAr: "تقارير يومية وأسبوعية وشهرية: الحجوزات والإيرادات ومعدلات الغياب." },
  { icon: "💳", en: "Payments via Thawani",  ar: "المدفوعات عبر ثواني",
    descEn: "Integrated Thawani & Drupay. Patients pay before arriving — no cash, no queues at reception.",
    descAr: "دمج كامل مع ثواني ودرباي. يدفع المرضى قبل الوصول — لا نقد ولا طوابير." },
  { icon: "⭐", en: "Verified reviews",       ar: "تقييمات موثّقة",
    descEn: "After every visit, patients rate their experience. Reviews are verified and public.",
    descAr: "بعد كل زيارة يقيّم المرضى تجربتهم. التقييمات موثّقة وعامة." },
];

const STEPS = [
  { num: "01", en: "Register your clinic",   ar: "سجّل عيادتك",
    descEn: "Fill in your clinic details — name, location, specialties, and MoH number.",
    descAr: "أدخل بيانات عيادتك: الاسم والموقع والتخصصات ورقم وزارة الصحة." },
  { num: "02", en: "Add your team",          ar: "أضف فريقك",
    descEn: "Invite doctors and admin staff. Each gets their own role and calendar view.",
    descAr: "ادعُ الأطباء والطاقم الإداري. لكل عضو دوره وعرض تقويمه الخاص." },
  { num: "03", en: "Go live in 24 hrs",      ar: "ابدأ خلال 24 ساعة",
    descEn: "After a quick verification call, your clinic appears in Medilink search results.",
    descAr: "بعد مكالمة تحقق سريعة، تظهر عيادتك في نتائج البحث على ميديلينك." },
];

export default function ForClinicsPage() {
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
            {ar ? "للعيادات" : "For Clinics"}
          </span>
          <h1 className="font-black font-serif text-[#2E1A47] dark:text-white mb-6"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.06 }}>
            {ar
              ? <>عيادتك، أسهل<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">من أي وقت مضى.</em></>
              : <>Your clinic, running<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">smoother than ever.</em></>}
          </h1>
          <p className="text-base text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 max-w-xl leading-relaxed mb-10">
            {ar
              ? "ميديلينك يمنح عيادتك تقويماً موحداً وطابوراً مباشراً ومدفوعات مدمجة وتحليلات في الوقت الفعلي — كل ذلك من لوحة تحكم واحدة."
              : "Medilink gives your clinic a unified calendar, live patient queue, integrated payments, and real-time analytics — all from one dashboard."}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/sign-up"
              className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
              style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                {ar ? "سجّل عيادتك →" : "Register your clinic →"}
              </span>
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-9 py-4 rounded-2xl font-bold text-sm no-underline border-2 border-[#2E1A47]/14 dark:border-[#DFC8E7]/14 text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#2E1A47]/35 dark:hover:border-[#DFC8E7]/35 hover:bg-[#2E1A47]/5 active:scale-[0.97] transition-all">
              {ar ? "تحدث مع فريقنا" : "Talk to our team"}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 bg-white dark:bg-[#0d0820]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-black font-serif text-[#2E1A47] dark:text-white mb-12"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>
            {ar ? "كل ما تحتاجه لإدارة عيادة ناجحة." : "Everything you need to run a great clinic."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.en}
                className="p-6 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#241540] border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center text-lg mb-4 shadow-sm">
                  {f.icon}
                </div>
                <h3 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] mb-2 font-serif">
                  {ar ? f.ar : f.en}
                </h3>
                <p className="text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed">
                  {ar ? f.descAr : f.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How to join ── */}
      <section className="py-20" dir={ar ? "rtl" : "ltr"}
        style={{ background: "linear-gradient(140deg, #1e1038, #2E1A47, #1e1038)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "كيف تنضم" : "How to join"}
          </p>
          <h2 className="font-black font-serif text-white mb-12" style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>
            {ar ? "ثلاث خطوات فقط." : "Just three steps."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {STEPS.map(s => (
              <div key={s.num}>
                <p className="text-4xl font-black font-serif mb-4 leading-none" style={{ color: "rgba(223,200,231,0.2)" }}>
                  {s.num}
                </p>
                <h3 className="text-lg font-bold text-white mb-2 font-serif">{ar ? s.ar : s.en}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(223,200,231,0.58)" }}>
                  {ar ? s.descAr : s.descEn}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link href="/sign-up"
              className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
              style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.35)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                {ar ? "ابدأ التسجيل →" : "Start registration →"}
              </span>
            </Link>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
