"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BookingModal, SLOTS_A, SLOTS_B, SLOTS_C, type Slot, type ViewDoctor } from "@/components/dashboard/DoctorBooking";

/* ─── Shared data ────────────────────────────────────────────────────── */
const SPECIALTIES = [
  { en: "All",          ar: "الكل" },
  { en: "General Care", ar: "طب عام" },
  { en: "Cardiology",   ar: "أمراض القلب" },
  { en: "Dermatology",  ar: "جلدية" },
  { en: "Gynecology",   ar: "نساء وتوليد" },
  { en: "Dentist",      ar: "أسنان" },
  { en: "Pediatrics",   ar: "أطفال" },
  { en: "Orthopedics",  ar: "عظام" },
];

const DOCTORS = [
  {
    initials: "AH",
    grad: "from-[#e8d5f0] to-[#d5e8f5]",
    specialty: "General Care",
    fee: 30,
    rating: 4.9,
    reviews: 312,
    available: true,
    en: { name: "Dr. Aisha Al Harthy",   hospital: "Royal Care Clinic",      type: "In-clinic" },
    ar: { name: "د. عائشة الحارثي",      hospital: "عيادة رويال كير",         type: "في العيادة" },
    slots: SLOTS_A,
  },
  {
    initials: "OB",
    grad: "from-[#d5e8f5] to-[#ede0f8]",
    specialty: "Cardiology",
    fee: 60,
    rating: 4.8,
    reviews: 198,
    available: true,
    en: { name: "Dr. Omar Al Balushi",   hospital: "Heart & Vascular Centre", type: "In-clinic" },
    ar: { name: "د. عمر البلوشي",        hospital: "مركز القلب والأوعية",     type: "في العيادة" },
    slots: SLOTS_B,
  },
  {
    initials: "FR",
    grad: "from-[#ede0f8] to-[#e8d5f0]",
    specialty: "Dermatology",
    fee: 45,
    rating: 4.7,
    reviews: 245,
    available: false,
    en: { name: "Dr. Fatma Al Riyami",   hospital: "Skin & Wellness Studio",  type: "In-clinic" },
    ar: { name: "د. فاطمة الريامي",      hospital: "عيادة الجلد والعافية",    type: "في العيادة" },
    slots: [] as Slot[],
  },
  {
    initials: "SN",
    grad: "from-[#d1fae5] to-[#d5e8f5]",
    specialty: "Gynecology",
    fee: 55,
    rating: 4.9,
    reviews: 420,
    available: true,
    en: { name: "Dr. Sara Al Nabhani",   hospital: "Women's Health Centre",   type: "In-clinic" },
    ar: { name: "د. سارة النبهانية",     hospital: "مركز صحة المرأة",         type: "في العيادة" },
    slots: SLOTS_C,
  },
  {
    initials: "KM",
    grad: "from-[#fde68a] to-[#e8d5f0]",
    specialty: "Dentist",
    fee: 40,
    rating: 4.6,
    reviews: 167,
    available: true,
    en: { name: "Dr. Khalid Al Maskari", hospital: "Bright Smile Dental",     type: "In-clinic" },
    ar: { name: "د. خالد المسكري",       hospital: "عيادة ابتسامة مشرقة",    type: "في العيادة" },
    slots: SLOTS_A,
  },
  {
    initials: "LH",
    grad: "from-[#e8d5f0] to-[#d1fae5]",
    specialty: "Pediatrics",
    fee: 35,
    rating: 4.8,
    reviews: 289,
    available: true,
    en: { name: "Dr. Layla Al Habsi",    hospital: "Children's Wellness Hub", type: "In-clinic" },
    ar: { name: "د. ليلى الحبسية",       hospital: "مركز صحة الأطفال",        type: "في العيادة" },
    slots: SLOTS_B,
  },
];

const BIOS_EN: Record<string, string> = {
  "General Care":  "An experienced general practitioner offering comprehensive consultations for everyday health concerns, chronic disease management, and preventive care.",
  "Cardiology":    "A board-certified cardiologist with expertise in diagnosing and treating heart disease, arrhythmia, and vascular conditions using the latest non-invasive techniques.",
  "Dermatology":   "A specialist in skin, hair, and nail conditions with a focus on acne, eczema, psoriasis, and cosmetic dermatology procedures.",
  "Gynecology":    "An obstetrician-gynaecologist providing women's health services including prenatal care, fertility consultations, and minimally invasive procedures.",
  "Dentist":       "A comprehensive dental care provider offering preventive, restorative, and cosmetic dentistry with a gentle and patient-friendly approach.",
  "Pediatrics":    "A dedicated paediatrician specialising in the health and development of infants, children, and adolescents with a warm, child-friendly approach.",
  "Orthopedics":   "An orthopaedic specialist in bone, joint, and muscle disorders with expertise in both surgical and non-surgical musculoskeletal treatment.",
};
const BIOS_AR: Record<string, string> = {
  "General Care":  "طبيب عام ذو خبرة واسعة يقدم استشارات شاملة للمخاوف الصحية اليومية وإدارة الأمراض المزمنة والرعاية الوقائية.",
  "Cardiology":    "طبيب قلب معتمد متخصص في تشخيص وعلاج أمراض القلب وعدم انتظام ضرباته وحالات الأوعية الدموية.",
  "Dermatology":   "متخصص في أمراض الجلد والشعر والأظافر مع تركيز على حب الشباب والإكزيما والصدفية وإجراءات الجلدية التجميلية.",
  "Gynecology":    "طبيبة نساء وتوليد تقدم خدمات صحة المرأة بما فيها الرعاية السابقة للولادة واستشارات الخصوبة والإجراءات البسيطة.",
  "Dentist":       "مزود رعاية أسنان شاملة يقدم طب الأسنان الوقائي والترميمي والتجميلي بأسلوب لطيف وودي.",
  "Pediatrics":    "طبيب أطفال متخصص في صحة ونمو الرضع والأطفال والمراهقين بأسلوب دافئ ومناسب للأطفال.",
  "Orthopedics":   "متخصص في اضطرابات العظام والمفاصل والعضلات مع خبرة في العلاجين الجراحي وغير الجراحي.",
};

const PROFILE_GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]",
  "from-[#d1fae5] to-[#d5e8f5]", "from-[#fde68a] to-[#e8d5f0]", "from-[#e8d5f0] to-[#d1fae5]",
];

function mockToView(doc: typeof DOCTORS[0], isAr: boolean): ViewDoctor {
  const d = isAr ? doc.ar : doc.en;
  return {
    id: doc.initials,
    initials: doc.initials,
    grad: doc.grad,
    specialty: isAr ? (SPECIALTIES.find(s => s.en === doc.specialty)?.ar ?? doc.specialty) : doc.specialty,
    bio: isAr ? (BIOS_AR[doc.specialty] ?? "") : (BIOS_EN[doc.specialty] ?? ""),
    fee: doc.fee,
    rating: doc.rating,
    reviews: doc.reviews,
    available: doc.available,
    name: d.name,
    hospital: d.hospital,
    type: d.type,
    slots: doc.slots,
    education: isAr ? "بكالوريوس الطب والجراحة" : "MBBS, Royal College",
    experience: isAr ? "أكثر من ١٠ سنوات" : "10+ years",
    languages: isAr ? "عربي · إنجليزي" : "Arabic · English",
    location: isAr ? "مسقط، عُمان" : "Muscat, Oman",
  };
}

type RealDoctorRow = {
  id: string;
  full_name: string;
  specialty: string | null;
  qualifications: string[] | null;
  years_experience: number | null;
  bio: string | null;
  languages: string[] | null;
  fees: unknown;
  status: string | null;
  avg_rating: number | null;
  review_count: number | null;
};

function realToView(row: RealDoctorRow, isAr: boolean, index: number): ViewDoctor {
  const initials = row.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
  const fees = row.fees as { in_person?: number; online?: number } | null;
  const qualifications = row.qualifications ?? [];
  const languages = row.languages ?? [];
  return {
    id: row.id,
    initials,
    grad: PROFILE_GRADS[index % PROFILE_GRADS.length]!,
    specialty: row.specialty ?? (isAr ? "طب عام" : "General Medicine"),
    bio: row.bio?.trim() || (isAr ? "لا تتوفر نبذة تعريفية لهذا الطبيب بعد." : "No biography available for this doctor yet."),
    fee: fees?.in_person ?? fees?.online ?? 0,
    rating: row.avg_rating ?? 0,
    reviews: row.review_count ?? 0,
    available: row.status === "available",
    name: row.full_name,
    hospital: isAr ? "شبكة ميدلينك" : "MediLink Network",
    type: isAr ? "في العيادة" : "In-clinic",
    slots: SLOTS_A, // no live scheduling data yet for real doctors — reuse demo slot grid
    education: qualifications.length ? qualifications.join(", ") : (isAr ? "غير محدد" : "Not specified"),
    experience: row.years_experience
      ? (isAr ? `أكثر من ${row.years_experience} سنوات` : `${row.years_experience}+ years`)
      : (isAr ? "غير محدد" : "Not specified"),
    languages: languages.length ? languages.join(" · ") : (isAr ? "غير محدد" : "Not specified"),
    location: isAr ? "عُمان" : "Oman",
  };
}

/* ─── Review types ───────────────────────────────────────────────────── */
type Review = { initials: string; rating: number; en: string; ar: string; own?: boolean };

const SEED_REVIEWS: Review[] = [
  { initials: "SM", rating: 5, en: "Very professional and thorough. Explained everything clearly.", ar: "محترف جداً وشامل. شرح كل شيء بوضوح." },
  { initials: "LK", rating: 5, en: "Short waiting time and the doctor was very attentive.", ar: "وقت انتظار قصير والطبيب كان منتبهاً جداً." },
  { initials: "RN", rating: 4, en: "Accurate diagnosis and great follow-up. Highly recommend.", ar: "تشخيص دقيق ومتابعة ممتازة. أنصح به بشدة." },
];

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function DoctorProfilePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const params = useParams();
  const rawId = (params.id as string) ?? "";

  const mockMatch = DOCTORS.find(doc => doc.initials === rawId.toUpperCase());
  const [realDoctor, setRealDoctor] = useState<RealDoctorRow | null>(null);
  const [loadingReal, setLoadingReal] = useState(!mockMatch);
  const [realNotFound, setRealNotFound] = useState(false);

  useEffect(() => {
    if (mockMatch) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("doctors")
        .select("id, full_name, specialty, qualifications, years_experience, bio, languages, fees, status, avg_rating, review_count")
        .eq("id", rawId)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (data) setRealDoctor(data as RealDoctorRow);
      else setRealNotFound(true);
      setLoadingReal(false);
    })();
    return () => { cancelled = true; };
  }, [rawId, mockMatch]);

  const doctor: ViewDoctor | null = mockMatch
    ? mockToView(mockMatch, ar)
    : realDoctor
      ? realToView(realDoctor, ar, 0)
      : null;

  const [reviews, setReviews]     = useState<Review[]>(SEED_REVIEWS);
  const [hoverStar, setHoverStar] = useState(0);
  const [selStar, setSelStar]     = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

  if (loadingReal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e]">
        <div className="w-8 h-8 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
      </div>
    );
  }

  if (!doctor || realNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e]">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-4 text-lg">Doctor not found</p>
          <Link href="/dashboard/find-doctors" className="text-sm font-bold text-[#46255f] hover:underline">
            ← Back to Find Doctors
          </Link>
        </div>
      </div>
    );
  }

  function submitReview() {
    if (!selStar || !reviewText.trim()) return;
    setReviews(prev => [{ initials: "ME", rating: selStar, en: reviewText, ar: reviewText, own: true }, ...prev]);
    setSelStar(0);
    setReviewText("");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  }

  const ratingLabel = ["", ar ? "ضعيف" : "Poor", ar ? "مقبول" : "Fair", ar ? "جيد" : "Good", ar ? "جيد جداً" : "Very good", ar ? "ممتاز" : "Excellent"];

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-28">

      {/* ── Back bar ── */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/dashboard/find-doctors"
            className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline ${ar ? "flex-row-reverse" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {ar ? "العودة إلى قائمة الأطباء" : "Back to Find Doctors"}
          </Link>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-start gap-5 mb-6 ${ar ? "flex-row-reverse" : ""}`}>
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0 bg-gradient-to-br ${doctor.grad} text-[#2E1A47]`}>
              {doctor.initials}
            </div>
            <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
              <div className={`flex items-center gap-2 flex-wrap mb-1.5 ${ar ? "flex-row-reverse" : ""}`}>
                <h1 className="font-black text-white text-xl leading-tight">{doctor.name}</h1>
                {doctor.available
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">{ar ? "متاح" : "Available"}</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/40 border border-white/10">{ar ? "غير متاح" : "Unavailable"}</span>}
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: "rgba(223,200,231,0.75)" }}>{doctor.specialty}</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.42)" }}>{doctor.hospital}</p>
            </div>
          </div>

          <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
            <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80">
              <span className="text-amber-400">★</span> {doctor.rating}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>({doctor.reviews} {ar ? "تقييم" : "reviews"})</span>
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80">
              {ar ? `${doctor.fee} ر.ع.` : `OMR ${doctor.fee}`} / {ar ? "زيارة" : "visit"}
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80">{doctor.type}</span>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* About */}
        <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3 ${ar ? "text-right" : ""}`}>
            {ar ? "نبذة" : "About"}
          </p>
          <p className={`text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-relaxed ${ar ? "text-right" : ""}`}>{doctor.bio}</p>
        </section>

        {/* Details grid */}
        <section className="grid grid-cols-2 gap-3">
          {[
            { icon: "🎓", en: "Education",  ar: "التعليم",  val: doctor.education },
            { icon: "⏱",  en: "Experience", ar: "الخبرة",   val: doctor.experience },
            { icon: "🌐",  en: "Languages",  ar: "اللغات",   val: doctor.languages },
            { icon: "📍",  en: "Location",   ar: "الموقع",   val: doctor.location },
          ].map(item => (
            <div key={item.en} className={`bg-white dark:bg-[#1a1030] rounded-2xl p-4 border border-[#e7dcee] dark:border-[#3a2560] ${ar ? "text-right" : ""}`}>
              <p className="text-xl mb-2">{item.icon}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-1">{ar ? item.ar : item.en}</p>
              <p className="text-sm font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">{item.val}</p>
            </div>
          ))}
        </section>

        {/* Patient Reviews */}
        <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
          <div className={`flex items-center justify-between mb-5 ${ar ? "flex-row-reverse" : ""}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35">
              {ar ? "آراء المرضى" : "Patient Reviews"}
            </p>
            <span className="text-xs font-bold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40">
              {reviews.length} {ar ? "تقييم" : "reviews"}
            </span>
          </div>
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${
                r.own
                  ? "border-[#DFC8E7]/60 bg-[#faf5ff] dark:bg-[#2E1A47]/20"
                  : "border-[#e7dcee] dark:border-[#2a1840] bg-[#faf8fc] dark:bg-[#0d0820]"
              } ${ar ? "flex-row-reverse" : ""}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                  r.own ? "bg-gradient-to-br from-[#DFC8E7] to-[#c8dff0]" : "bg-gradient-to-br from-[#e8d5f0] to-[#d5e8f5]"
                } text-[#2E1A47]`}>
                  {r.initials}
                </div>
                <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                  <div className={`flex items-center gap-1 mb-1.5 ${ar ? "flex-row-reverse" : ""}`}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <span key={j} className={`text-sm ${j < r.rating ? "text-amber-400" : "text-[#2E1A47]/12 dark:text-[#DFC8E7]/12"}`}>★</span>
                    ))}
                    {r.own && (
                      <span className={`text-[10px] font-bold text-[#46255f] dark:text-[#DFC8E7]/60 ${ar ? "mr-1" : "ml-1"}`}>
                        {ar ? "تقييمك" : "Your review"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-snug">{ar ? r.ar : r.en}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Leave a Review */}
        <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-5 ${ar ? "text-right" : ""}`}>
            {ar ? "اكتب تقييماً" : "Leave a Review"}
          </p>

          {submitted && (
            <div className={`flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 ${ar ? "flex-row-reverse" : ""}`}>
              <span>✅</span>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {ar ? "شكراً على تقييمك!" : "Thank you for your review!"}
              </p>
            </div>
          )}

          {/* Star selector */}
          <div className={`flex items-center gap-1 mb-4 ${ar ? "flex-row-reverse" : ""}`}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onMouseEnter={() => setHoverStar(star)}
                onMouseLeave={() => setHoverStar(0)}
                onClick={() => setSelStar(star)}
                className="text-3xl transition-transform hover:scale-110 leading-none"
              >
                <span className={(hoverStar || selStar) >= star ? "text-amber-400" : "text-[#2E1A47]/15 dark:text-[#DFC8E7]/15"}>★</span>
              </button>
            ))}
            {selStar > 0 && (
              <span className={`text-xs font-semibold text-[#2E1A47]/50 dark:text-[#DFC8E7]/50 ${ar ? "mr-2" : "ml-2"}`}>
                {ratingLabel[selStar]}
              </span>
            )}
          </div>

          {/* Text input */}
          <textarea
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            rows={3}
            placeholder={ar ? "شاركنا تجربتك مع الطبيب..." : "Share your experience with this doctor..."}
            className={`w-full text-sm text-[#2E1A47] dark:text-[#DFC8E7] bg-[#f9f4fa] dark:bg-[#0d0820] border border-[#e7dcee] dark:border-[#3a2560] rounded-xl px-4 py-3 outline-none focus:border-[#46255f]/60 dark:focus:border-[#DFC8E7]/40 transition-all resize-none placeholder-[#2E1A47]/30 dark:placeholder-[#DFC8E7]/30 mb-4 ${ar ? "text-right" : ""}`}
          />

          <button
            disabled={!selStar || !reviewText.trim()}
            onClick={submitReview}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
          >
            {ar ? "إرسال التقييم" : "Submit Review"}
          </button>
        </section>
      </div>

      {/* ── Sticky Book button ── */}
      <div className="fixed bottom-0 left-0 right-0 px-6 py-4 bg-white dark:bg-[#0d0820] border-t border-[#e7dcee] dark:border-[#2a1840] z-20">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => doctor.available && setShowBooking(true)}
            disabled={!doctor.available}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
          >
            {doctor.available ? (ar ? "احجز موعداً" : "Book Appointment") : (ar ? "غير متاح حالياً" : "Currently Unavailable")}
          </button>
        </div>
      </div>

      {/* ── Booking modal ── */}
      {showBooking && (
        <BookingModal
          doctor={doctor}
          isAr={ar}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  );
}
