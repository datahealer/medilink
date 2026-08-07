"use client";

/*
 * Clinic (facility) detail — complete clinic info + the doctors that belong to it.
 * Reuses existing backend only: api.facilities.getFacility (facility detail) and
 * api.doctors.searchDoctors({ facilityId }) (its doctors). No new endpoints.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@medilink/shared";
import { useI18n } from "@/i18n/I18nProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { FavouriteButton } from "@/components/dashboard/FavouriteButton";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Facility = {
  id: string;
  name: string;
  type: string | null;
  custom_type: string | null;
  description: string | null;
  address: unknown;
  phone: string | null;
  email: string | null;
  website: string | null;
  services: string[] | null;
  accepted_insurances: string[] | null;
  rating: number | null;
  review_count: number | null;
  is_verified: boolean | null;
};

type ClinicDoctor = Awaited<ReturnType<typeof api.doctors.searchDoctors>>[number];

const GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]",
  "from-[#ede0f8] to-[#e8d5f0]", "from-[#d1fae5] to-[#d5e8f5]",
];

function formatAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "";
  const a = address as Record<string, unknown>;
  return [a.street, a.area, a.city, a.region]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(", ");
}

function initialsOf(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !/^dr\.?$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "DR";
}

function feeOf(fees: unknown): number {
  if (fees && typeof fees === "object" && !Array.isArray(fees)) {
    const o = fees as { in_person?: number; online?: number };
    if (typeof o.in_person === "number") return o.in_person;
    if (typeof o.online === "number") return o.online;
  }
  return 0;
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function ClinicDetailPage() {
  const { locale, t } = useI18n();
  const ar = locale === "ar";
  const params = useParams();
  const rawId = (params.id as string) ?? "";

  const [clinic, setClinic] = useState<Facility | null>(null);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!rawId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const [facility, docs] = await Promise.all([
          api.facilities.getFacility(supabase, rawId),
          api.doctors.searchDoctors(supabase, { facilityId: rawId, limit: 100 }),
        ]);
        if (cancelled) return;
        if (!facility) { setNotFound(true); }
        else setClinic(facility as unknown as Facility);
        setDoctors(docs);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rawId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e]">
        <div className="w-8 h-8 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
      </div>
    );
  }

  if (!clinic || notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e]">
        <div className="text-center">
          <p className="text-5xl mb-4">🏥</p>
          <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-4 text-lg">{ar ? "لم يتم العثور على العيادة" : "Clinic not found"}</p>
          <Link href="/dashboard/find-doctors" className="text-sm font-bold text-[#46255f] hover:underline">
            {ar ? "→ العودة" : "← Back to Find Doctors"}
          </Link>
        </div>
      </div>
    );
  }

  const address = formatAddress(clinic.address);
  // custom_type is freetext (shown as-is); the `type` enum is localized via the
  // shared catalog (facilityTypes.<enum>), with a graceful fallback.
  const typeKey = clinic.type ? (`facilityTypes.${clinic.type}` as Parameters<typeof t>[0]) : null;
  const typeLabel = typeKey ? (t(typeKey) === typeKey ? null : t(typeKey)) : null;
  const kind = clinic.custom_type || typeLabel || (ar ? "عيادة" : "Clinic");
  const contacts = [
    address && { icon: "📍", label: address, href: undefined },
    clinic.phone && { icon: "📞", label: clinic.phone, href: `tel:${clinic.phone}` },
    clinic.email && { icon: "✉️", label: clinic.email, href: `mailto:${clinic.email}` },
    clinic.website && { icon: "🌐", label: clinic.website, href: clinic.website },
  ].filter(Boolean) as { icon: string; label: string; href?: string }[];

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">

      {/* Back bar */}
      <div className="bg-white dark:bg-[#0d0820] border-b border-[#e7dcee] dark:border-[#2a1840] px-6 py-4 sticky top-0 z-10">
        <div className={`max-w-3xl mx-auto flex items-center justify-between gap-3 ${ar ? "flex-row-reverse" : ""}`}>
          <Link href="/dashboard/find-doctors"
            className={`inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 hover:text-[#2E1A47] dark:hover:text-[#DFC8E7] transition-colors no-underline ${ar ? "flex-row-reverse" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            {ar ? "العودة إلى قائمة الأطباء" : "Back to Find Doctors"}
          </Link>
          <FavouriteButton targetId={clinic.id} targetType="facility" />
        </div>
      </div>

      {/* Hero */}
      <section className="py-10 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-start gap-5 mb-5 ${ar ? "flex-row-reverse" : ""}`}>
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 bg-gradient-to-br from-[#d5e8f5] to-[#ede0f8]">🏥</div>
            <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
              <div className={`flex items-center gap-2 flex-wrap mb-1.5 ${ar ? "flex-row-reverse" : ""}`}>
                <h1 className="font-black text-white text-xl leading-tight">{clinic.name}</h1>
                {clinic.is_verified && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    {ar ? "موثّقة" : "Verified"}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/60 capitalize">{kind}</p>
            </div>
          </div>
          <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
            <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80">
              <span className="text-amber-400">★</span> {(clinic.rating ?? 0).toFixed(1)}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>({clinic.review_count ?? 0} {ar ? "تقييم" : "reviews"})</span>
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80">
              {doctors.length} {ar ? "طبيب" : doctors.length === 1 ? "doctor" : "doctors"}
            </span>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {clinic.description && (
          <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
            <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-3 ${ar ? "text-right" : ""}`}>{ar ? "نبذة" : "About"}</p>
            <p className={`text-sm text-[#2E1A47]/65 dark:text-[#DFC8E7]/65 leading-relaxed ${ar ? "text-right" : ""}`}>{clinic.description}</p>
          </section>
        )}

        {contacts.length > 0 && (
          <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6 space-y-3">
            <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 ${ar ? "text-right" : ""}`}>{ar ? "معلومات التواصل" : "Contact"}</p>
            {contacts.map((c, i) => (
              <div key={i} className={`flex items-center gap-3 ${ar ? "flex-row-reverse text-right" : ""}`}>
                <span className="text-base flex-shrink-0">{c.icon}</span>
                {c.href
                  ? <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-sm text-[#46255f] dark:text-[#DFC8E7]/80 hover:underline break-all">{c.label}</a>
                  : <span className="text-sm text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 break-all">{c.label}</span>}
              </div>
            ))}
          </section>
        )}

        {clinic.services && clinic.services.length > 0 && (
          <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
            <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4 ${ar ? "text-right" : ""}`}>{ar ? "الخدمات" : "Services"}</p>
            <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
              {clinic.services.map((s) => (
                <span key={s} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/65 dark:text-[#DFC8E7]/65">{s}</span>
              ))}
            </div>
          </section>
        )}

        {clinic.accepted_insurances && clinic.accepted_insurances.length > 0 && (
          <section className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-6">
            <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4 ${ar ? "text-right" : ""}`}>{ar ? "التأمين المقبول" : "Accepted Insurance"}</p>
            <div className={`flex flex-wrap gap-2 ${ar ? "flex-row-reverse" : ""}`}>
              {clinic.accepted_insurances.map((s) => (
                <span key={s} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/65 dark:text-[#DFC8E7]/65">{s}</span>
              ))}
            </div>
          </section>
        )}

        {/* Doctors at this clinic */}
        <section>
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4 ${ar ? "text-right" : ""}`}>
            {ar ? "الأطباء في هذه العيادة" : "Doctors at this clinic"}
          </p>
          {doctors.length === 0 ? (
            <div className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-8 text-center">
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45">{ar ? "لا يوجد أطباء مدرجون لهذه العيادة بعد." : "No doctors listed for this clinic yet."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {doctors.map((d, i) => {
                return (
                  <Link key={d.id} href={`/dashboard/find-doctors/${d.id}`}
                    className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 no-underline block">
                    <div className={`flex items-start gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${GRADS[i % GRADS.length]} text-[#2E1A47]`}>
                        {initialsOf(d.full_name)}
                      </div>
                      <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                        {/* No availability badge here: it used to read the runtime
                            `doctors.status` flag (no writer anywhere — always
                            "unavailable"), so every doctor showed a false "Unavailable".
                            Slot-based availability is shown on the doctor page. */}
                        <div className={`flex items-center gap-2 mb-0.5 ${ar ? "flex-row-reverse" : ""}`}>
                          <p className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] truncate">{d.full_name}</p>
                        </div>
                        <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold">{d.specialty ?? (ar ? "طب عام" : "General Medicine")}</p>
                        <div className={`flex items-center gap-2 mt-1.5 text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 ${ar ? "flex-row-reverse" : ""}`}>
                          <span><span className="text-amber-400">★</span> {d.avg_rating ?? 0}</span>
                          <span className="text-[#2E1A47]/20 dark:text-[#DFC8E7]/20">·</span>
                          <span className="font-bold text-[#2E1A47] dark:text-[#DFC8E7]">{ar ? `${feeOf(d.fees)} ر.ع.` : `OMR ${feeOf(d.fees)}`}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
