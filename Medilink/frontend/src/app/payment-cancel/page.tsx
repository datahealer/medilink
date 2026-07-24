"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";

/* Thawani redirects here when the patient cancels or abandons checkout:
 *   {APP_URL}/payment-cancel?appointment_id=...
 * The appointment was created as "pending" (which reserves the slot) before checkout
 * even started, so without this page the slot would stay reserved forever even though
 * payment never happened. Cancel it immediately to release the slot back to other patients. */

function PaymentCancelInner() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const params = useSearchParams();
  const appointmentId = params.get("appointment_id");

  const [releasing, setReleasing] = useState(true);

  useEffect(() => {
    if (!appointmentId) { setReleasing(false); return; }
    let active = true;
    const supabase = createBrowserSupabaseClient();
    api.appointments
      .cancelAppointment(supabase, appointmentId, { reason: "Payment not completed", skipCutoff: true })
      .catch(() => {}) // best-effort — appointment may already be cancelled/confirmed elsewhere
      .finally(() => { if (active) setReleasing(false); });
    return () => { active = false; };
  }, [appointmentId]);

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] px-4 py-10">
      <div className="bg-white dark:bg-[#1a1030] rounded-3xl px-7 pt-8 pb-8 max-w-4xl w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl">
        {releasing ? (
          <p className="py-16 text-sm font-semibold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 animate-pulse">
            {ar ? "جارٍ إلغاء الحجز…" : "Releasing your slot…"}
          </p>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-4xl mx-auto mb-4">⚠️</div>
            <h1 className="font-black font-serif text-2xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
              {ar ? "تم إلغاء الدفع" : "Payment Cancelled"}
            </h1>
            <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mb-6">
              {ar
                ? "لم يتم إتمام الدفع، لذا تم إلغاء حجز هذا الموعد وإتاحته من جديد. يمكنك حجز موعد في أي وقت."
                : "Your payment wasn't completed, so this appointment slot has been released. You can book again anytime."}
            </p>

            <div className="flex flex-col gap-2">
              <Link href="/dashboard/find-doctors"
                className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] no-underline"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {ar ? "احجز موعداً جديداً" : "Book Another Appointment"}
              </Link>
              <Link href="/dashboard/appointments"
                className="w-full py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all no-underline">
                {ar ? "عرض مواعيدي" : "View My Appointments"}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense fallback={null}>
      <PaymentCancelInner />
    </Suspense>
  );
}
