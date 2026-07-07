"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";
import { HomeFooter } from "@/components/home/HomeFooter";

const PATIENT_SERVICES = [
  { icon: "🔍", en: "Smart doctor search",      ar: "بحث ذكي عن الأطباء",
    descEn: "Search by specialty, clinic name, location, language, or symptom. Filter by availability, gender, and insurance.",
    descAr: "ابحث حسب التخصص أو الموقع أو العرض أو الأعراض." },
  { icon: "📅", en: "Instant booking",           ar: "حجز فوري",
    descEn: "Real-time slot selection with double-booking prevention. Confirmation via SMS, email, and WhatsApp.",
    descAr: "اختيار موعد فوري مع تأكيد برسالة نصية أو واتساب." },
  { icon: "🤖", en: "AI symptom checker",        ar: "فاحص الأعراض بالذكاء الاصطناعي",
    descEn: "Describe what you're feeling — our AI guides you to the right specialty and doctor.",
    descAr: "صف ما تشعر به وسيوجهك للتخصص والطبيب المناسب." },
  { icon: "📋", en: "Digital health records",    ar: "السجلات الصحية الرقمية",
    descEn: "Photos, prescriptions, lab results, and visit summaries in one secure encrypted vault.",
    descAr: "الصور والوصفات والنتائج وملخصات الزيارات في مكان آمن." },
  { icon: "💬", en: "Post-visit messaging",      ar: "التواصل بعد الزيارة",
    descEn: "Message your doctor securely for 7 days after every appointment.",
    descAr: "راسل طبيبك بأمان لمدة 7 أيام بعد كل موعد." },
  { icon: "👨‍👩‍👧", en: "Family profiles",          ar: "ملفات عائلية",
    descEn: "Manage health for up to 5 family members from a single Medilink account.",
    descAr: "أدّر صحة حتى 5 أفراد من عائلتك من حساب واحد." },
];

const CLINIC_SERVICES = [
  { icon: "🗓️", en: "Team calendar & live queue",ar: "تقويم الفريق والطابور المباشر",
    descEn: "Unified schedule across all doctors and rooms. Live queue visible on any device.",
    descAr: "جدول موحّد لجميع الأطباء والغرف. طابور مباشر على أي جهاز." },
  { icon: "📊", en: "Earnings & analytics",      ar: "الأرباح والتحليلات",
    descEn: "Real-time revenue reports, patient retention, appointment volume, and no-show rates.",
    descAr: "تقارير إيرادات فورية ومعدلات الحجوزات والغياب." },
  { icon: "⭐", en: "Reviews & reputation",      ar: "التقييمات والسمعة",
    descEn: "Collect verified patient reviews after every visit to build trust with new patients.",
    descAr: "اجمع تقييمات المرضى الموثّقة بعد كل زيارة." },
  { icon: "📢", en: "Announcements",             ar: "الإعلانات",
    descEn: "Push announcements to your patient base — new services, holiday hours, or health tips.",
    descAr: "أرسل إعلانات لمرضاك — خدمات جديدة أو أوقات عطل أو نصائح صحية." },
];

export default function ServicesPage() {
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
            {ar ? "الخدمات" : "Services"}
          </span>
          <h1 className="font-black font-serif text-[#2E1A47] dark:text-white mb-6"
            style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.06 }}>
            {ar
              ? <>كل ما تحتاجه<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">في مكان واحد.</em></>
              : <>Everything you need<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">in one place.</em></>}
          </h1>
          <p className="text-base text-[#2E1A47]/60 dark:text-[#DFC8E7]/60 max-w-xl leading-relaxed">
            {ar
              ? "ميديلينك يقدم خدمات متكاملة للمرضى والعيادات والأطباء — كل شيء مصمم ليكون بسيطاً وهادئاً وفعالاً."
              : "Medilink delivers end-to-end services for patients, clinics, and doctors — all designed to be simple, calm, and effective."}
          </p>
        </div>
      </section>

      {/* ── Patient services ── */}
      <section className="py-20 bg-white dark:bg-[#0d0820]" dir={ar ? "rtl" : "ltr"}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
              style={{ background: "#DFC8E7" }}>🧑‍⚕️</div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
              {ar ? "للمرضى" : "For Patients"}
            </p>
          </div>
          <h2 className="font-black font-serif text-[#2E1A47] dark:text-white mb-10"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>
            {ar ? "خدمات تضع المريض في المركز." : "Services that put you first."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PATIENT_SERVICES.map(s => (
              <div key={s.en}
                className="p-6 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#241540] border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center text-lg mb-4 shadow-sm">
                  {s.icon}
                </div>
                <h3 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] mb-2 font-serif">
                  {ar ? s.ar : s.en}
                </h3>
                <p className="text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed">
                  {ar ? s.descAr : s.descEn}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link href="/sign-up"
              className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
              style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                {ar ? "ابدأ كمريض →" : "Start as a patient →"}
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Clinic services ── */}
      <section className="py-20" dir={ar ? "rtl" : "ltr"}
        style={{ background: "linear-gradient(140deg, #1e1038, #2E1A47, #1e1038)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
              style={{ background: "rgba(223,200,231,0.15)" }}>🏥</div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(223,200,231,0.45)" }}>
              {ar ? "للعيادات" : "For Clinics"}
            </p>
          </div>
          <h2 className="font-black font-serif text-white mb-10"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>
            {ar ? "أدوات تدير عيادتك بهدوء." : "Tools that run your clinic calmly."}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CLINIC_SERVICES.map(s => (
              <div key={s.en}
                className="p-6 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(223,200,231,0.12)" }}>
                <div className="text-2xl mb-4">{s.icon}</div>
                <h3 className="font-bold text-sm text-white mb-2 font-serif">
                  {ar ? s.ar : s.en}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(223,200,231,0.58)" }}>
                  {ar ? s.descAr : s.descEn}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link href="/for-clinics"
              className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
              style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.35)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
                {ar ? "شاهد لوحة العيادة →" : "See clinic dashboard →"}
              </span>
            </Link>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
