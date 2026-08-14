"use client";

/*
 * Surgeries — NOT AVAILABLE.
 *
 * This page previously rendered a hardcoded `SURGERIES` catalogue: named procedures with
 * invented prices (650–4,500 OMR), invented hospital names, invented surgeon ratings and a
 * working "request consultation" modal. Nothing was backed by a table, RPC or API route —
 * `filtered = SURGERIES.filter(...)` read a literal array.
 *
 * Quoting a patient 4,500 OMR for cardiac surgery that no clinic has priced, from a
 * provider that may not offer it, is the most consequential version of this problem in the
 * product. It is disabled rather than reimplemented, because the honest fix is a real
 * catalogue owned by the clinics, not a better-looking placeholder.
 *
 * The route is kept so existing links land somewhere truthful instead of a 404. Restore
 * from git history when a real surgical-services backend exists.
 *
 * Removed with it: the dashboard entry card, the DashboardNav link, and the
 * SURGERIES_INDEX mirror in SiteSearch.
 */
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

export default function SurgeriesPage() {
  const { locale } = useI18n();
  const isAr = locale === "ar";

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-2xl px-5 py-16 text-center">
      <div className="mb-6 text-5xl" aria-hidden="true">🏥</div>

      <h1 className="mb-3 text-2xl font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">
        {isAr ? "خدمات العمليات الجراحية غير متاحة بعد" : "Surgical services aren’t available yet"}
      </h1>

      <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">
        {isAr
          ? "لا يمكنك طلب استشارة جراحية عبر ميدي لينك في الوقت الحالي. يُرجى حجز موعد مع طبيب مختص لمناقشة الخيارات الجراحية والتكاليف."
          : "You can’t request a surgical consultation through MediLink yet. Please book an appointment with a specialist to discuss surgical options and costs."}
      </p>

      <Link
        href="/dashboard/find-doctors"
        className="inline-block rounded-xl bg-[#2E1A47] px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        {isAr ? "ابحث عن أخصائي" : "Find a specialist"}
      </Link>
    </main>
  );
}
