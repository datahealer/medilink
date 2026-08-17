"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@medilink/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { backendJson } from "@/lib/backendFetch";
import { useI18n } from "@/i18n/I18nProvider";

/* Thawani redirects the hosted-checkout browser here:
 *   {APP_URL}/payment-success?appointment_id=...
 * This page calls the BACKEND verify endpoint, which asks Thawani for the
 * authoritative payment status and (if paid) finalizes payments→paid /
 * appointments→confirmed — the same result the webhook produces (idempotent).
 * The frontend NEVER updates status itself; it only renders the returned recap. */

type Recap = {
  amount: number | null;
  currency: string | null;
  status: string | null;
  method: string | null;
  invoiceUrl: string | null;
  appointment: {
    slot_date: string | null;
    slot_start: string | null;
    doctor: { full_name: string | null; specialty: string | null } | null;
    facility: { name: string | null } | null;
    fee_omr: number | null;
  } | null;
};

const MONTH_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(ymd: string | null): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTH_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function fmtTime(hhmmss: string | null): string {
  if (!hhmmss) return "";
  const [hRaw, m = "00"] = hhmmss.split(":");
  let h = parseInt(hRaw ?? "0", 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}
function methodLabel(method: string | null): string {
  if (!method) return "Thawani Pay";
  const m = method.toLowerCase();
  if (m.includes("thawani")) return "Thawani Pay";
  if (m.includes("card")) return "Card";
  return method;
}

function PaymentSuccessInner() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const params = useSearchParams();
  const appointmentId = params.get("appointment_id");

  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(false);

  // Verify + finalize on the backend, then render the recap it returns.
  useEffect(() => {
    if (!appointmentId) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        // Session attached via backendJson — the backend is a separate origin, so cookies
        // alone leave this 401 and the patient sees "processing" forever after a real
        // payment. See lib/backendFetch.ts.
        const { res, data: json } = await backendJson<{ payment?: Recap }>(
          "/api/payments/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointment_id: appointmentId }),
          }
        );
        if (active && res.ok && json?.payment) setRecap(json.payment as Recap);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [appointmentId]);

  const appt = recap?.appointment ?? null;
  const amount = recap?.amount ?? appt?.fee_omr ?? null;
  // Thawani can redirect here even on a declined/failed payment — only Thawani's own
  // "paid" status (verified server-side) may confirm the appointment. Anything else
  // must not claim success, and the reserved slot should be released back on cancel.
  const paid = recap?.status === "paid";

  async function releaseSlot() {
    if (!appointmentId || releasing) return;
    setReleasing(true);
    const supabase = createBrowserSupabaseClient();
    await api.appointments
      .cancelAppointment(supabase, appointmentId, { reason: "Payment not completed", skipCutoff: true })
      .catch(() => {});
    setReleasing(false);
    setReleased(true);
  }

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen flex items-center justify-center bg-[#f9f4fa] dark:bg-[#0f0a1e] text-[#2E1A47] dark:text-[#DFC8E7] px-4 py-10">
      <div className="bg-white dark:bg-[#1a1030] rounded-3xl px-7 pt-8 pb-8 max-w-4xl w-full text-center border border-[#e7dcee] dark:border-[#3a2560] shadow-2xl">
        {loading ? (
          <p className="py-16 text-sm font-semibold text-[#2E1A47]/40 dark:text-[#DFC8E7]/40 animate-pulse">
            {ar ? "جارٍ تأكيد الدفع…" : "Confirming your payment…"}
          </p>
        ) : !paid ? (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-4xl mx-auto mb-4">⚠️</div>
            <h1 className="font-black font-serif text-2xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
              {ar ? "لم تكتمل عملية الدفع" : "Payment Not Completed"}
            </h1>
            <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mb-6">
              {released
                ? (ar ? "تم إلغاء الحجز وإتاحة الموعد من جديد." : "The appointment has been cancelled and the slot released.")
                : (ar ? "لم نتمكن من تأكيد دفعتك. لم يتم تأكيد الموعد بعد." : "We couldn't confirm your payment, so this appointment hasn't been confirmed.")}
            </p>

            <div className="flex flex-col gap-2">
              {!released && (
                <button
                  onClick={releaseSlot}
                  disabled={releasing}
                  className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                  {releasing ? (ar ? "جارٍ الإلغاء…" : "Cancelling…") : (ar ? "إلغاء الحجز وتحرير الموعد" : "Cancel & Release Slot")}
                </button>
              )}
              <Link href="/dashboard/find-doctors"
                className="w-full py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all no-underline">
                {ar ? "احجز موعداً جديداً" : "Book Another Appointment"}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
            <h1 className="font-black font-serif text-2xl text-[#2E1A47] dark:text-[#DFC8E7] mb-1">
              {ar ? "تم تأكيد الموعد!" : "Appointment Confirmed!"}
            </h1>
            <p className="text-sm text-[#2E1A47]/55 dark:text-[#DFC8E7]/55 mb-6">
              {ar ? "تم استلام دفعتك وتأكيد موعدك." : "Your payment was received and your appointment is confirmed."}
            </p>

            {recap ? (
              <div className={`bg-[#faf8fc] dark:bg-[#0d0820] rounded-2xl p-5 mb-6 text-left border border-[#e7dcee] dark:border-[#2a1840] space-y-2.5 ${ar ? "text-right" : ""}`}>
                {[
                  { l: ar ? "الطبيب" : "Doctor",         v: appt?.doctor?.full_name ?? "" },
                  { l: ar ? "التاريخ والوقت" : "Date & Time", v: `${fmtDate(appt?.slot_date ?? null)} · ${fmtTime(appt?.slot_start ?? null)}` },
                  { l: ar ? "المبلغ المدفوع" : "Amount paid", v: `${recap.currency ?? "OMR"} ${(amount ?? 0).toFixed(3)}` },
                  { l: ar ? "طريقة الدفع" : "Payment method", v: methodLabel(recap.method) },
                ].map(row => (
                  <div key={row.l} className={`flex justify-between items-start gap-4 ${ar ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 flex-shrink-0">{row.l}</span>
                    <span className="text-xs font-semibold text-[#2E1A47] dark:text-[#DFC8E7] text-right">{row.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#2E1A47]/45 dark:text-[#DFC8E7]/45 mb-6">
                {ar ? "تم تأكيد الدفع. يمكنك عرض التفاصيل في مواعيدك." : "Payment confirmed. You can view the details in your appointments."}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Link href="/dashboard/appointments"
                className="w-full py-3 rounded-xl font-bold text-sm text-[#2E1A47] no-underline"
                style={{ background: "linear-gradient(135deg, #e8d5f0, #DFC8E7 50%, #c8dff0)" }}>
                {ar ? "عرض مواعيدي" : "View My Appointments"}
              </Link>
              <Link href="/dashboard/payments"
                className="w-full py-3 rounded-xl font-bold text-sm border border-[#e7dcee] dark:border-[#3a2560] text-[#2E1A47]/70 dark:text-[#DFC8E7]/70 hover:border-[#2E1A47]/30 hover:bg-[#f0e8f8] dark:hover:bg-[#2E1A47]/20 transition-all no-underline">
                {ar ? "الفاتورة والمدفوعات" : "Invoice & Payments"}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessInner />
    </Suspense>
  );
}
