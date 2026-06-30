"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { HomeNav } from "@/components/home/HomeNav";
import { HomeFooter } from "@/components/home/HomeFooter";

/* ─── Data ──────────────────────────────────────────────────────── */

const WHY_FEATURES = [
  { icon: "⚡", titleEn: "Book in seconds",            titleAr: "احجز في ثوانٍ",
    descEn: "Search by specialty, clinic, or symptom. Double-booking protection and instant confirmation via SMS, email, and WhatsApp.",
    descAr: "ابحث حسب التخصص أو العيادة أو الأعراض. تأكيد فوري برسالة نصية أو بريد إلكتروني." },
  { icon: "🩺", titleEn: "A doctor for every concern", titleAr: "طبيب لكل مشكلة",
    descEn: "Describe your symptoms — our AI symptom checker guides you to the right care and specialty.",
    descAr: "صف أعراضك وسيوجهك الذكاء الاصطناعي للرعاية والتخصص المناسب." },
  { icon: "📋", titleEn: "Records that travel with you",titleAr: "سجلات في كل مكان",
    descEn: "Photos, lab results, and visit summaries live in your private vault — shared via a secure 24-hour link.",
    descAr: "الصور والنتائج وملخصات الزيارات في خزنتك الخاصة." },
  { icon: "💬", titleEn: "Care after the visit",        titleAr: "الرعاية بعد الزيارة",
    descEn: "Message your doctor securely for 7 days after every appointment for quick follow-up questions.",
    descAr: "راسل طبيبك بأمان لمدة 7 أيام بعد كل موعد." },
];

const STEPS = [
  { num: "01", titleEn: "Find",      titleAr: "ابحث",
    descEn: "Search by specialty, browse trusted clinics, or describe your symptoms to our AI.",
    descAr: "ابحث حسب التخصص أو أعراضك." },
  { num: "02", titleEn: "Book",      titleAr: "احجز",
    descEn: "Pick a slot in real time, choose in-person or video, and pay securely via OMR.",
    descAr: "اختر موعداً وادفع بأمان." },
  { num: "03", titleEn: "Visit",     titleAr: "زر",
    descEn: "Check in from your phone, join a video call, or arrive at the clinic ready to go.",
    descAr: "سجّل دخولك وزر طبيبك." },
  { num: "04", titleEn: "Follow up", titleAr: "المتابعة",
    descEn: "Receive a plain-English visit summary, digital prescription, and lab results.",
    descAr: "اقرأ ملخص زيارتك ووصفتك الرقمية." },
];

const ROLES = [
  { num: "01", active: false,
    titleEn: "For patients", titleAr: "للمرضى",
    featuresEn: ["Search & book trusted doctors","Family profiles (up to 5)","AI symptom checker","Document vault & prescriptions"],
    featuresAr: ["ابحث واحجز أطباء موثوقين","ملفات عائلية حتى 5 أفراد","فاحص الأعراض بالذكاء الاصطناعي","خزنة المستندات والوصفات"],
    ctaEn: "Open patient app →", ctaAr: "افتح تطبيق المريض →" },
  { num: "02", active: true,
    titleEn: "For clinics",  titleAr: "للعيادات",
    featuresEn: ["Team calendar & live queue","Doctor & technician onboarding","Earnings & analytics","Reviews and announcements"],
    featuresAr: ["تقويم الفريق وطابور مباشر","تعداد الأطباء والفنيين","الأرباح والتحليلات","التقييمات والإعلانات"],
    ctaEn: "See clinic dashboard →", ctaAr: "شاهد لوحة العيادة →" },
  { num: "03", active: false,
    titleEn: "For doctors",  titleAr: "للأطباء",
    featuresEn: ["Status toggle in real time","Patient history at a glance","Video consults via Daily.co","AI-assisted visit summaries"],
    featuresAr: ["تبديل الحالة في الوقت الفعلي","تاريخ المريض بلمحة","استشارات مرئية","ملخصات الزيارة بالذكاء الاصطناعي"],
    ctaEn: "Explore for doctors →", ctaAr: "استكشف للأطباء →" },
];

const DOCTORS = [
  { initials: "AH", bg: "from-[#e8d5f0] to-[#d5e8f5]",
    nameEn: "Dr. Aisha Al Harthy",  nameAr: "د. عائشة الحارثي",
    specEn: "General Care · Al Huwair", specAr: "طب عام · الحويرة",
    rating: 4.9, priceEn: "From OMR 12", priceAr: "من 12 ريال" },
  { initials: "OB", bg: "from-[#d5e8f5] to-[#e8d5f0]",
    nameEn: "Dr. Omar Al Balushi",  nameAr: "د. عمر البلوشي",
    specEn: "Cardiology · Gurum Heart Centre", specAr: "قلب · مركز قرم",
    rating: 4.8, priceEn: "From OMR 18", priceAr: "من 18 ريال" },
  { initials: "FR", bg: "from-[#ede0f8] to-[#d5e8f5]",
    nameEn: "Dr. Fatma Al Riyami", nameAr: "د. فاطمة الريامي",
    specEn: "Dermatology · Skin & Co. Clinic", specAr: "جلدية · عيادة سكين",
    rating: 4.9, priceEn: "From OMR 15", priceAr: "من 15 ريال" },
];

const TESTIMONIALS = [
  { textEn: "\"Booked a same-day visit for my mother in under a minute. The visit summary was easy to read — finally.\"",
    textAr: "\"حجزت زيارة في نفس اليوم لوالدتي في أقل من دقيقة. ملخص الزيارة كان سهل القراءة — أخيراً.\"",
    authorEn: "— Mariam, Muscat", authorAr: "— مريم، مسقط" },
  { textEn: "\"Our front desk runs the whole day from the team calendar. The live queue is a quiet kind of magic.\"",
    textAr: "\"مكتب الاستقبال لدينا يدير اليوم كله من تقويم الفريق. الطابور المباشر نوع هادئ من السحر.\"",
    authorEn: "— Dr. Khaled, Clinic Director", authorAr: "— د. خالد، مدير العيادة" },
  { textEn: "\"Lab results in the patient's app before they leave the building. Patients notice this stuff.\"",
    textAr: "\"نتائج المختبر في تطبيق المريض قبل أن يغادر المبنى. المرضى يلاحظون هذه الأشياء.\"",
    authorEn: "— Lab Technician", authorAr: "— فني المختبر" },
];

const MARQUEE = [
  "Find · Book · Connect", "Bilingual care", "Verified clinicians",
  "Digital prescriptions", "Secure document vault", "AI symptom guidance", "Family accounts",
];

/* ─── Section label pill ─────────────────────────────────────────── */
function SectionPill({ en, ar: arText, isAr }: { en: string; ar: string; isAr: boolean }) {
  return (
    <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
      style={{ background: "#DFC8E7", color: "#2E1A47" }}>
      {isAr ? arText : en}
    </span>
  );
}

/* ─── Brand CTA button (skewed) ─────────────────────────────────── */
function BrandCTA({ href, en, ar: arText, isAr, outline }: { href: string; en: string; ar: string; isAr: boolean; outline?: boolean }) {
  if (outline) {
    return (
      <Link href={href}
        className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-2xl font-bold text-sm no-underline border-2 border-[#2E1A47]/14 dark:border-[#DFC8E7]/14 text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#2E1A47]/35 dark:hover:border-[#DFC8E7]/35 hover:bg-[#2E1A47]/5 active:scale-[0.97] transition-all">
        {isAr ? arText : en}
      </Link>
    );
  }
  return (
    <Link href={href}
      className="inline-flex items-center justify-center font-bold text-sm text-[#2E1A47] no-underline hover:opacity-90 active:scale-[0.97] transition-all tracking-widest uppercase px-10 py-4"
      style={{ backgroundImage: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)", transform: "skewX(-12deg)", borderRadius: "10px", boxShadow: "0 10px 32px rgba(223,200,231,0.45)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", transform: "skewX(12deg)" }}>
        {isAr ? arText : en} <span style={{ direction: "ltr" }}>→</span>
      </span>
    </Link>
  );
}

/* ─── Hero card ─────────────────────────────────────────────────── */
function HeroCard({ ar }: { ar: boolean }) {
  return (
    <div className="relative select-none">
      <div className="bg-white rounded-2xl border border-[#ece4f4] p-5"
        style={{ boxShadow: "0 24px 80px rgba(46,26,71,0.13), 0 0 0 1px rgba(46,26,71,0.04)" }}>

        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 mb-2">
          {ar ? "الموعد القادم" : "Next Appointment"}
        </p>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#faf8fc] mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #DFC8E7, #C3D7EE)", color: "#2E1A47" }}>AH</div>
          <div>
            <p className="text-sm font-bold text-[#2E1A47]">{ar ? "د. عائشة الحارثي" : "Dr. Aisha Al Harthy"}</p>
            <p className="text-xs text-[#2E1A47]/45">{ar ? "طب عام · الحويرة" : "General Care · Al Huwair"}</p>
          </div>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 mb-2">
          {ar ? "نتائج المختبر" : "Lab Results"}
        </p>
        <div className="flex items-center gap-3 p-3 rounded-xl border border-[#ece4f4] mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#f0e8f5] flex items-center justify-center text-sm flex-shrink-0">📊</div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#2E1A47]">{ar ? "CBC جاهزة" : "CBC Ready"}</p>
            <p className="text-[10px] text-[#2E1A47]/40">{ar ? "تم التسليم للتطبيق" : "Delivered to your app"}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 mb-2">
          {ar ? "فاحص الأعراض" : "AI Symptom Check"}
        </p>
        <div className="p-3 rounded-xl bg-[#faf8fc] border border-[#ece4f4] mb-4">
          <p className="text-xs text-[#2E1A47]/60 mb-2 italic">
            {ar ? "\"أشعر بضيق في الصدر منذ الأمس\"" : "\"Mild sore throat & fever since yesterday.\""}
          </p>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#f0e8f5]">
            <span className="text-sm">🩺</span>
            <div>
              <p className="text-xs font-semibold text-[#2E1A47]">{ar ? "اقتراح: الطب العام" : "Suggested: General Care"}</p>
              <p className="text-[10px] text-[#2E1A47]/45">{ar ? "٣ أطباء متاحون" : "3 doctors available today"}</p>
            </div>
          </div>
        </div>

        <div className="w-full py-3 rounded-xl text-sm font-bold text-white text-center"
          style={{ background: "linear-gradient(135deg, #2E1A47, #46255f)" }}>
          {ar ? "تسجيل الدخول ←" : "Check in →"}
        </div>
      </div>

      <div className="absolute -bottom-4 -left-5 flex items-center gap-2 bg-white rounded-xl px-3.5 py-2.5 border border-[#ece4f4]"
        style={{ boxShadow: "0 8px 30px rgba(46,26,71,0.12)" }}>
        <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-sm flex-shrink-0">✅</div>
        <div>
          <p className="text-xs font-bold text-[#2E1A47] whitespace-nowrap">{ar ? "أنت رقم ٢ في الطابور" : "You're #2 in queue"}</p>
          <p className="text-[10px] text-[#2E1A47]/40">~12 min</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────── */
export default function HomePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] overflow-x-hidden">
      <HomeNav />

      {/* ══════════ HERO ══════════ */}
      <section className="relative min-h-screen flex items-center pt-24 pb-16 overflow-hidden bg-[#faf8fc] dark:bg-[#0a0518]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-8%] right-[-6%] w-[550px] h-[550px] rounded-full opacity-40 dark:opacity-15"
            style={{ background: "radial-gradient(circle, #e8d5f0, transparent 70%)", filter: "blur(90px)" }} />
          <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-30 dark:opacity-10"
            style={{ background: "radial-gradient(circle, #d5e8f5, transparent 70%)", filter: "blur(80px)" }} />
        </div>

        <div className="relative z-10 w-full max-w-6xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium  border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030] shadow-sm text-[#46255f] dark:text-[#DFC8E7]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            {ar ? "نرحّب الآن بالعيادات في جميع أنحاء عمان" : "Now welcoming clinics across Oman"}
          </div>

          <div className={`flex flex-col gap-16 lg:gap-14 items-center ${ar ? "lg:flex-row-reverse" : "lg:flex-row"}`}>
            {/* Left */}
            <div className="flex-1 max-w-xl lg:max-w-none">
              <h1 className="font-black leading-[1.06] tracking-tight mb-6 font-serif text-[#2E1A47] dark:text-white"
                style={{ fontSize: "clamp(2.8rem, 5vw, 4.6rem)" }}>
                {ar ? (
                  <>
                    <span className="block">{ar ? "رابطك للرعاية" : "Your link to"}</span>
                    <span className="block italic text-[#46255f] dark:text-[#DFC8E7]">
                      {ar ? "الصحية الأفضل." : "better care."}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">Your link to</span>
                    <span className="block italic text-[#46255f] dark:text-[#DFC8E7]">better care.</span>
                  </>
                )}
              </h1>

              <p className="text-base leading-relaxed mb-8 max-w-md text-[#2E1A47]/60 dark:text-[#DFC8E7]/60">
                {ar
                  ? "ابحث عن أطباء موثوقين، احجز في ثوانٍ، واحتفظ بكل وصفة وتقرير مختبر وزيارة في مكان رقمي هادئ واحد."
                  : "Find trusted doctors, book in seconds, and keep every prescription, lab report, and visit summary in one calm digital home. Medilink makes healthcare simpler, and more human."}
              </p>

              <div className={`flex flex-col sm:flex-row gap-4 mb-10 ${ar ? "sm:flex-row-reverse" : ""}`}>
                <BrandCTA href="/sign-up" en="Find your care" ar="ابحث عن رعايتك" isAr={ar} />
                <BrandCTA href="/sign-up" en="I'm a clinic" ar="أنا عيادة" isAr={ar} outline />
              </div>

              <div className={`flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-[#2E1A47]/42 dark:text-[#DFC8E7]/42 ${ar ? "flex-row-reverse" : ""}`}>
                {(ar
                  ? ["✓ أطباء وتراخيص موثّقة", "✓ مدفوعات OMR عبر ثواني ودرباي", "✓ ثنائي اللغة: عربي وإنجليزي"]
                  : ["✓ Verified physicians & licenses", "✓ OMR payments via Thawani & Drupay", "✓ Bilingual: English & العربية"]
                ).map(t => <span key={t}>{t}</span>)}
              </div>
            </div>

            {/* Right: card */}
            <div className="hidden lg:flex flex-1 items-center justify-end" style={{ padding: "16px 0px 44px 16px" }}>
              <div className="w-full max-w-[400px]">
                <HeroCard ar={ar} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ MARQUEE ══════════ */}
      <section className="py-3.5 overflow-hidden border-y border-[#e7dcee] dark:border-[#2a1c44] bg-white dark:bg-[#0d0820]">
        <div className="flex animate-marquee gap-10 items-center whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={i} className="flex items-center gap-3 flex-shrink-0 text-sm font-medium text-[#2E1A47]/38 dark:text-[#DFC8E7]/38">
              {item} <span className="opacity-30">·</span>
            </span>
          ))}
        </div>
      </section>

      {/* ══════════ WHY MEDILINK ══════════ */}
      <section id="features" className="py-20 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`mb-12 ${ar ? "text-right" : ""}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
              {ar ? "لماذا ميديلينك" : "Why Medilink"}
            </p>
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
              style={{ fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.08 }}>
              {ar
                ? <>Healthcare that feels <em className="italic text-[#46255f] dark:text-[#DFC8E7]">أقرب.</em></>
                : <>Healthcare that feels <em className="italic text-[#46255f] dark:text-[#DFC8E7]">closer.</em></>}
            </h2>
            <p className="text-base text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mt-4 max-w-lg leading-relaxed">
              {ar
                ? "لقد أزلنا الاحتكاك — المكالمات الهاتفية، الأوراق الضائعة، التخمين. ما تبقى طريقة هادئة وحديثة."
                : "We've stripped away the friction — the phone trees, the lost paperwork, the guesswork. What's left is a calm, modern way to find care, manage it, and keep it organised."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WHY_FEATURES.map(f => (
              <div key={f.titleEn}
                className="p-6 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#241540] border border-[#e7dcee] dark:border-[#3a2560] flex items-center justify-center text-lg mb-4 shadow-sm">
                  {f.icon}
                </div>
                <h3 className={`font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] mb-2 leading-snug ${ar ? "text-right" : ""}`}>
                  {ar ? f.titleAr : f.titleEn}
                </h3>
                <p className={`text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed ${ar ? "text-right" : ""}`}>
                  {ar ? f.descAr : f.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ JOURNEY — dark band ══════════ */}
      <section id="how-it-works" className="py-20 px-6"
        style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 50%, #1e1038 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8 mb-14 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(223,200,231,0.45)" }}>
                {ar ? "رحلة ميديلينك" : "The Medilink Journey"}
              </p>
              <h2 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar
                  ? <>أربع خطوات هادئة<br />من القلق إلى الرعاية.</>
                  : <>Four calm steps<br />from concern to care.</>}
              </h2>
            </div>
            <Link href="/sign-up"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm no-underline transition-all flex-shrink-0 self-start sm:self-auto"
              style={{ border: "1.5px solid rgba(223,200,231,0.28)", color: "#DFC8E7" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(223,200,231,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {ar ? "شاهد الخدمات ←" : "See services →"}
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {STEPS.map(step => (
              <div key={step.num}>
                <p className="text-4xl font-black font-serif mb-4 leading-none" style={{ color: "rgba(223,200,231,0.2)" }}>
                  {step.num}
                </p>
                <h3 className="text-lg font-bold text-white mb-2 font-serif">
                  {ar ? step.titleAr : step.titleEn}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(223,200,231,0.58)" }}>
                  {ar ? step.descAr : step.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ ROLES ══════════ */}
      <section id="specialties" className="py-20 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`mb-12 ${ar ? "text-right" : ""}`}>
            <SectionPill en="Platform" ar="المنصة" isAr={ar} />
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
              {ar ? "منصة واحدة. كل الأدوار." : "One platform. Every role."}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ROLES.map(role => (
              <div key={role.titleEn}
                className="relative p-7 rounded-2xl border-2 overflow-hidden"
                style={role.active
                  ? { background: "linear-gradient(150deg, #2E1A47, #46255f)", borderColor: "#46255f" }
                  : { background: "var(--background)", borderColor: "#e7dcee" }}>
                {!role.active && <div className="absolute inset-0 bg-[#faf8fc] dark:bg-[#1a1030] rounded-2xl" />}
                <div className="relative z-10">
                  <p className={`text-xs font-bold uppercase tracking-widest mb-5 ${role.active ? "" : "dark:text-[#DFC8E7]/30"}`}
                    style={{ color: role.active ? "rgba(223,200,231,0.45)" : "rgba(46,26,71,0.3)" }}>
                    {role.num}
                  </p>
                  <h3 className={`text-xl font-bold mb-5 font-serif ${role.active ? "text-white" : "text-[#2E1A47] dark:text-[#DFC8E7]"}`}>
                    {ar ? role.titleAr : role.titleEn}
                  </h3>
                  <ul className="flex flex-col gap-2.5 mb-7">
                    {(ar ? role.featuresAr : role.featuresEn).map(f => (
                      <li key={f} className={`flex items-start gap-2 text-sm ${role.active ? "" : "text-[#2E1A47]/62 dark:text-[#DFC8E7]/62"}`}
                        style={role.active ? { color: "rgba(223,200,231,0.72)" } : {}}>
                        <span className="mt-px flex-shrink-0 font-bold"
                          style={{ color: role.active ? "#DFC8E7" : "#46255f" }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className={`text-sm font-bold transition-opacity hover:opacity-70 ${role.active ? "text-[#DFC8E7]" : "text-[#2E1A47] dark:text-[#DFC8E7]"}`}>
                    {ar ? role.ctaAr : role.ctaEn}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ DOCTORS ══════════ */}
      <section className="py-20 px-6 bg-[#faf8fc] dark:bg-[#0a0518]">
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div>
              <SectionPill en="Trusted Providers" ar="مزودون موثوقون" isAr={ar} />
              <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar ? "تعرف على بعض أطبائنا." : "Meet a few of our clinicians."}
              </h2>
            </div>
            <Link href="/sign-up"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline flex-shrink-0">
              {ar ? "تصفح الكل ←" : "Browse all →"}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {DOCTORS.map(doc => (
              <div key={doc.nameEn}
                className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className={`h-28 flex items-center justify-center bg-gradient-to-br ${doc.bg}`}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black"
                    style={{ background: "rgba(255,255,255,0.75)", color: "#2E1A47" }}>
                    {doc.initials}
                  </div>
                </div>
                <div className="p-5">
                  <div className={`flex items-start justify-between gap-2 mb-1 ${ar ? "flex-row-reverse" : ""}`}>
                    <h3 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7]">
                      {ar ? doc.nameAr : doc.nameEn}
                    </h3>
                    <span className="text-xs font-bold text-amber-500 flex-shrink-0">★ {doc.rating}</span>
                  </div>
                  <p className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-5">
                    {ar ? doc.specAr : doc.specEn}
                  </p>
                  <div className={`flex items-center justify-between ${ar ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-semibold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                      {ar ? doc.priceAr : doc.priceEn}
                    </span>
                    <button className="px-4 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90 transition-opacity"
                      style={{ background: "#2E1A47" }}>
                      {ar ? "احجز الآن" : "Book online"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ TESTIMONIALS ══════════ */}
      <section id="testimonials" className="py-20 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <SectionPill en="Testimonials" ar="آراء المستخدمين" isAr={ar} />
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)" }}>
              {ar ? "ماذا يقول مستخدمونا" : "What our users say"}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((tm, i) => (
              <div key={i} className={`p-7 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] ${ar ? "text-right" : ""}`}>
                <p className="text-sm text-[#2E1A47]/68 dark:text-[#DFC8E7]/68 leading-relaxed mb-5 italic">
                  {ar ? tm.textAr : tm.textEn}
                </p>
                <p className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                  {ar ? tm.authorAr : tm.authorEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FINAL CTA ══════════ */}
      <section className="py-20 px-6" style={{ background: "linear-gradient(140deg, #1e1038, #2E1A47, #1e1038)" }}>
        <div className={`max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-10 ${ar ? "sm:flex-row-reverse" : ""}`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(223,200,231,0.45)" }}>
              {ar ? "ابدأ رحلتك الصحية" : "Start your care journey"}
            </p>
            <h2 className="font-black font-serif text-white" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: 1.08 }}>
              {ar ? (
                <>الرعاية، بهدوء.<br /><em className="italic text-[#DFC8E7]">ابدأ مع ميديلينك.</em></>
              ) : (
                <>Care, made calm.<br /><em className="italic text-[#DFC8E7]">Start with Medilink.</em></>
              )}
            </h2>
          </div>
          <div className="flex flex-col gap-4 flex-shrink-0">
            <BrandCTA href="/sign-up" en="Open the patient app" ar="افتح تطبيق المريض" isAr={ar} />
            <Link href="/sign-in"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-2xl font-bold text-sm no-underline transition-all text-center"
              style={{ border: "1.5px solid rgba(223,200,231,0.28)", color: "rgba(223,200,231,0.82)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(223,200,231,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {ar ? "تحدث مع فريقنا" : "Talk to our team"}
            </Link>
          </div>
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}
