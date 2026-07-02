"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/* ─── Data ──────────────────────────────────────────────────────────── */

const MARQUEE_ITEMS = [
  "Find Doctors", "Book in seconds", "Lab Tests", "Verified clinicians",
  "Surgeries", "Digital prescriptions", "Secure records", "AI symptom guidance",
];

const SERVICE_CARDS = [
  { href: "/dashboard/find-doctors", emoji: "👨‍⚕️",
    en: { title: "Find Doctors Near You", desc: "Search by specialty or symptom. Confirmed same-day appointments." },
    ar: { title: "ابحث عن أطباء قريبين",  desc: "ابحث حسب التخصص أو الأعراض. مواعيد مؤكدة في نفس اليوم." },
    from: "#e8d5f0", to: "#c8dff0" },
  { href: "/dashboard/lab-tests", emoji: "🧪",
    en: { title: "Lab Tests",              desc: "Safe and trusted lab tests delivered to your app." },
    ar: { title: "تحاليل مختبرية",         desc: "تحاليل آمنة وموثوقة تُرسَل مباشرة إلى تطبيقك." },
    from: "#d5e8f5", to: "#ede0f8" },
  { href: "/dashboard/surgeries", emoji: "🏥",
    en: { title: "Surgeries",              desc: "Safe and trusted surgery centers across the region." },
    ar: { title: "العمليات الجراحية",       desc: "مراكز جراحية آمنة وموثوقة في جميع أنحاء المنطقة." },
    from: "#ede0f8", to: "#e8d5f0" },
];

type UpItem = {
  initials: string; grad: string;
  en: { name: string; spec: string; date: string; time: string; type: string; status: string };
  ar: { name: string; spec: string; date: string; time: string; type: string; status: string };
};

const UP_GRADS = ["from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]"];
const STATUS_EN: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", checked_in: "Confirmed", approved: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "Cancelled",
};
const STATUS_AR2: Record<string, string> = {
  pending: "معلق", confirmed: "مؤكد", checked_in: "مؤكد", approved: "مؤكد", completed: "مكتمل", cancelled: "ملغى", no_show: "ملغى",
};
const TYPE_EN2: Record<string, string> = { in_person: "In-clinic", online: "Video call", walk_in: "Walk-in" };
const TYPE_AR2: Record<string, string> = { in_person: "في العيادة", online: "مكالمة فيديو", walk_in: "زيارة" };

function upInitials(name: string) {
  const w = name.split(/\s+/).filter((x) => x && !/^dr\.?$/i.test(x));
  return w.slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("") || "DR";
}
function upTime(hhmmss: string) {
  const p = hhmmss.split(":"); const m = p[1] ?? "00"; let h = parseInt(p[0] ?? "0", 10);
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12; if (h === 0) h = 12; return `${h}:${m} ${ap}`;
}
function upDate(ymd: string, isAr: boolean) {
  const MON_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MON_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const d = new Date(`${ymd}T00:00:00`); const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return isAr ? "اليوم" : "Today";
  if (diff === 1) return isAr ? "غداً" : "Tomorrow";
  return isAr ? `${d.getDate()} ${MON_AR[d.getMonth()]}` : `${d.getDate()} ${MON_EN[d.getMonth()]}`;
}

const SPECIALTIES = [
  { emoji: "🤰", en: "Period doubts or Pregnancy",  ar: "تأخر الدورة أو الحمل" },
  { emoji: "😣", en: "Acne, pimple or skin issues", ar: "حب الشباب أو مشاكل الجلد" },
  { emoji: "💊", en: "Performance issues in bed",   ar: "مشاكل الأداء" },
  { emoji: "🤒", en: "Cold, cough or fever",        ar: "برد أو كحة أو حمى" },
  { emoji: "👶", en: "Child not feeling well",      ar: "الطفل لا يشعر بتحسن" },
  { emoji: "😔", en: "Depression or anxiety",       ar: "اكتئاب أو قلق" },
];

const CLINIC_STEPS = [
  { num: "01", en: { t: "Search",   d: "Find by specialty, symptom, or doctor name." },           ar: { t: "ابحث",   d: "ابحث حسب التخصص أو الأعراض أو اسم الطبيب." } },
  { num: "02", en: { t: "Book",     d: "Pick a slot in real time and confirm instantly." },         ar: { t: "احجز",   d: "اختر موعداً في الوقت الفعلي وتأكده فوراً." } },
  { num: "03", en: { t: "Visit",    d: "Check in from your phone or arrive at the clinic." },       ar: { t: "زر",     d: "سجّل حضورك من هاتفك أو اذهب إلى العيادة." } },
  { num: "04", en: { t: "Follow up",d: "Receive your summary, prescription and lab results." },     ar: { t: "تابع",   d: "استلم ملخصك ووصفتك ونتائج تحاليلك." } },
];

const CLINIC_TYPES = [
  { emoji: "🦷", from: "#e8d5f0", to: "#d5e8f5",
    en: { label: "Dentist",              desc: "Teething troubles? Schedule a dental checkup" },
    ar: { label: "طبيب الأسنان",         desc: "مشاكل الأسنان؟ احجز فحصاً" } },
  { emoji: "🤱", from: "#d5e8f5", to: "#ede0f8",
    en: { label: "Gynecologist",         desc: "Women's health, pregnancy and infertility" },
    ar: { label: "طبيب نساء وتوليد",     desc: "صحة المرأة والحمل وعلاج العقم" } },
  { emoji: "🥗", from: "#ede0f8", to: "#d1fae5",
    en: { label: "Dietitian/Nutrition",  desc: "Eating right, weight management & sports nutrition" },
    ar: { label: "أخصائي تغذية",         desc: "الغذاء الصحي وإدارة الوزن" } },
  { emoji: "🏃", from: "#d1fae5", to: "#e8d5f0",
    en: { label: "Physiotherapist",      desc: "Pulled a muscle? Get treated by a specialist" },
    ar: { label: "معالج فيزيائي",        desc: "إصابة عضلية؟ احصل على علاج متخصص" } },
];

const QUICK_ACTIONS = [
  { href: "/dashboard/appointments", emoji: "📅", en: "Book Appointment",   ar: "احجز موعداً",        from: "#e8d5f0", to: "#DFC8E7" },
  { href: "/dashboard/records",      emoji: "📋", en: "My Records",         ar: "سجلاتي",             from: "#d5e8f5", to: "#c8dff0" },
  { href: "/dashboard/lab-tests",    emoji: "🧪", en: "Lab Tests",          ar: "تحاليل مختبرية",     from: "#ede0f8", to: "#d5e8f5" },
  { href: "/dashboard/find-doctors", emoji: "👨‍⚕️", en: "Find a Doctor",    ar: "ابحث عن طبيب",       from: "#d1fae5", to: "#c8dff0" },
];

const HEALTH_METRICS = [
  { icon: "❤️", en: { label: "Heart Rate",     value: "72 bpm",   sub: "Normal" },  ar: { label: "معدل ضربات القلب", value: "٧٢ نبضة/د", sub: "طبيعي" },   color: "from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20",   badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
  { icon: "⚖️", en: { label: "BMI",            value: "22.4",     sub: "Healthy" }, ar: { label: "مؤشر كتلة الجسم",  value: "٢٢.٤",      sub: "صحي" },      color: "from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20",     badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
  { icon: "🩸", en: { label: "Blood Pressure", value: "118/78",   sub: "Normal" },  ar: { label: "ضغط الدم",         value: "١١٨/٧٨",    sub: "طبيعي" },    color: "from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20", badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
  { icon: "💊", en: { label: "Active Rx",      value: "2",        sub: "Ongoing" }, ar: { label: "الأدوية النشطة",    value: "٢",         sub: "جارية" },    color: "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20", badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" },
];

const ARTICLES = [
  { from: "#e8d5f0", to: "#d5e8f5",
    en: { tag: "Coronavirus",             title: "12 Coronavirus Myths and Facts You Should Know" },
    ar: { tag: "كورونا",                  title: "١٢ خرافة وحقيقة عن كورونا يجب أن تعرفها" } },
  { from: "#d5e8f5", to: "#ede0f8",
    en: { tag: "Vitamins & Supplements",  title: "Eating Right to Build Immunity Against Viral Infections" },
    ar: { tag: "فيتامينات ومكملات",       title: "تناول الغذاء الصحيح لبناء المناعة ضد الفيروسات" } },
];

/* ─── SectionPill (matches homepage exactly) ─────────────────────── */
function SectionPill({ en, ar: arText, isAr }: { en: string; ar: string; isAr: boolean }) {
  return (
    <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
      style={{ background: "#DFC8E7", color: "#2E1A47" }}>
      {isAr ? arText : en}
    </span>
  );
}

/* ─── BrandCTA (matches homepage exactly) ───────────────────────── */
function BrandCTA({ href, en, ar: arText, isAr }: { href: string; en: string; ar: string; isAr: boolean }) {
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

/* ─── Page ───────────────────────────────────────────────────────── */
type ApptLite = {
  id: string; status: string; type: string; slot_date: string; slot_start: string | null;
  doctor?: { full_name?: string; specialty?: string } | null;
};

export default function DashboardPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [firstName, setFirstName] = useState("");
  const [upcoming, setUpcoming]   = useState<UpItem[]>([]);
  const [stats, setStats]         = useState({ upcoming: 0, records: 0, pending: 0 });
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [profile, up, rx, labs, docs] = await Promise.all([
          api.profile.getMyProfile(supabase).catch(() => null),
          api.appointments.listMyAppointments(supabase, "upcoming").catch(() => []),
          api.prescriptions.listPrescriptions(supabase).catch(() => []),
          api.labs.listLabResults(supabase).catch(() => []),
          api.records.listDocuments(supabase).catch(() => []),
        ]);
        if (!active) return;
        const full = (profile?.account?.full_name ?? "").trim();
        setFirstName(full ? (full.split(/\s+/)[0] ?? "") : "");
        const ups = (up as unknown as ApptLite[]);
        setUpcoming(ups.slice(0, 3).map((a, i) => {
          const name = a.doctor?.full_name ?? "—";
          const spec = a.doctor?.specialty ?? "";
          const time = a.slot_start ? upTime(a.slot_start) : "";
          return {
            initials: upInitials(name), grad: UP_GRADS[i % UP_GRADS.length]!,
            en: { name, spec, date: upDate(a.slot_date, false), time, type: TYPE_EN2[a.type] ?? a.type, status: STATUS_EN[a.status] ?? "Pending" },
            ar: { name, spec, date: upDate(a.slot_date, true),  time, type: TYPE_AR2[a.type] ?? a.type, status: STATUS_AR2[a.status] ?? "معلق" },
          };
        }));
        setStats({
          upcoming: ups.length,
          records: rx.length + labs.length + docs.length,
          pending: ups.filter((a) => a.status === "pending").length,
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  const greetName = firstName || (ar ? "بك" : "there");

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] overflow-x-hidden">

      {/* ══════════ HERO / WELCOME ══════════ */}
      <section className="relative overflow-hidden py-16 px-6"
        style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-8%] right-[-6%] w-[500px] h-[500px] rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, #e8d5f0, transparent 70%)", filter: "blur(90px)" }} />
          <div className="absolute bottom-[-10%] left-[-5%] w-[380px] h-[380px] rounded-full opacity-18"
            style={{ background: "radial-gradient(circle, #d5e8f5, transparent 70%)", filter: "blur(80px)" }} />
        </div>

        <div className="relative max-w-6xl mx-auto">
          {/* Top row: greeting + stats */}
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-10 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                style={{ background: "rgba(223,200,231,0.12)", border: "1px solid rgba(223,200,231,0.2)", color: "rgba(223,200,231,0.7)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {ar ? "متصل الآن" : "Online now"}
              </div>
              <h1 className="font-black font-serif text-white leading-[1.06] tracking-tight mb-4"
                style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)" }}>
                {ar
                  ? <><span className="block">مرحباً {greetName}،</span><span className="block italic text-[#DFC8E7]">كيف تشعرين اليوم؟</span></>
                  : <><span className="block">Good morning, {greetName}.</span><span className="block italic text-[#DFC8E7]">How are you feeling?</span></>}
              </h1>
              <p className="text-sm max-w-sm leading-relaxed" style={{ color: "rgba(223,200,231,0.6)" }}>
                {ar
                  ? "مواعيدك ونتائجك وسجلاتك الصحية كلها في مكان واحد."
                  : "Your appointments, results, and health records — all in one calm place."}
              </p>
            </div>

            {/* Stats */}
            <div className={`flex gap-3 flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
              {[
                { n: String(stats.upcoming), en: "Upcoming", ar: "قادمة",  icon: "📅" },
                { n: String(stats.records),  en: "Records",  ar: "سجلات",  icon: "📋" },
                { n: String(stats.pending),  en: "Pending",  ar: "معلقة",  icon: "⏳" },
              ].map(s => (
                <div key={s.en} className="flex flex-col items-center gap-1 px-5 py-4 rounded-2xl cursor-pointer hover:scale-105 transition-transform"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(223,200,231,0.15)" }}>
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-2xl font-black text-white leading-none">{s.n}</span>
                  <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "rgba(223,200,231,0.55)" }}>
                    {ar ? s.ar : s.en}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions row */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${ar ? "direction-rtl" : ""}`}>
            {QUICK_ACTIONS.map(action => (
              <Link key={action.href} href={action.href}
                className="no-underline group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all hover:scale-[1.03] hover:shadow-lg"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(223,200,231,0.15)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}>
                <span className="text-2xl flex-shrink-0">{action.emoji}</span>
                <span className="text-[13px] font-semibold leading-tight text-white/85 group-hover:text-white transition-colors">
                  {ar ? action.ar : action.en}
                </span>
                <svg className={`w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors ml-auto flex-shrink-0 ${ar ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ MARQUEE ══════════ */}
      <section className="py-3.5 overflow-hidden border-y border-[#e7dcee] dark:border-[#2a1c44] bg-white dark:bg-[#0d0820]">
        <div className="flex animate-marquee gap-10 items-center whitespace-nowrap">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-3 flex-shrink-0 text-sm font-medium text-[#2E1A47]/38 dark:text-[#DFC8E7]/38">
              {item} <span className="opacity-30">·</span>
            </span>
          ))}
        </div>
      </section>

      {/* ══════════ UPCOMING APPOINTMENTS ══════════ */}
      <section className="py-16 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div className={ar ? "text-right" : ""}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
                {ar ? "مواعيدك" : "Your Schedule"}
              </p>
              <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar ? <>مواعيدك<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">القادمة.</em></>
                     : <>Your upcoming<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">appointments.</em></>}
              </h2>
            </div>
            <Link href="/dashboard/appointments"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm no-underline transition-all flex-shrink-0 self-start sm:self-auto border-2 border-[#2E1A47]/14 dark:border-[#DFC8E7]/14 text-[#2E1A47] dark:text-[#DFC8E7] hover:border-[#2E1A47]/35 hover:bg-[#2E1A47]/5">
              {ar ? "عرض الكل ←" : "View all →"}
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {loading ? (
              [0, 1].map(i => (
                <div key={i} className="h-20 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white/60 dark:bg-[#1a1030]/60 animate-pulse" />
              ))
            ) : upcoming.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030]">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55">
                  {ar ? "لا توجد مواعيد قادمة." : "No upcoming appointments."}
                </p>
              </div>
            ) : upcoming.map((appt, i) => {
              const d = ar ? appt.ar : appt.en;
              const isPending = appt.en.status === "Pending";
              const isToday   = appt.en.date === "Today";
              return (
                <div key={i}
                  className={`group flex items-center gap-4 p-5 rounded-2xl border bg-white dark:bg-[#1a1030] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 overflow-hidden relative ${
                    isToday
                      ? "border-[#DFC8E7] dark:border-[#46255f] shadow-sm shadow-[#e8d5f0]/60"
                      : "border-[#e7dcee] dark:border-[#3a2560]"
                  }`}>
                  {/* Today accent stripe */}
                  {isToday && (
                    <div className={`absolute top-0 bottom-0 w-1 bg-gradient-to-b from-[#e8d5f0] to-[#DFC8E7] flex-shrink-0 ${ar ? "right-0" : "left-0"}`} />
                  )}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${appt.grad} text-[#2E1A47] ${isToday ? (ar ? "mr-2" : "ml-2") : ""}`}>
                    {appt.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-2 ${ar ? "flex-row-reverse justify-end" : ""}`}>
                      <p className="text-sm font-bold text-[#2E1A47] dark:text-[#DFC8E7] truncate">{d.name}</p>
                      {isToday && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#2E1A47] dark:bg-[#DFC8E7] text-white dark:text-[#1a1030] flex-shrink-0">{ar ? "اليوم" : "NOW"}</span>}
                    </div>
                    <p className="text-xs text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 mt-0.5">{d.spec}</p>
                  </div>
                  <div className={`hidden sm:flex flex-col flex-shrink-0 ${ar ? "items-start" : "items-end"}`}>
                    <p className={`text-xs font-bold ${isToday ? "text-[#46255f] dark:text-[#DFC8E7]" : "text-[#2E1A47]/60 dark:text-[#DFC8E7]/60"}`}>{d.date}</p>
                    <p className="text-xs text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 mt-0.5">{d.time}</p>
                  </div>
                  <span className="hidden md:inline-flex text-[11px] font-semibold px-3 py-1.5 rounded-full bg-[#faf8fc] dark:bg-[#241540] border border-[#e7dcee] dark:border-[#3a2560] text-[#46255f] dark:text-[#DFC8E7]/70 flex-shrink-0">
                    {d.type}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full flex-shrink-0 ${
                    isPending
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"
                      : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                  }`}>{d.status}</span>
                  <svg className={`w-4 h-4 text-[#2E1A47]/25 dark:text-[#DFC8E7]/25 group-hover:text-[#46255f] dark:group-hover:text-[#DFC8E7] transition-colors flex-shrink-0 ${ar ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════ HEALTH SNAPSHOT ══════════ */}
      <section className="py-10 px-6 bg-[#faf8fc] dark:bg-[#0a0518]">
        <div className="max-w-6xl mx-auto">
          <div className={`flex items-center justify-between mb-6 ${ar ? "flex-row-reverse" : ""}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">
              {ar ? "لمحة صحية" : "Health Snapshot"}
            </p>
            <Link href="/dashboard/records"
              className="text-xs font-bold text-[#46255f]/60 dark:text-[#DFC8E7]/50 hover:text-[#46255f] dark:hover:text-[#DFC8E7] transition-colors no-underline">
              {ar ? "عرض السجلات ←" : "View records →"}
            </Link>
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 ${ar ? "direction-rtl" : ""}`}>
            {HEALTH_METRICS.map(m => {
              const d = ar ? m.ar : m.en;
              return (
                <div key={m.en.label}
                  className={`rounded-2xl p-5 bg-gradient-to-br ${m.color} border border-[#e7dcee] dark:border-[#3a2560] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${ar ? "text-right" : ""}`}>
                  <div className={`flex items-center justify-between mb-3 ${ar ? "flex-row-reverse" : ""}`}>
                    <span className="text-2xl">{m.icon}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.badge}`}>{d.sub}</span>
                  </div>
                  <p className="text-2xl font-black text-[#2E1A47] dark:text-white leading-none mb-1">{d.value}</p>
                  <p className="text-[11px] font-medium text-[#2E1A47]/50 dark:text-[#DFC8E7]/50">{d.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════ SERVICES ══════════ */}
      <section className="py-16 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`mb-10 ${ar ? "text-right" : ""}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
              {ar ? "الخدمات" : "Services"}
            </p>
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
              {ar ? <>ماذا تحتاج<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">اليوم؟</em></>
                   : <>What do you need<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">today?</em></>}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {SERVICE_CARDS.map(card => (
              <Link key={card.href} href={card.href}
                className="no-underline group rounded-2xl overflow-hidden border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030] hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className="h-48 flex items-center justify-center text-7xl relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${card.from}, ${card.to})` }}>
                  <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full opacity-25 bg-white" />
                  <div className="absolute bottom-[-30px] left-[-10px] w-28 h-28 rounded-full opacity-20 bg-white" />
                  <span className="relative z-10 drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
                    {card.emoji}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-base text-[#2E1A47] dark:text-[#DFC8E7] leading-snug mb-2">
                    {ar ? card.ar.title : card.en.title}
                  </h3>
                  <p className="text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed">
                    {ar ? card.ar.desc : card.en.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ HOW IT WORKS — dark band ══════════ */}
      <section className="py-20 px-6"
        style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 50%, #1e1038 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8 mb-14 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div className={ar ? "text-right" : ""}>
              <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "rgba(223,200,231,0.45)" }}>
                {ar ? "كيف يعمل" : "How it works"}
              </p>
              <h2 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar
                  ? <>أربع خطوات هادئة<br />من القلق إلى الرعاية.</>
                  : <>Four calm steps<br />from concern to care.</>}
              </h2>
            </div>
            <Link href="/dashboard/find-doctors"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm no-underline transition-all flex-shrink-0 self-start sm:self-auto"
              style={{ border: "1.5px solid rgba(223,200,231,0.28)", color: "#DFC8E7" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(223,200,231,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {ar ? "ابحث عن طبيب ←" : "Find a doctor →"}
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {CLINIC_STEPS.map(step => (
              <div key={step.num}>
                <p className="text-4xl font-black font-serif mb-4 leading-none" style={{ color: "rgba(223,200,231,0.2)" }}>
                  {step.num}
                </p>
                <h3 className="text-lg font-bold text-white mb-2 font-serif">
                  {ar ? step.ar.t : step.en.t}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(223,200,231,0.58)" }}>
                  {ar ? step.ar.d : step.en.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CONSULT ONLINE ══════════ */}
      <section className="py-20 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div className={ar ? "text-right" : ""}>
              <SectionPill en="Online Consult" ar="استشارة عبر الإنترنت" isAr={ar} />
              <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar ? "استشر طبيباً لكل مشكلة." : "A doctor for every concern."}
              </h2>
            </div>
            <Link href="/dashboard/specialties"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline flex-shrink-0">
              {ar ? "تصفح الكل ←" : "Browse all →"}
            </Link>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-6">
            {SPECIALTIES.map(s => (
              <button key={s.en} className="flex flex-col items-center gap-3 group">
                <div className="w-[70px] h-[70px] rounded-full border border-[#e7dcee] dark:border-[#3a2560] bg-[#faf8fc] dark:bg-[#1a1030] flex items-center justify-center text-2xl transition-all duration-200 group-hover:border-[#DFC8E7] group-hover:bg-[#f0e8f8] dark:group-hover:bg-[#2E1A47]/40 group-hover:scale-105 group-hover:shadow-md">
                  {s.emoji}
                </div>
                <p className="text-[11px] text-center text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-tight font-medium px-1">
                  {ar ? s.ar : s.en}
                </p>
                <span className="text-[10px] font-bold text-[#46255f] dark:text-[#DFC8E7]/60 tracking-widest uppercase group-hover:underline">
                  {ar ? "استشر الآن" : "Consult Now"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CLINIC TYPES ══════════ */}
      <section className="py-20 px-6 bg-[#faf8fc] dark:bg-[#0a0518]">
        <div className="max-w-6xl mx-auto">
          <div className={`mb-12 ${ar ? "text-right" : ""}`}>
            <SectionPill en="In-Clinic" ar="في العيادة" isAr={ar} />
            <h2 className="font-black font-serif text-[#2E1A47] dark:text-white"
              style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
              {ar ? "احجز زيارة في العيادة." : "Book an in-clinic visit."}
            </h2>
            <p className="text-base text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mt-4 max-w-lg leading-relaxed">
              {ar
                ? "ابحث عن أطباء متمرسين في جميع التخصصات. مواعيد مؤكدة وانتظار منظم."
                : "Find experienced doctors across all specialties. Confirmed bookings, organised waiting."}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {CLINIC_TYPES.map(item => (
              <div key={item.en.label}
                className="rounded-2xl overflow-hidden border border-[#e7dcee] dark:border-[#3a2560] bg-white dark:bg-[#1a1030] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
                <div className="h-36 flex items-center justify-center text-5xl relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }}>
                  <span className="transition-transform duration-300 group-hover:scale-110 drop-shadow-sm relative z-10">
                    {item.emoji}
                  </span>
                </div>
                <div className={`p-5 ${ar ? "text-right" : ""}`}>
                  <h3 className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] mb-2 leading-snug">
                    {ar ? item.ar.label : item.en.label}
                  </h3>
                  <p className="text-xs text-[#2E1A47]/52 dark:text-[#DFC8E7]/52 leading-relaxed">
                    {ar ? item.ar.desc : item.en.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ HEALTH TIP BANNER ══════════ */}
      <section className="py-5 px-6 bg-[#faf8fc] dark:bg-[#0a0518] border-y border-[#e7dcee] dark:border-[#2a1840]">
        <div className={`max-w-6xl mx-auto flex items-center gap-4 ${ar ? "flex-row-reverse" : ""}`}>
          <span className="text-2xl flex-shrink-0">💡</span>
          <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#46255f]/55 dark:text-[#DFC8E7]/45 mr-3">
              {ar ? "نصيحة اليوم" : "Tip of the day"}
            </span>
            <span className="text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/60">
              {ar
                ? "اشرب ٨ أكواب من الماء يومياً. الترطيب الجيد يحسّن طاقتك وتركيزك."
                : "Stay hydrated — drink 8 glasses of water daily. Good hydration improves energy and focus."}
            </span>
          </div>
        </div>
      </section>

      {/* ══════════ ARTICLES ══════════ */}
      <section className="py-20 px-6 bg-white dark:bg-[#0d0820]">
        <div className="max-w-6xl mx-auto">
          <div className={`flex flex-col sm:flex-row gap-14 items-center ${ar ? "sm:flex-row-reverse" : ""}`}>
            <div className="flex-1">
              <SectionPill en="Health Library" ar="المكتبة الصحية" isAr={ar} />
              <h2 className={`font-black font-serif text-[#2E1A47] dark:text-white mb-4 ${ar ? "text-right" : ""}`}
                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", lineHeight: 1.1 }}>
                {ar ? <>اقرأ أفضل المقالات<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">من خبراء الصحة.</em></>
                     : <>Read top articles<br /><em className="italic text-[#46255f] dark:text-[#DFC8E7]">from health experts.</em></>}
              </h2>
              <p className={`text-base text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 leading-relaxed mb-8 max-w-md ${ar ? "text-right" : ""}`}>
                {ar
                  ? "مقالات صحية تبقيك على اطلاع بالممارسات الصحية الجيدة وتساعدك على تحقيق أهدافك."
                  : "Health articles that keep you informed about good health practices and help you achieve your goals."}
              </p>
              <BrandCTA href="/dashboard/articles" en="See all articles" ar="عرض جميع المقالات" isAr={ar} />
            </div>

            <div className={`flex gap-5 flex-shrink-0 ${ar ? "flex-row-reverse" : ""}`}>
              {ARTICLES.map(article => (
                <div key={article.en.tag}
                  className="w-[185px] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] overflow-hidden bg-[#faf8fc] dark:bg-[#1a1030] hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer">
                  <div className="h-32" style={{ background: `linear-gradient(135deg, ${article.from}, ${article.to})` }} />
                  <div className={`p-4 ${ar ? "text-right" : ""}`}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#46255f] dark:text-[#DFC8E7]/60 mb-2">
                      {ar ? article.ar.tag : article.en.tag}
                    </p>
                    <p className="text-[13px] font-semibold text-[#2E1A47] dark:text-[#DFC8E7] leading-snug mb-3">
                      {ar ? article.ar.title : article.en.title}
                    </p>
                    <p className="text-[11px] text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
                      {ar ? "د. ديانا بورجيو" : "Dr. Diana Borgio"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
