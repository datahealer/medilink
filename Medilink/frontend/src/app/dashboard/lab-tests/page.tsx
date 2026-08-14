"use client";

/*
 * Lab Tests — NOT AVAILABLE.
 *
 * This page previously rendered a hardcoded `LABS` catalogue: eight named tests with
 * invented prices (18–55 OMR), invented provider ratings (4.7–4.9), invented turnaround
 * times and a working booking modal with a mini-calendar and generated time slots. None of
 * it was backed by anything — `filtered = LABS.filter(...)` read a literal array, and the
 * modal's "confirm" wrote nowhere.
 *
 * There is no lab-test catalogue or ordering backend in this project: no table, no RPC, no
 * API route. A patient could not distinguish this page from the genuinely backend-driven
 * pages beside it, so it advertised medical services at prices nobody set and appointments
 * nobody would honour.
 *
 * Rather than invent a backend, the feature is disabled and says so. The route is kept so
 * existing links and bookmarks land somewhere honest instead of a 404, and so the work is
 * easy to resume: restore this page from git history once a real catalogue exists.
 *
 * Removed with it: the two dashboard entry cards, the DashboardNav link, and the
 * LAB_TESTS_INDEX mirror in SiteSearch — otherwise search would still surface test names
 * the app cannot deliver.
 */
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

export default function LabTestsPage() {
  const { locale } = useI18n();
  const isAr = locale === "ar";

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-2xl px-5 py-16 text-center">
      <div className="mb-6 text-5xl" aria-hidden="true">🔬</div>

      <h1 className="mb-3 text-2xl font-semibold text-[#2E1A47] dark:text-[#DFC8E7]">
        {isAr ? "التحاليل المخبرية غير متاحة بعد" : "Lab tests aren’t available yet"}
      </h1>

      <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-[#2E1A47]/70 dark:text-[#DFC8E7]/70">
        {isAr
          ? "لا يمكنك حجز التحاليل المخبرية عبر ميدي لينك في الوقت الحالي. للحصول على تحليل مخبري، يُرجى حجز موعد مع طبيب وسيقوم بطلب التحاليل اللازمة."
          : "You can’t book lab tests through MediLink yet. To arrange one, book an appointment with a doctor and they’ll order the tests you need."}
      </p>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/dashboard/find-doctors"
          className="rounded-xl bg-[#2E1A47] px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          {isAr ? "ابحث عن طبيب" : "Find a doctor"}
        </Link>
        <Link
          href="/dashboard/records"
          className="text-sm text-[#2E1A47]/60 underline underline-offset-4 dark:text-[#DFC8E7]/60"
        >
          {isAr ? "عرض نتائج التحاليل السابقة" : "View your existing lab results"}
        </Link>
      </div>
    </main>
  );
}
