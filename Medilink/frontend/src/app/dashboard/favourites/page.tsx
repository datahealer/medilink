"use client";

/*
 * Favourites — lists the patient's saved doctors and clinics.
 * Reads via the shared RLS API (api.favourites.listFavourites) and resolves
 * names from the doctors/facilities tables. Backend + table already exist.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { api } from "@medilink/shared";
import { FavouriteButton } from "@/components/dashboard/FavouriteButton";

type FavDoctor = { id: string; full_name: string; specialty: string | null; avg_rating: number | null };
type FavFacility = { id: string; name: string };

const GRADS = [
  "from-[#e8d5f0] to-[#d5e8f5]", "from-[#d5e8f5] to-[#ede0f8]",
  "from-[#ede0f8] to-[#e8d5f0]", "from-[#d1fae5] to-[#d5e8f5]",
];

function initialsOf(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
}

export default function FavouritesPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [doctors, setDoctors] = useState<FavDoctor[]>([]);
  const [facilities, setFacilities] = useState<FavFacility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const favs = await api.favourites.listFavourites(supabase);
        const doctorIds = favs.filter(f => f.target_type === "doctor").map(f => f.target_id);
        const facilityIds = favs.filter(f => f.target_type === "facility").map(f => f.target_id);

        const [docRes, facRes] = await Promise.all([
          doctorIds.length
            ? supabase.from("doctors").select("id, full_name, specialty, avg_rating").in("id", doctorIds)
            : Promise.resolve({ data: [] as FavDoctor[] }),
          facilityIds.length
            ? supabase.from("facilities").select("id, name").in("id", facilityIds)
            : Promise.resolve({ data: [] as FavFacility[] }),
        ]);
        if (cancelled) return;
        setDoctors((docRes.data ?? []) as FavDoctor[]);
        setFacilities((facRes.data ?? []) as FavFacility[]);
      } catch {
        if (!cancelled) { setDoctors([]); setFacilities([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const empty = !loading && doctors.length === 0 && facilities.length === 0;

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7]">
      <section className="py-12 px-6" style={{ background: "linear-gradient(140deg, #1e1038 0%, #2E1A47 55%, #1e1038 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(223,200,231,0.45)" }}>
            {ar ? "المفضلة" : "Favourites"}
          </p>
          <h1 className="font-black font-serif text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", lineHeight: 1.1 }}>
            {ar ? "أطباؤك وعياداتك المحفوظة" : "Your saved doctors & clinics"}
          </h1>
        </div>
      </section>

      <section className="py-10 px-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-[#46255f]/20 border-t-[#46255f] dark:border-[#DFC8E7]/20 dark:border-t-[#DFC8E7] animate-spin" />
            </div>
          ) : empty ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">💜</p>
              <p className="font-bold text-[#2E1A47] dark:text-[#DFC8E7] mb-2">{ar ? "لا توجد مفضلات بعد" : "No favourites yet"}</p>
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-5">
                {ar ? "احفظ الأطباء والعيادات للوصول السريع إليهم." : "Save doctors and clinics for quick access."}
              </p>
              <Link href="/dashboard/find-doctors" className="inline-block px-5 py-2.5 rounded-xl font-bold text-sm text-[#2E1A47]"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {ar ? "ابحث عن طبيب" : "Find a doctor"}
              </Link>
            </div>
          ) : (
            <div className="space-y-10">
              {doctors.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
                    {ar ? "الأطباء" : "Doctors"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {doctors.map((d, i) => (
                      <div key={d.id} className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5">
                        <div className={`flex items-start gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                          <Link href={`/dashboard/find-doctors/${d.id}`} className={`flex items-start gap-4 flex-1 min-w-0 no-underline ${ar ? "flex-row-reverse" : ""}`}>
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-gradient-to-br ${GRADS[i % GRADS.length]} text-[#2E1A47]`}>
                              {initialsOf(d.full_name)}
                            </div>
                            <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                              <p className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] leading-snug">{d.full_name}</p>
                              <p className="text-xs text-[#46255f] dark:text-[#DFC8E7]/70 font-semibold">{d.specialty ?? (ar ? "طب عام" : "General Medicine")}</p>
                              {d.avg_rating != null && (
                                <p className="text-xs text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mt-1"><span className="text-amber-400">★</span> {Number(d.avg_rating).toFixed(1)}</p>
                              )}
                            </div>
                          </Link>
                          <FavouriteButton targetId={d.id} targetType="doctor" size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {facilities.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#2E1A47]/35 dark:text-[#DFC8E7]/35 mb-4">
                    {ar ? "العيادات" : "Clinics"}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {facilities.map(f => (
                      <div key={f.id} className="bg-white dark:bg-[#1a1030] rounded-2xl border border-[#e7dcee] dark:border-[#3a2560] p-5">
                        <div className={`flex items-start gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                          <Link href={`/dashboard/clinics/${f.id}`} className={`flex items-start gap-4 flex-1 min-w-0 no-underline ${ar ? "flex-row-reverse" : ""}`}>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-gradient-to-br from-[#d5e8f5] to-[#ede0f8]">🏥</div>
                            <div className={`flex-1 min-w-0 ${ar ? "text-right" : ""}`}>
                              <p className="font-bold text-sm text-[#2E1A47] dark:text-[#DFC8E7] leading-snug">{f.name}</p>
                            </div>
                          </Link>
                          <FavouriteButton targetId={f.id} targetType="facility" size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
