"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { BookingModal, type ViewDoctor } from "@/components/dashboard/DoctorBooking";
import { FavouriteButton } from "@/components/dashboard/FavouriteButton";
import { api } from "@medilink/shared";

/* ─── Shared data ────────────────────────────────────────────────────── */
const PROFILE_GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]", "from-[#ede0f8] to-[#e8d5f0]",
  "from-[#d1fae5] to-[#d5e8f5]", "from-[#fde68a] to-[#e8d5f0]", "from-[#e8d5f0] to-[#d1fae5]",
];

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
    education: qualifications.length ? qualifications.join(", ") : (isAr ? "غير محدد" : "Not specified"),
    experience: row.years_experience
      ? (isAr ? `أكثر من ${row.years_experience} سنوات` : `${row.years_experience}+ years`)
      : (isAr ? "غير محدد" : "Not specified"),
    languages: languages.length ? languages.join(" · ") : (isAr ? "غير محدد" : "Not specified"),
    location: isAr ? "عُمان" : "Oman",
  };
}

/* ─── Review types ───────────────────────────────────────────────────── */
// Reviews are read from the shared API (api.reviews.listDoctorReviews) under the
// public-read RLS policy; reviewer identity is never exposed, so `initials` is a
// generic verified marker rather than a fabricated name.
type Review = { initials: string; rating: number; en: string; ar: string; own?: boolean };

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function DoctorProfilePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const params = useParams();
  const rawId = (params.id as string) ?? "";

  const [realDoctor, setRealDoctor] = useState<RealDoctorRow | null>(null);
  const [loadingReal, setLoadingReal] = useState(true);
  const [realNotFound, setRealNotFound] = useState(false);

  useEffect(() => {
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
  }, [rawId]);

  const doctor: ViewDoctor | null = realDoctor ? realToView(realDoctor, ar, 0) : null;

  const [reviews, setReviews]     = useState<Review[]>([]);
  const [hoverStar, setHoverStar] = useState(0);
  const [selStar, setSelStar]     = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);

  // Days of the week the doctor has bookable slots (doctor_availability).
  const [availDays, setAvailDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!rawId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase
          .from("doctor_availability")
          .select("day_of_week, slots")
          .eq("doctor_id", rawId);
        if (cancelled) return;
        const days = new Set<number>();
        for (const row of (data ?? []) as { day_of_week: number; slots: unknown[] | null }[]) {
          if (Array.isArray(row.slots) && row.slots.length > 0) days.add(row.day_of_week);
        }
        setAvailDays(days);
      } catch {
        if (!cancelled) setAvailDays(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [rawId]);

  // Load the doctor's public reviews via the shared API (RLS public-read).
  useEffect(() => {
    if (!rawId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { reviews: rows } = await api.reviews.listDoctorReviews(supabase, rawId);
        if (cancelled) return;
        setReviews(rows.map(r => ({ initials: "✓", rating: r.rating, en: r.review_text ?? "", ar: r.review_text ?? "" })));
      } catch {
        if (!cancelled) setReviews([]);
      }
    })();
    return () => { cancelled = true; };
  }, [rawId]);

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

  async function submitReview() {
    if (!selStar || !reviewText.trim() || submitting) return;
    setSubmitting(true);
    setReviewError(null);
    const text = reviewText.trim();
    try {
      const supabase = createBrowserSupabaseClient();
      await api.reviews.createReview(supabase, {
        targetType: "doctor",
        targetId: rawId,
        rating: selStar,
        reviewText: text,
      });
      // Optimistically show the patient's own review (public visibility may be
      // gated by moderation, so it might not appear in the public read yet).
      setReviews(prev => [{ initials: "✓", rating: selStar, en: text, ar: text, own: true }, ...prev]);
      setSelStar(0);
      setReviewText("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    } catch {
      setReviewError(ar ? "تعذّر إرسال التقييم. حاول مرة أخرى." : "Could not submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const ratingLabel = ["", ar ? "ضعيف" : "Poor", ar ? "مقبول" : "Fair", ar ? "جيد" : "Good", ar ? "جيد جداً" : "Very good", ar ? "ممتاز" : "Excellent"];

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] pb-28">

      {/* ── Back bar ── */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 sticky top-0 z-10">
        <div className={`max-w-3xl mx-auto flex items-center justify-between gap-3 ${ar ? "flex-row-reverse" : ""}`}>
          <Link
            href="/dashboard/find-doctors"
            className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline ${ar ? "flex-row-reverse" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {ar ? "العودة إلى قائمة الأطباء" : "Back to Find Doctors"}
          </Link>
          <FavouriteButton targetId={rawId} targetType="doctor" />
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

        {/* Weekly availability (doctor_availability) */}
        {availDays.size > 0 && (
          <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
            <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4 ${ar ? "text-right" : ""}`}>
              {ar ? "التوفر الأسبوعي" : "Weekly Availability"}
            </p>
            <div className={`flex gap-2 flex-wrap ${ar ? "flex-row-reverse" : ""}`}>
              {(ar
                ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
              ).map((label, day) => {
                const on = availDays.has(day);
                return (
                  <span
                    key={day}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                      on
                        ? "border-transparent bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                        : "border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/25 dark:text-[#DFC8E7]/25 line-through"
                    }`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <p className={`text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mt-3 ${ar ? "text-right" : ""}`}>
              {ar ? "اختر «احجز موعداً» لعرض الأوقات المتاحة." : "Tap “Book Appointment” to see available times."}
            </p>
          </section>
        )}

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

          {reviewError && (
            <p className={`text-sm font-semibold text-red-600 dark:text-red-400 mb-3 ${ar ? "text-right" : ""}`}>
              {reviewError}
            </p>
          )}

          <button
            disabled={!selStar || !reviewText.trim() || submitting}
            onClick={submitReview}
            className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}
          >
            {submitting ? (ar ? "جارٍ الإرسال..." : "Submitting...") : (ar ? "إرسال التقييم" : "Submit Review")}
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
